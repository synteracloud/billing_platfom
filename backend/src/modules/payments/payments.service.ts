import { BadRequestException, ConflictException, Injectable, NotFoundException } from '@nestjs/common';
import { FinancialTransactionManager, TransactionParticipant } from '../../common/transactions/financial-transaction.manager';
import { CustomersService } from '../customers/customers.service';
import { EventsService } from '../events/events.service';
import { InvoicesRepository } from '../invoices/invoices.repository';
import { InvoiceEntity } from '../invoices/entities/invoice.entity';
import { AllocatePaymentDto } from './dto/allocate-payment.dto';
import { CreatePaymentDto } from './dto/create-payment.dto';
import { PaymentAllocationEntity } from './entities/payment-allocation.entity';
import { PaymentEntity } from './entities/payment.entity';
import { PaymentsRepository } from './payments.repository';

type PaymentDetails = PaymentEntity & {
  allocations: PaymentAllocationEntity[];
};

@Injectable()
export class PaymentsService {
  constructor(
    private readonly paymentsRepository: PaymentsRepository,
    private readonly invoicesRepository: InvoicesRepository,
    private readonly customersService: CustomersService,
    private readonly eventsService: EventsService,
    private readonly transactionManager: FinancialTransactionManager
  ) {}

  listPayments(tenantId: string): PaymentDetails[] {
    return this.paymentsRepository.listByTenant(tenantId).map((payment) => this.buildPaymentDetails(tenantId, payment));
  }

