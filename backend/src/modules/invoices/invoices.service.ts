import { BadRequestException, ConflictException, Injectable, NotFoundException } from '@nestjs/common';
import { FinancialTransactionManager, TransactionParticipant } from '../../common/transactions/financial-transaction.manager';
import { EventsService } from '../events/events.service';
import { CustomersService } from '../customers/customers.service';
import { AddLineDto } from './dto/add-line.dto';
import { CreateInvoiceDto } from './dto/create-invoice.dto';
import { UpdateInvoiceDto } from './dto/update-invoice.dto';
import { InvoiceEntity } from './entities/invoice.entity';
import { InvoiceLineEntity } from './entities/invoice-line.entity';
import { InvoicesRepository } from './invoices.repository';

@Injectable()
export class InvoicesService {
  constructor(
    private readonly invoicesRepository: InvoicesRepository,
    private readonly customersService: CustomersService,
    private readonly eventsService: EventsService,
    private readonly transactionManager: FinancialTransactionManager
  ) {}

  listInvoices(tenantId: string): Array<InvoiceEntity & { lines: InvoiceLineEntity[] }> {
    return this.invoicesRepository
      .listByTenant(tenantId)
      .map((invoice) => ({ ...invoice, lines: this.invoicesRepository.listLines(tenantId, invoice.id) }));
  }

  createInvoice(tenantId: string, data: CreateInvoiceDto, idempotencyKey?: string): InvoiceEntity & { lines: InvoiceLineEntity[] } {
    this.ensureCustomerExists(tenantId, data.customer_id);
    this.validateCurrency(data.currency);

    const invoice = this.invoicesRepository.create({
      tenant_id: tenantId,
      customer_id: data.customer_id,
      invoice_number: data.invoice_number?.trim() || this.generateInvoiceNumber(tenantId),
      status: 'draft',
      issue_date: data.issue_date ?? null,
      due_date: data.due_date ?? null,
      currency: data.currency.trim().toUpperCase(),
      subtotal_minor: 0,
      tax_minor: 0,
      discount_minor: data.discount_minor ?? 0,
      total_minor: 0,
      amount_paid_minor: 0,
      amount_due_minor: 0,
      notes: data.notes ?? null,
      issued_at: null,
      voided_at: null,
      subscription_id: data.subscription_id ?? null,
      metadata: data.metadata ?? null
    });

    for (const line of data.lines ?? []) {
      this.addLine(tenantId, invoice.id, line);
    }

    this.eventsService.logEvent({
      tenant_id: tenantId,
      event_type: 'invoice_created',
      event_category: 'financial',
      entity_type: 'invoice',
      entity_id: invoice.id,
      actor_type: 'system',
      payload: { invoice_number: invoice.invoice_number },
      idempotency_key: idempotencyKey ?? null
    });

    return this.getInvoice(tenantId, invoice.id);
  }

  getInvoice(tenantId: string, invoiceId: string): InvoiceEntity & { lines: InvoiceLineEntity[] } {
    const invoice = this.invoicesRepository.findById(tenantId, invoiceId);
    if (!invoice) {
      throw new NotFoundException('Invoice not found');
    }

    return {
      ...invoice,
      lines: this.invoicesRepository.listLines(tenantId, invoiceId)
    };
  }

