import { BadRequestException, ConflictException, Injectable, NotFoundException } from '@nestjs/common';
import { FinancialStateValidator } from '../../common/transactions/financial-state.validator';
import { FinancialTransactionManager, TransactionParticipant } from '../../common/transactions/financial-transaction.manager';
import { CustomersService } from '../customers/customers.service';
import { EventsService } from '../events/events.service';
import { IdempotencyService } from '../idempotency/idempotency.service';
import { InvoicesRepository } from '../invoices/invoices.repository';
import { canTransitionInvoiceStatus, InvoiceEntity, InvoiceStatus } from '../invoices/entities/invoice.entity';
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
    private readonly idempotencyService: IdempotencyService,
    private readonly transactionManager: FinancialTransactionManager
  ) {}

  listPayments(tenantId: string): PaymentDetails[] {
    return this.paymentsRepository.listByTenant(tenantId).map((payment) => this.buildPaymentDetails(tenantId, payment));
  }

  async createPayment(tenantId: string, data: CreatePaymentDto, idempotencyKey?: string): Promise<PaymentDetails> {
    const key = this.requireIdempotencyKey(idempotencyKey, 'create payment');
    return this.runIdempotentPaymentOperation(tenantId, 'payments:create', key, () => this.transactionManager.wrapper(async () => {
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

      this.eventsService.logMutation({
        tenant_id: tenantId,
        entity_type: 'payment',
        entity_id: payment.id,
        action: 'created',
        aggregate_version: 1,
        correlation_id: payment.id,
        idempotency_key: idempotencyKey ? `${idempotencyKey}:audit:payment:create` : undefined,
        payload: { after: payment }
      });

      this.transactionManager.runAfterCommit(() => {
        this.eventsService.logEvent({
          tenant_id: tenantId,
          type: 'billing.payment.recorded.v1',
          aggregate_type: 'payment',
          aggregate_id: payment.id,
          aggregate_version: 1,
          correlation_id: payment.id,
          idempotency_key: idempotencyKey ? `${idempotencyKey}:event:payment:received` : undefined,
          action: 'received',
          payload: {
            payment_id: payment.id,
            customer_id: payment.customer_id,
            amount_minor: payment.amount_received_minor,
            currency_code: payment.currency,
            status: payment.status
          }
        });
      });

      if (data.allocations && data.allocations.length > 0) {
        await this.allocatePayment(tenantId, payment.id, { allocations: data.allocations }, idempotencyKey);
      }

      return this.getPayment(tenantId, payment.id);
    }, this.financialParticipants()));
  }

  getPayment(tenantId: string, paymentId: string): PaymentDetails {
    const payment = this.paymentsRepository.findById(tenantId, paymentId);
    if (!payment) {
      throw new NotFoundException('Payment not found');
    }

    return this.buildPaymentDetails(tenantId, payment);
  }

  async allocatePayment(tenantId: string, paymentId: string, data: AllocatePaymentDto, idempotencyKey?: string): Promise<PaymentDetails> {
    const key = this.requireIdempotencyKey(idempotencyKey, 'allocate payment');
    return this.runIdempotentPaymentOperation(tenantId, `payments:${paymentId}:allocate`, key, () => this.transactionManager.wrapper(async () => {
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
      let allocationVersion = this.paymentsRepository.listAllocationsByPayment(tenantId, paymentId).length;
      for (const item of data.allocations) {
        const createdAllocation = this.paymentsRepository.createAllocation({
          tenant_id: tenantId,
          payment_id: paymentId,
          invoice_id: item.invoice_id,
          allocated_minor: item.allocated_minor,
          allocation_date: item.allocation_date ?? new Date().toISOString().slice(0, 10),
          metadata: null
        });
        allocationVersion += 1;
        this.eventsService.logMutation({
          tenant_id: tenantId,
          entity_type: 'payment_allocation',
          entity_id: createdAllocation.id,
          action: 'created',
          aggregate_version: allocationVersion,
          correlation_id: paymentId,
          payload: { invoice_id: item.invoice_id, after: createdAllocation }
        });
        touchedInvoiceIds.add(item.invoice_id);
      }

      this.refreshPaymentAllocationBalance(tenantId, paymentId, paymentId);

      for (const invoiceId of touchedInvoiceIds) {
        this.syncInvoicePaymentStatus(tenantId, invoiceId, paymentId);
      }

      const updatedPayment = this.getPayment(tenantId, paymentId);
      this.transactionManager.runAfterCommit(() => {
        this.eventsService.logEvent({
          tenant_id: tenantId,
          type: 'billing.payment.allocated.v1',
          aggregate_type: 'payment_allocation',
          aggregate_id: paymentId,
          aggregate_version: Math.max(1, updatedPayment.allocations.length),
          correlation_id: paymentId,
          idempotency_key: idempotencyKey ? `${idempotencyKey}:event:payment:allocated` : undefined,
          action: 'allocated',
          payload: {
            payment_id: paymentId,
            customer_id: payment.customer_id,
            amount_minor: payment.amount_received_minor,
            allocation_count: data.allocations.length,
            total_allocated_minor: requestedTotal,
            currency_code: payment.currency
          }
        });
      });

      return updatedPayment;
    }, this.financialParticipants()));
  }

  async voidPayment(tenantId: string, paymentId: string, idempotencyKey?: string): Promise<PaymentDetails> {
    return this.transactionManager.wrapper(async () => {
      const payment = this.getPaymentRecord(tenantId, paymentId);
      if (payment.status === 'void') {
        return this.getPayment(tenantId, paymentId);
      }

      const removedAllocations = this.paymentsRepository.deleteAllocationsByPayment(tenantId, paymentId);
      for (const allocation of removedAllocations) {
        this.eventsService.logMutation({
          tenant_id: tenantId,
          entity_type: 'payment_allocation',
          entity_id: allocation.id,
          action: 'deleted',
          aggregate_version: Math.max(1, removedAllocations.length),
          correlation_id: paymentId,
          payload: { before: allocation }
        });
      }

      const updatedPayment = this.paymentsRepository.update(tenantId, paymentId, {
        status: 'void',
        allocated_minor: 0,
        unallocated_minor: payment.amount_received_minor
      });

      if (!updatedPayment) {
        throw new NotFoundException('Payment not found');
      }

      this.eventsService.logMutation({
        tenant_id: tenantId,
        entity_type: 'payment',
        entity_id: paymentId,
        action: 'voided',
        aggregate_version: 3,
        correlation_id: paymentId,
        idempotency_key: idempotencyKey ? `${idempotencyKey}:audit:payment:void` : undefined,
        payload: { before: payment, after: updatedPayment }
      });

      const touchedInvoiceIds = new Set(removedAllocations.map((allocation) => allocation.invoice_id));
      for (const invoiceId of touchedInvoiceIds) {
        this.syncInvoicePaymentStatus(tenantId, invoiceId, paymentId);
      }

      this.eventsService.logEvent({
        tenant_id: tenantId,
        type: 'billing.payment.refunded.v1',
        aggregate_type: 'payment',
        aggregate_id: paymentId,
        aggregate_version: 3,
        correlation_id: paymentId,
        idempotency_key: idempotencyKey,
        payload: {
          payment_id: paymentId,
          refunded_at: new Date().toISOString(),
          amount_minor: payment.amount_received_minor,
          currency_code: payment.currency
        }
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
      },
      {
        key: 'financial-state-validator',
        snapshot: () => null,
        restore: () => undefined,
        validate: () => new FinancialStateValidator(this.invoicesRepository, this.paymentsRepository).validate()
      }
    ];
  }

  private refreshPaymentAllocationBalance(tenantId: string, paymentId: string, correlationId: string): void {
    const payment = this.getPaymentRecord(tenantId, paymentId);
    const allocatedMinor = this.paymentsRepository.sumAllocatedForPayment(tenantId, paymentId);

    const updated = this.paymentsRepository.update(tenantId, paymentId, {
      allocated_minor: allocatedMinor,
      unallocated_minor: payment.amount_received_minor - allocatedMinor
    });

    if (!updated) {
      throw new NotFoundException('Payment not found');
    }

    this.eventsService.logMutation({
      tenant_id: tenantId,
      entity_type: 'payment',
      entity_id: paymentId,
      action: 'allocation_balance_updated',
      aggregate_version: Math.max(1, updated.allocated_minor > 0 ? 2 : 1),
      correlation_id: correlationId,
      payload: { before: payment, after: updated }
    });
  }

  private syncInvoicePaymentStatus(tenantId: string, invoiceId: string, correlationId: string): void {
    const invoice = this.invoicesRepository.findById(tenantId, invoiceId);
    if (!invoice || invoice.status === 'void' || invoice.status === 'draft') {
      return;
    }

    const allocated = this.paymentsRepository.sumAllocatedForInvoice(tenantId, invoiceId);
    const paidMinor = Math.min(allocated, invoice.total_minor);
    const dueMinor = Math.max(0, invoice.total_minor - paidMinor);

    const nextStatus: InvoiceStatus = dueMinor === 0 ? 'paid' : 'issued';

    if (!canTransitionInvoiceStatus(invoice.status, nextStatus)) {
      throw new ConflictException(`Invalid invoice status transition: ${invoice.status} -> ${nextStatus}`);
    }

    if (nextStatus === 'paid' && invoice.status !== 'paid') {
      this.eventsService.logEvent({
        tenant_id: tenantId,
        type: 'billing.invoice.paid.v1',
        aggregate_type: 'invoice',
        aggregate_id: invoiceId,
        aggregate_version: 3,
        correlation_id: correlationId,
        payload: {
          invoice_id: invoiceId,
          paid_at: new Date().toISOString(),
          amount_paid_minor: paidMinor,
          currency_code: invoice.currency,
          payment_id: correlationId
        }
      });
    }

    const updated = this.invoicesRepository.update(tenantId, invoiceId, {
      status: nextStatus,
      amount_paid_minor: paidMinor,
      amount_due_minor: dueMinor
    });

    if (!updated) {
      throw new NotFoundException(`Invoice not found: ${invoiceId}`);
    }

    this.eventsService.logMutation({
      tenant_id: tenantId,
      entity_type: 'invoice',
      entity_id: invoiceId,
      action: 'payment_status_synced',
      aggregate_version: nextStatus === 'issued' ? 2 : 3,
      correlation_id: correlationId,
      payload: { before: invoice, after: updated }
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

  private requireIdempotencyKey(idempotencyKey: string | undefined, operation: string): string {
    const normalizedKey = idempotencyKey?.trim();
    if (!normalizedKey) {
      throw new BadRequestException(`idempotency_key is required to ${operation}`);
    }

    return normalizedKey;
  }

  private async runIdempotentPaymentOperation<T>(tenantId: string, operationScope: string, key: string, handler: () => Promise<T>): Promise<T> {
    const scope = `${tenantId}:${operationScope}`;
    const begin = this.idempotencyService.begin(scope, key);

    if (begin.state === 'completed') {
      return begin.record.response?.body as T;
    }

    if (begin.state === 'in_progress') {
      const completed = await this.idempotencyService.waitForCompletion(scope, key);
      if (completed?.response) {
        return completed.response.body as T;
      }
    }

    try {
      const result = await handler();
      this.idempotencyService.complete(scope, key, { status_code: 200, body: result });
      return result;
    } catch (error) {
      this.idempotencyService.fail(scope, key);
      throw error;
    }
  }
}
