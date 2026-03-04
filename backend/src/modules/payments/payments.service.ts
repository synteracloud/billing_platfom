import {
  BadRequestException,
  ConflictException,
  Injectable,
  NotFoundException
} from '@nestjs/common';
import { CustomersService } from '../customers/customers.service';
import { InvoicesRepository } from '../invoices/invoices.repository';
import { InvoiceEntity } from '../invoices/entities/invoice.entity';
import { AllocatePaymentDto } from './dto/allocate-payment.dto';
import { CreatePaymentDto } from './dto/create-payment.dto';
import { PaymentAllocationEntity } from './entities/payment-allocation.entity';
import { PaymentEntity } from './entities/payment.entity';
import { PaymentsRepository } from './payments.repository';

type PaymentDetails = PaymentEntity & {
  allocations: PaymentAllocationEntity[];
  allocated_minor: number;
  unallocated_minor: number;
};

@Injectable()
export class PaymentsService {
  constructor(
    private readonly paymentsRepository: PaymentsRepository,
    private readonly invoicesRepository: InvoicesRepository,
    private readonly customersService: CustomersService
  ) {}

  listPayments(tenantId: string): PaymentDetails[] {
    return this.paymentsRepository.listByTenant(tenantId).map((payment) => this.buildPaymentDetails(tenantId, payment));
  }

  createPayment(tenantId: string, data: CreatePaymentDto): PaymentDetails {
    this.validateCreatePayload(data);
    this.customersService.getCustomer(tenantId, data.customer_id);

    const payment = this.paymentsRepository.create({
      tenant_id: tenantId,
      customer_id: data.customer_id,
      amount_minor: data.amount_minor,
      currency: data.currency.trim().toUpperCase(),
      payment_method: data.payment_method.trim(),
      reference: data.reference?.trim() || null,
      status: 'recorded',
      metadata: data.metadata ?? null
    });

    return this.buildPaymentDetails(tenantId, payment);
  }

  getPayment(tenantId: string, paymentId: string): PaymentDetails {
    const payment = this.paymentsRepository.findById(tenantId, paymentId);
    if (!payment) {
      throw new NotFoundException('Payment not found');
    }

    return this.buildPaymentDetails(tenantId, payment);
  }

  allocatePayment(tenantId: string, paymentId: string, data: AllocatePaymentDto): PaymentDetails {
    const payment = this.requireAllocatablePayment(tenantId, paymentId);
    this.validateAllocatePayload(data);

    const alreadyAllocated = this.paymentsRepository.sumAllocatedForPayment(tenantId, paymentId);
    const requestedTotal = data.allocations.reduce((sum, item) => sum + item.allocated_amount_minor, 0);
    if (alreadyAllocated + requestedTotal > payment.amount_minor) {
      throw new ConflictException('Allocated total must not exceed payment amount');
    }

    for (const item of data.allocations) {
      const invoice = this.requireAllocatableInvoice(tenantId, item.invoice_id, payment);
      const invoiceAllocated = this.paymentsRepository.sumAllocatedForInvoice(tenantId, invoice.id);
      const invoiceOutstanding = invoice.total_minor - invoiceAllocated;
      if (item.allocated_amount_minor > invoiceOutstanding) {
        throw new ConflictException('Allocated total must not exceed invoice outstanding balance');
      }
    }

    const touchedInvoiceIds = new Set<string>();
    for (const item of data.allocations) {
      this.paymentsRepository.createAllocation({
        tenant_id: tenantId,
        payment_id: paymentId,
        invoice_id: item.invoice_id,
        allocated_amount_minor: item.allocated_amount_minor
      });
      touchedInvoiceIds.add(item.invoice_id);
    }

    for (const invoiceId of touchedInvoiceIds) {
      this.syncInvoicePaymentStatus(tenantId, invoiceId);
    }

    return this.getPayment(tenantId, paymentId);
  }

