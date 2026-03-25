import { Injectable, NotFoundException } from '@nestjs/common';
import { EventsService } from '../events/events.service';
import { InvoiceIssuedPayload, InvoiceVoidedPayload, PaymentAllocatedPayload, PaymentRefundedPayload } from '../events/entities/event.entity';
import { ArRepository, CustomerFinancialState, ReceivableInvoicePosition } from './ar.repository';

@Injectable()
export class ArService {
  constructor(
    private readonly arRepository: ArRepository,
    private readonly eventsService: EventsService
  ) {}

  applyInvoiceIssued(tenantId: string, payload: InvoiceIssuedPayload, correlationId: string | null): void {
    const now = new Date().toISOString();
    const previous = this.arRepository.findInvoice(tenantId, payload.invoice_id);
    const baseOpenAmount = previous ? previous.open_amount_minor : payload.total_minor;

    const next: ReceivableInvoicePosition = {
      invoice_id: payload.invoice_id,
      customer_id: payload.customer_id,
      currency_code: payload.currency_code,
      issue_date: payload.issue_date,
      due_date: payload.due_date,
      total_minor: payload.total_minor,
      open_amount_minor: Math.max(0, Math.min(payload.total_minor, baseOpenAmount)),
      paid_amount_minor: Math.max(0, payload.total_minor - Math.max(0, Math.min(payload.total_minor, baseOpenAmount))),
      status: baseOpenAmount <= 0 ? 'closed' : 'open',
      updated_at: now
    };

    this.arRepository.upsertInvoice(tenantId, next);
    this.emitReceivableUpdated(tenantId, next, correlationId);
  }

  applyPaymentAllocated(tenantId: string, payload: PaymentAllocatedPayload | PaymentRefundedPayload, correlationId: string | null): void {
    for (const change of payload.allocation_changes) {
      const invoice = this.arRepository.findInvoice(tenantId, change.invoice_id);
      if (!invoice || invoice.status === 'void') {
        continue;
      }

      const nextOpen = Math.max(0, Math.min(invoice.total_minor, invoice.open_amount_minor - change.allocated_delta_minor));
      const next: ReceivableInvoicePosition = {
        ...invoice,
        open_amount_minor: nextOpen,
        paid_amount_minor: Math.max(0, invoice.total_minor - nextOpen),
        status: nextOpen === 0 ? 'closed' : 'open',
        updated_at: new Date().toISOString()
      };

      this.arRepository.upsertInvoice(tenantId, next);
      this.emitReceivableUpdated(tenantId, next, correlationId);
    }
  }

  applyInvoiceVoided(tenantId: string, payload: InvoiceVoidedPayload, correlationId: string | null): void {
    const invoice = this.arRepository.findInvoice(tenantId, payload.invoice_id);
    if (!invoice) {
      return;
    }

    const next: ReceivableInvoicePosition = {
      ...invoice,
      open_amount_minor: 0,
      paid_amount_minor: 0,
      status: 'void',
      updated_at: new Date().toISOString()
    };

    this.arRepository.upsertInvoice(tenantId, next);
    this.emitReceivableUpdated(tenantId, next, correlationId);
  }

  getCustomerFinancialState(tenantId: string, customerId: string): CustomerFinancialState {
    const invoices = this.arRepository.listInvoicesByCustomer(tenantId, customerId);
    if (invoices.length === 0) {
      throw new NotFoundException('Customer financial state not found');
    }

    const currencyCode = invoices[0].currency_code;
    const totalOpen = invoices.reduce((sum, item) => sum + item.open_amount_minor, 0);
    const totalPaid = invoices.reduce((sum, item) => sum + item.paid_amount_minor, 0);

    return {
      customer_id: customerId,
      currency_code: currencyCode,
      total_open_amount_minor: totalOpen,
      total_paid_amount_minor: totalPaid,
      invoice_count_open: invoices.filter((item) => item.status === 'open').length,
      invoice_count_total: invoices.length,
      invoices: [...invoices].sort((a, b) => a.issue_date.localeCompare(b.issue_date) || a.invoice_id.localeCompare(b.invoice_id)),
      updated_at: invoices.map((item) => item.updated_at).sort().at(-1) ?? null
    };
  }

  private emitReceivableUpdated(tenantId: string, position: ReceivableInvoicePosition, correlationId: string | null): void {
    this.eventsService.logEvent({
      tenant_id: tenantId,
      type: 'subledger.receivable.updated.v1',
      aggregate_type: 'receivable_position',
      aggregate_id: position.invoice_id,
      aggregate_version: 1,
      correlation_id: correlationId,
      idempotency_key: `subledger.receivable.updated.v1:${position.invoice_id}:${position.updated_at}:${position.open_amount_minor}`,
      payload: {
        receivable_position_id: position.invoice_id,
        customer_id: position.customer_id,
        open_amount_minor: position.open_amount_minor,
        currency_code: position.currency_code
      }
    });
  }
}