  updateInvoice(tenantId: string, invoiceId: string, data: UpdateInvoiceDto, _idempotencyKey?: string): InvoiceEntity & { lines: InvoiceLineEntity[] } {
    const invoice = this.getInvoice(tenantId, invoiceId);
    this.ensureDraft(invoice);

    if (data.discount_minor !== undefined && data.discount_minor < 0) {
      throw new BadRequestException('discount_minor must be greater than or equal to 0');
    }

      const updated = this.invoicesRepository.update(tenantId, invoiceId, {
        issue_date: data.issue_date === undefined ? invoice.issue_date : data.issue_date,
        due_date: data.due_date === undefined ? invoice.due_date : data.due_date,
        notes: data.notes === undefined ? invoice.notes : data.notes,
        discount_minor: data.discount_minor === undefined ? invoice.discount_minor : data.discount_minor,
        metadata: data.metadata === undefined ? invoice.metadata : data.metadata
      });

      if (!updated) {
        throw new NotFoundException('Invoice not found');
      }

      return this.recalculateTotals(tenantId, invoiceId);
    }, this.financialParticipants());
  }

  issueInvoice(tenantId: string, invoiceId: string, idempotencyKey?: string): InvoiceEntity & { lines: InvoiceLineEntity[] } {
    const invoice = this.getInvoice(tenantId, invoiceId);

      if (invoice.status !== 'draft') {
        throw new ConflictException('Only draft invoices can be issued');
      }

      const now = new Date().toISOString();
      this.invoicesRepository.update(tenantId, invoiceId, {
        status: 'issued',
        issued_at: now,
        issue_date: invoice.issue_date ?? now.slice(0, 10)
      });

    const issuedInvoice = this.getInvoice(tenantId, invoiceId);

    this.eventsService.logEvent({
      tenant_id: tenantId,
      event_type: 'invoice_issued',
      event_category: 'financial',
      entity_type: 'invoice',
      entity_id: invoiceId,
      actor_type: 'system',
      payload: {},
      idempotency_key: idempotencyKey ?? null
    });

    return issuedInvoice;
  }

  voidInvoice(tenantId: string, invoiceId: string, idempotencyKey?: string): InvoiceEntity & { lines: InvoiceLineEntity[] } {
    const invoice = this.getInvoice(tenantId, invoiceId);

      if (invoice.status === 'paid' || invoice.status === 'partially_paid') {
        throw new ConflictException('Settled invoices cannot be voided');
      }

      if (invoice.status === 'void') {
        throw new ConflictException('Invoice is already void');
      }

    const voidedAt = new Date().toISOString();
    this.invoicesRepository.update(tenantId, invoiceId, {
      status: 'void',
      voided_at: voidedAt,
      amount_due_minor: 0
    });

      this.eventsService.logEvent({
      tenant_id: tenantId,
      event_type: 'invoice_voided',
      event_category: 'financial',
      entity_type: 'invoice',
      entity_id: invoiceId,
      actor_type: 'system',
      payload: {},
      idempotency_key: idempotencyKey ?? null
    });

      return this.getInvoice(tenantId, invoiceId);
    }, this.financialParticipants());
  }

  addLine(tenantId: string, invoiceId: string, data: AddLineDto, _idempotencyKey?: string): InvoiceEntity & { lines: InvoiceLineEntity[] } {
    const invoice = this.getInvoice(tenantId, invoiceId);
    this.ensureDraft(invoice);
    this.validateLineData(data);

      const lineSubtotal = Math.round(data.quantity * data.unit_price_minor);
      const basisPoints = data.tax_rate_basis_points ?? null;
      const lineTax = data.line_tax_minor ?? (basisPoints ? Math.round((lineSubtotal * basisPoints) / 10000) : 0);

      const currentCount = this.invoicesRepository.listLines(tenantId, invoiceId).length;
      this.invoicesRepository.createLine({
      tenant_id: tenantId,
      invoice_id: invoiceId,
      product_id: data.product_id ?? null,
      description: data.description.trim(),
      quantity: data.quantity,
      unit_price_minor: data.unit_price_minor,
      tax_rate_basis_points: basisPoints,
      line_subtotal_minor: lineSubtotal,
      line_tax_minor: lineTax,
      line_total_minor: lineSubtotal + lineTax,
      currency: invoice.currency,
      sort_order: data.sort_order ?? currentCount,
      metadata: data.metadata ?? null
      });

      return this.recalculateTotals(tenantId, invoiceId);
    }, this.financialParticipants());
  }

  removeLine(tenantId: string, invoiceId: string, lineId: string, _idempotencyKey?: string): InvoiceEntity & { lines: InvoiceLineEntity[] } {
    const invoice = this.getInvoice(tenantId, invoiceId);
    this.ensureDraft(invoice);

      const deleted = this.invoicesRepository.deleteLine(tenantId, invoiceId, lineId);
      if (!deleted) {
        throw new NotFoundException('Invoice line not found');
      }

      return this.recalculateTotals(tenantId, invoiceId);
    }, this.financialParticipants());
  }

  private financialParticipants(): TransactionParticipant[] {
    return [
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

  private recalculateTotals(tenantId: string, invoiceId: string): InvoiceEntity & { lines: InvoiceLineEntity[] } {
    const invoice = this.getInvoice(tenantId, invoiceId);
    const lines = invoice.lines;
    const subtotal = lines.reduce((sum, line) => sum + line.line_subtotal_minor, 0);
    const tax = lines.reduce((sum, line) => sum + line.line_tax_minor, 0);
    const total = Math.max(0, subtotal + tax - invoice.discount_minor);
    const amountDue = Math.max(0, total - invoice.amount_paid_minor);

    this.invoicesRepository.update(tenantId, invoiceId, {
      subtotal_minor: subtotal,
      tax_minor: tax,
      total_minor: total,
      amount_due_minor: amountDue
    });

    return this.getInvoice(tenantId, invoiceId);
  }

  private ensureCustomerExists(tenantId: string, customerId: string): void {
    this.customersService.getCustomer(tenantId, customerId);
  }

  private ensureDraft(invoice: InvoiceEntity): void {
    if (invoice.status !== 'draft') {
      throw new ConflictException('Only draft invoices can be edited');
    }
  }

  private validateCurrency(currency: string): void {
    if (!currency || currency.trim().length !== 3) {
      throw new BadRequestException('currency must be a 3-letter ISO code');
    }
  }

  private validateLineData(line: AddLineDto): void {
    if (!line.description || line.description.trim().length === 0) {
      throw new BadRequestException('description is required');
    }

    if (typeof line.quantity !== 'number' || line.quantity <= 0) {
      throw new BadRequestException('quantity must be greater than 0');
    }

    if (!Number.isFinite(line.unit_price_minor) || line.unit_price_minor < 0) {
      throw new BadRequestException('unit_price_minor must be greater than or equal to 0');
    }
  }

  private generateInvoiceNumber(tenantId: string): string {
    const sequence = this.invoicesRepository.countByTenant(tenantId) + 1;
    return `INV-${sequence.toString().padStart(6, '0')}`;
  }
}
