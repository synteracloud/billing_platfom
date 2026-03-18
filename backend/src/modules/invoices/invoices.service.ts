import { BadRequestException, ConflictException, Injectable, NotFoundException } from '@nestjs/common';
import { FinancialStateValidator } from '../../common/transactions/financial-state.validator';
import { FinancialTransactionManager, TransactionParticipant } from '../../common/transactions/financial-transaction.manager';
import { CustomersService } from '../customers/customers.service';
import { EventsService } from '../events/events.service';
import { AddLineDto } from './dto/add-line.dto';
import { CreateInvoiceDto } from './dto/create-invoice.dto';
import { UpdateInvoiceDto } from './dto/update-invoice.dto';
import { InvoiceLineEntity } from './entities/invoice-line.entity';
import { InvoiceEntity } from './entities/invoice.entity';
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

  async createInvoice(tenantId: string, data: CreateInvoiceDto, idempotencyKey?: string): Promise<InvoiceEntity & { lines: InvoiceLineEntity[] }> {
    return this.transactionManager.wrapper(async () => {
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

      this.eventsService.logMutation({
        tenant_id: tenantId,
        entity_type: 'invoice',
        entity_id: invoice.id,
        action: 'created',
        aggregate_version: 1,
        correlation_id: invoice.id,
        idempotency_key: idempotencyKey ? `${idempotencyKey}:audit:invoice:create` : undefined,
        payload: { after: invoice }
      });

      for (const line of data.lines ?? []) {
        await this.addLine(tenantId, invoice.id, line);
      }

      const createdInvoice = this.getInvoice(tenantId, invoice.id);
      this.eventsService.logEvent({
        tenant_id: tenantId,
        type: 'billing.invoice.created.v1',
        aggregate_type: 'invoice',
        aggregate_id: invoice.id,
        aggregate_version: 1,
        correlation_id: invoice.id,
        idempotency_key: idempotencyKey,
        payload: {
          invoice_id: invoice.id,
          customer_id: invoice.customer_id,
          invoice_number: invoice.invoice_number,
          status: createdInvoice.status,
          total_minor: createdInvoice.total_minor,
          currency_code: createdInvoice.currency
        }
      });

      return createdInvoice;
    }, this.financialParticipants());
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

  async updateInvoice(tenantId: string, invoiceId: string, data: UpdateInvoiceDto, _idempotencyKey?: string): Promise<InvoiceEntity & { lines: InvoiceLineEntity[] }> {
    return this.transactionManager.wrapper(async () => {
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

      return this.recalculateTotals(tenantId, invoiceId, 'updated', invoice.id, invoice);
    }, this.financialParticipants());
  }

  async issueInvoice(tenantId: string, invoiceId: string, idempotencyKey?: string): Promise<InvoiceEntity & { lines: InvoiceLineEntity[] }> {
    return this.transactionManager.wrapper(async () => {
      const invoice = this.getInvoice(tenantId, invoiceId);

      if (invoice.status !== 'draft') {
        throw new ConflictException('Only draft invoices can be issued');
      }

      if (invoice.lines.length === 0) {
        throw new ConflictException('Invoice must have at least one line before issuing');
      }

      const issuedAt = new Date().toISOString();
      const updated = this.invoicesRepository.update(tenantId, invoiceId, {
        status: 'issued',
        issue_date: invoice.issue_date ?? issuedAt.slice(0, 10),
        issued_at: issuedAt,
        amount_due_minor: invoice.total_minor
      });

      if (!updated) {
        throw new NotFoundException('Invoice not found');
      }

      const issuedInvoice = this.getInvoice(tenantId, invoiceId);
      const issueDate = issuedInvoice.issue_date ?? issuedAt.slice(0, 10);

      this.eventsService.logMutation({
        tenant_id: tenantId,
        entity_type: 'invoice',
        entity_id: invoiceId,
        action: 'issued',
        aggregate_version: 2,
        correlation_id: invoiceId,
        idempotency_key: idempotencyKey ? `${idempotencyKey}:audit:invoice:issued` : undefined,
        payload: { before: invoice, after: issuedInvoice }
      });

      this.eventsService.logEvent({
        tenant_id: tenantId,
        type: 'billing.invoice.issued.v1',
        aggregate_type: 'invoice',
        aggregate_id: invoiceId,
        aggregate_version: 2,
        correlation_id: invoiceId,
        idempotency_key: idempotencyKey,
        payload: {
          invoice_id: invoiceId,
          issue_date: issueDate,
          due_date: issuedInvoice.due_date,
          total_minor: issuedInvoice.total_minor,
          currency_code: issuedInvoice.currency
        }
      });

      return issuedInvoice;
    }, this.financialParticipants());
  }

  async voidInvoice(tenantId: string, invoiceId: string, idempotencyKey?: string): Promise<InvoiceEntity & { lines: InvoiceLineEntity[] }> {
    return this.transactionManager.wrapper(async () => {
      const invoice = this.getInvoice(tenantId, invoiceId);

      if (invoice.status === 'paid' || invoice.status === 'partially_paid') {
        throw new ConflictException('Settled invoices cannot be voided');
      }

      if (invoice.status === 'void') {
        throw new ConflictException('Invoice is already void');
      }

      const voidedAt = new Date().toISOString();
      const updated = this.invoicesRepository.update(tenantId, invoiceId, {
        status: 'void',
        voided_at: voidedAt,
        amount_due_minor: 0
      });

      if (!updated) {
        throw new NotFoundException('Invoice not found');
      }

      this.eventsService.logMutation({
        tenant_id: tenantId,
        entity_type: 'invoice',
        entity_id: invoiceId,
        action: 'voided',
        aggregate_version: 3,
        correlation_id: invoiceId,
        idempotency_key: idempotencyKey ? `${idempotencyKey}:audit:invoice:voided` : undefined,
        payload: { before: invoice, after: updated }
      });

      this.eventsService.logEvent({
        tenant_id: tenantId,
        type: 'billing.invoice.voided.v1',
        aggregate_type: 'invoice',
        aggregate_id: invoiceId,
        aggregate_version: 3,
        correlation_id: invoiceId,
        idempotency_key: idempotencyKey,
        payload: {
          invoice_id: invoiceId,
          voided_at: voidedAt,
          reason: null
        }
      });

      return this.getInvoice(tenantId, invoiceId);
    }, this.financialParticipants());
  }

  async addLine(tenantId: string, invoiceId: string, data: AddLineDto, _idempotencyKey?: string): Promise<InvoiceEntity & { lines: InvoiceLineEntity[] }> {
    return this.transactionManager.wrapper(async () => {
      const invoice = this.getInvoice(tenantId, invoiceId);
      this.ensureDraft(invoice);
      this.validateLineData(data);

      const lineSubtotal = Math.round(data.quantity * data.unit_price_minor);
      const basisPoints = data.tax_rate_basis_points ?? null;
      const lineTax = data.line_tax_minor ?? (basisPoints ? Math.round((lineSubtotal * basisPoints) / 10000) : 0);

      const currentCount = this.invoicesRepository.listLines(tenantId, invoiceId).length;
      const createdLine = this.invoicesRepository.createLine({
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

      this.eventsService.logMutation({
        tenant_id: tenantId,
        entity_type: 'invoice_line',
        entity_id: createdLine.id,
        action: 'created',
        aggregate_version: currentCount + 1,
        correlation_id: invoiceId,
        payload: { invoice_id: invoiceId, after: createdLine }
      });

      return this.recalculateTotals(tenantId, invoiceId, 'line_created', invoiceId, invoice);
    }, this.financialParticipants());
  }

  async removeLine(tenantId: string, invoiceId: string, lineId: string, _idempotencyKey?: string): Promise<InvoiceEntity & { lines: InvoiceLineEntity[] }> {
    return this.transactionManager.wrapper(async () => {
      const invoice = this.getInvoice(tenantId, invoiceId);
      this.ensureDraft(invoice);

      const invoiceLine = this.invoicesRepository.findLineById(tenantId, invoiceId, lineId);
      const deleted = this.invoicesRepository.deleteLine(tenantId, invoiceId, lineId);
      if (!deleted) {
        throw new NotFoundException('Invoice line not found');
      }

      this.eventsService.logMutation({
        tenant_id: tenantId,
        entity_type: 'invoice_line',
        entity_id: lineId,
        action: 'deleted',
        aggregate_version: Math.max(1, invoice.lines.length),
        correlation_id: invoiceId,
        payload: { invoice_id: invoiceId, before: invoiceLine ?? null }
      });

      return this.recalculateTotals(tenantId, invoiceId, 'line_deleted', invoiceId, invoice);
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
      },
      {
        key: 'financial-state-validator',
        snapshot: () => null,
        restore: () => undefined,
        validate: () => new FinancialStateValidator(this.invoicesRepository).validate()
      }
    ];
  }

  private recalculateTotals(
    tenantId: string,
    invoiceId: string,
    action = 'totals_recalculated',
    correlationId?: string,
    beforeInvoice?: InvoiceEntity & { lines: InvoiceLineEntity[] }
  ): InvoiceEntity & { lines: InvoiceLineEntity[] } {
    const invoice = this.getInvoice(tenantId, invoiceId);
    const lines = invoice.lines;
    const subtotal = lines.reduce((sum, line) => sum + line.line_subtotal_minor, 0);
    const tax = lines.reduce((sum, line) => sum + line.line_tax_minor, 0);
    const total = Math.max(0, subtotal + tax - invoice.discount_minor);
    const amountDue = Math.max(0, total - invoice.amount_paid_minor);

    const updated = this.invoicesRepository.update(tenantId, invoiceId, {
      subtotal_minor: subtotal,
      tax_minor: tax,
      total_minor: total,
      amount_due_minor: amountDue
    });

    if (!updated) {
      throw new NotFoundException('Invoice not found');
    }

    this.eventsService.logMutation({
      tenant_id: tenantId,
      entity_type: 'invoice',
      entity_id: invoiceId,
      action,
      aggregate_version: invoice.status === 'issued' ? 2 : 1,
      correlation_id: correlationId ?? invoiceId,
      payload: { before: beforeInvoice ?? invoice, after: updated }
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