  voidPayment(tenantId: string, paymentId: string): PaymentDetails {
    const payment = this.getPaymentRecord(tenantId, paymentId);
    if (payment.status === 'void') {
      return this.getPayment(tenantId, paymentId);
    }

    const removedAllocations = this.paymentsRepository.deleteAllocationsByPayment(tenantId, paymentId);
    this.paymentsRepository.update(tenantId, paymentId, { status: 'void' });

    const touchedInvoiceIds = new Set(removedAllocations.map((allocation) => allocation.invoice_id));
    for (const invoiceId of touchedInvoiceIds) {
      this.syncInvoicePaymentStatus(tenantId, invoiceId);
    }

    return this.getPayment(tenantId, paymentId);
  }

  private syncInvoicePaymentStatus(tenantId: string, invoiceId: string): void {
    const invoice = this.invoicesRepository.findById(tenantId, invoiceId);
    if (!invoice || invoice.status === 'void') {
      return;
    }

    const allocated = this.paymentsRepository.sumAllocatedForInvoice(tenantId, invoiceId);
    let nextStatus: InvoiceEntity['status'];
    if (allocated <= 0) {
      nextStatus = 'issued';
    } else if (allocated >= invoice.total_minor) {
      nextStatus = 'paid';
    } else {
      nextStatus = 'partially_paid';
    }

    if (invoice.status !== nextStatus) {
      this.invoicesRepository.update(tenantId, invoiceId, { status: nextStatus });
    }
  }

  private buildPaymentDetails(tenantId: string, payment: PaymentEntity): PaymentDetails {
    const allocations = this.paymentsRepository.listAllocationsByPayment(tenantId, payment.id);
    const allocatedMinor = allocations.reduce((sum, item) => sum + item.allocated_amount_minor, 0);

    return {
      ...payment,
      allocations,
      allocated_minor: allocatedMinor,
      unallocated_minor: payment.amount_minor - allocatedMinor
    };
  }

  private requireAllocatablePayment(tenantId: string, paymentId: string): PaymentEntity {
    const payment = this.getPaymentRecord(tenantId, paymentId);
    if (payment.status !== 'recorded') {
      throw new ConflictException('Only recorded payments can be allocated');
    }

    return payment;
  }

  private getPaymentRecord(tenantId: string, paymentId: string): PaymentEntity {
    const payment = this.paymentsRepository.findById(tenantId, paymentId);
    if (!payment) {
      throw new NotFoundException('Payment not found');
    }

    return payment;
  }

  private requireAllocatableInvoice(tenantId: string, invoiceId: string, payment: PaymentEntity): InvoiceEntity {
    const invoice = this.invoicesRepository.findById(tenantId, invoiceId);
    if (!invoice) {
      throw new NotFoundException(`Invoice not found: ${invoiceId}`);
    }

    if (invoice.customer_id !== payment.customer_id) {
      throw new ConflictException('Invoice must belong to the same customer as payment');
    }

    if (invoice.currency !== payment.currency) {
      throw new ConflictException('currency must match invoice currency when allocating');
    }

    if (invoice.status === 'void' || invoice.status === 'draft') {
      throw new ConflictException('Only issued invoices can receive payment allocations');
    }

    return invoice;
  }

  private validateCreatePayload(data: CreatePaymentDto): void {
    if (!data.customer_id || data.customer_id.trim().length === 0) {
      throw new BadRequestException('customer_id is required');
    }

    if (!Number.isFinite(data.amount_minor) || data.amount_minor < 0) {
      throw new BadRequestException('amount_minor must be greater than or equal to 0');
    }

    if (!data.currency || data.currency.trim().length !== 3) {
      throw new BadRequestException('currency must be a 3-letter ISO code');
    }

    if (!data.payment_method || data.payment_method.trim().length === 0) {
      throw new BadRequestException('payment_method is required');
    }
  }

  private validateAllocatePayload(data: AllocatePaymentDto): void {
    if (!Array.isArray(data.allocations) || data.allocations.length === 0) {
      throw new BadRequestException('allocations must be a non-empty array');
    }

    for (const allocation of data.allocations) {
      if (!allocation.invoice_id || allocation.invoice_id.trim().length === 0) {
        throw new BadRequestException('invoice_id is required for each allocation');
      }

      if (!Number.isFinite(allocation.allocated_amount_minor) || allocation.allocated_amount_minor <= 0) {
        throw new BadRequestException('allocated_amount_minor must be greater than 0');
      }
    }
  }
}