  createPayment(tenantId: string, data: CreatePaymentDto, idempotencyKey?: string): PaymentDetails {
    this.validateCreatePayload(data);
    this.customersService.getCustomer(tenantId, data.customer_id);

      const payment = this.paymentsRepository.create({
      tenant_id: tenantId,
      customer_id: data.customer_id,
      payment_reference: data.payment_reference?.trim() || null,
      payment_date: data.payment_date,
      currency: data.currency.trim().toUpperCase(),
      amount_received_minor: data.amount_received_minor,
      allocated_minor: 0,
      unallocated_minor: data.amount_received_minor,
      payment_method: data.payment_method.trim(),
      status: 'recorded',
      metadata: data.metadata ?? null
    });

    if (data.allocations && data.allocations.length > 0) {
      this.allocatePayment(tenantId, payment.id, { allocations: data.allocations }, idempotencyKey);
    }

      this.eventsService.logEvent({
      tenant_id: tenantId,
      event_type: 'payment_recorded',
      event_category: 'financial',
      entity_type: 'payment',
      entity_id: payment.id,
      actor_type: 'system',
      payload: { amount_received_minor: payment.amount_received_minor },
      idempotency_key: idempotencyKey ?? null
    });

      return this.getPayment(tenantId, payment.id);
    }, this.financialParticipants());
  }

  getPayment(tenantId: string, paymentId: string): PaymentDetails {
    const payment = this.paymentsRepository.findById(tenantId, paymentId);
    if (!payment) {
      throw new NotFoundException('Payment not found');
    }

    return this.buildPaymentDetails(tenantId, payment);
  }

  allocatePayment(tenantId: string, paymentId: string, data: AllocatePaymentDto, idempotencyKey?: string): PaymentDetails {
    const payment = this.requireAllocatablePayment(tenantId, paymentId);
    this.validateAllocatePayload(data);

      const alreadyAllocated = this.paymentsRepository.sumAllocatedForPayment(tenantId, paymentId);
      const requestedTotal = data.allocations.reduce((sum, item) => sum + item.allocated_minor, 0);
      if (alreadyAllocated + requestedTotal > payment.amount_received_minor) {
        throw new ConflictException('Allocated total must not exceed payment amount');
      }

      for (const item of data.allocations) {
        const invoice = this.requireAllocatableInvoice(tenantId, item.invoice_id, payment);
        const invoiceAllocated = this.paymentsRepository.sumAllocatedForInvoice(tenantId, invoice.id);
        const invoiceOutstanding = invoice.total_minor - invoiceAllocated;
        if (item.allocated_minor > invoiceOutstanding) {
          throw new ConflictException('Allocated total must not exceed invoice outstanding balance');
        }
      }

      const touchedInvoiceIds = new Set<string>();
      for (const item of data.allocations) {
        this.paymentsRepository.createAllocation({
        tenant_id: tenantId,
        payment_id: paymentId,
        invoice_id: item.invoice_id,
        allocated_minor: item.allocated_minor,
        allocation_date: item.allocation_date ?? new Date().toISOString().slice(0, 10),
        metadata: null
      });
        touchedInvoiceIds.add(item.invoice_id);
      }

      this.refreshPaymentAllocationBalance(tenantId, paymentId);

      for (const invoiceId of touchedInvoiceIds) {
        this.syncInvoicePaymentStatus(tenantId, invoiceId);
      }

      this.eventsService.logEvent({
      tenant_id: tenantId,
      event_type: 'payment_allocated',
      event_category: 'financial',
      entity_type: 'payment',
      entity_id: paymentId,
      actor_type: 'system',
      payload: { allocations: data.allocations.length },
      idempotency_key: idempotencyKey ?? null
    });

      return this.getPayment(tenantId, paymentId);
    }, this.financialParticipants());
  }

  voidPayment(tenantId: string, paymentId: string, idempotencyKey?: string): PaymentDetails {
    const payment = this.getPaymentRecord(tenantId, paymentId);
    if (payment.status === 'void') {
      return this.getPayment(tenantId, paymentId);
    }

      const removedAllocations = this.paymentsRepository.deleteAllocationsByPayment(tenantId, paymentId);
      this.paymentsRepository.update(tenantId, paymentId, {
        status: 'void',
        allocated_minor: 0,
        unallocated_minor: payment.amount_received_minor
      });

      const touchedInvoiceIds = new Set(removedAllocations.map((allocation) => allocation.invoice_id));
      for (const invoiceId of touchedInvoiceIds) {
        this.syncInvoicePaymentStatus(tenantId, invoiceId);
      }

      this.eventsService.logEvent({
      tenant_id: tenantId,
      event_type: 'payment_voided',
      event_category: 'financial',
      entity_type: 'payment',
      entity_id: paymentId,
      actor_type: 'system',
      payload: {},
      idempotency_key: idempotencyKey ?? null
    });

      return this.getPayment(tenantId, paymentId);
    }, this.financialParticipants());
  }

  private financialParticipants(): TransactionParticipant[] {
    return [
      {
        key: 'payments',
        snapshot: () => this.paymentsRepository.createSnapshot(),
        restore: (snapshot) => this.paymentsRepository.restoreSnapshot(snapshot as ReturnType<PaymentsRepository['createSnapshot']>)
      },
      {
        key: 'invoices',
        snapshot: () => this.invoicesRepository.createSnapshot(),
        restore: (snapshot) => this.invoicesRepository.restoreSnapshot(snapshot as ReturnType<InvoicesRepository['createSnapshot']>)
      },
      {
        key: 'events',
        snapshot: () => this.eventsService.createSnapshot(),
        restore: (snapshot) => this.eventsService.restoreSnapshot(snapshot as ReturnType<EventsService['createSnapshot']>)
      }
    ];
  }

  private refreshPaymentAllocationBalance(tenantId: string, paymentId: string): void {
    const payment = this.getPaymentRecord(tenantId, paymentId);
    const allocatedMinor = this.paymentsRepository.sumAllocatedForPayment(tenantId, paymentId);

    this.paymentsRepository.update(tenantId, paymentId, {
      allocated_minor: allocatedMinor,
      unallocated_minor: payment.amount_received_minor - allocatedMinor
    });
  }

  private syncInvoicePaymentStatus(tenantId: string, invoiceId: string): void {
    const invoice = this.invoicesRepository.findById(tenantId, invoiceId);
    if (!invoice || invoice.status === 'void') {
      return;
    }

    const allocated = this.paymentsRepository.sumAllocatedForInvoice(tenantId, invoiceId);
    const paidMinor = Math.min(allocated, invoice.total_minor);
    const dueMinor = Math.max(0, invoice.total_minor - paidMinor);

    let nextStatus: InvoiceEntity['status'];
    if (paidMinor <= 0) {
      nextStatus = 'issued';
    } else if (dueMinor === 0) {
      nextStatus = 'paid';
    } else {
      nextStatus = 'partially_paid';
    }

    this.invoicesRepository.update(tenantId, invoiceId, {
      status: nextStatus,
      amount_paid_minor: paidMinor,
      amount_due_minor: dueMinor
    });
  }

  private buildPaymentDetails(tenantId: string, payment: PaymentEntity): PaymentDetails {
    const allocations = this.paymentsRepository.listAllocationsByPayment(tenantId, payment.id);

    return {
      ...payment,
      allocations
    };
  }

  private requireAllocatablePayment(tenantId: string, paymentId: string): PaymentEntity {
    const payment = this.getPaymentRecord(tenantId, paymentId);
    if (payment.status !== 'recorded' && payment.status !== 'settled') {
      throw new ConflictException('Only active payments can be allocated');
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

    if (!Number.isFinite(data.amount_received_minor) || data.amount_received_minor < 0) {
      throw new BadRequestException('amount_received_minor must be greater than or equal to 0');
    }

    if (!data.currency || data.currency.trim().length !== 3) {
      throw new BadRequestException('currency must be a 3-letter ISO code');
    }

    if (!data.payment_method || data.payment_method.trim().length === 0) {
      throw new BadRequestException('payment_method is required');
    }

    if (Number.isNaN(new Date(data.payment_date).getTime())) {
      throw new BadRequestException('payment_date must be a valid date');
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

      if (!Number.isFinite(allocation.allocated_minor) || allocation.allocated_minor <= 0) {
        throw new BadRequestException('allocated_minor must be greater than 0');
      }
    }
  }
}
