import { BadRequestException, ConflictException, Injectable, NotFoundException } from '@nestjs/common';
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
    private readonly customersService: CustomersService
  ) {}

  listInvoices(tenantId: string): Array<InvoiceEntity & { lines: InvoiceLineEntity[] }> {
    return this.invoicesRepository
      .listByTenant(tenantId)
      .map((invoice) => ({ ...invoice, lines: this.invoicesRepository.listLines(tenantId, invoice.id) }));
  }

  createInvoice(tenantId: string, data: CreateInvoiceDto): InvoiceEntity & { lines: InvoiceLineEntity[] } {
    this.ensureCustomerExists(tenantId, data.customer_id);
    this.validateCurrency(data.currency);

    const invoice = this.invoicesRepository.create({
      tenant_id: tenantId,
      customer_id: data.customer_id,
      invoice_number: data.invoice_number?.trim() || this.generateInvoiceNumber(tenantId),
      status: 'draft',
      currency: data.currency.trim().toUpperCase(),
      subtotal_minor: 0,
      tax_minor: 0,
      total_minor: 0,
      issue_date: data.issue_date ?? null,
      due_date: data.due_date ?? null,
      subscription_id: data.subscription_id ?? null,
      metadata: data.metadata ?? null
    });

    for (const line of data.lines ?? []) {
      this.addLine(tenantId, invoice.id, line);
    }

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

  updateInvoice(tenantId: string, invoiceId: string, data: UpdateInvoiceDto): InvoiceEntity & { lines: InvoiceLineEntity[] } {
    const invoice = this.getInvoice(tenantId, invoiceId);
    this.ensureDraft(invoice);

    const updated = this.invoicesRepository.update(tenantId, invoiceId, {
      issue_date: data.issue_date === undefined ? invoice.issue_date : data.issue_date,
      due_date: data.due_date === undefined ? invoice.due_date : data.due_date,
      metadata: data.metadata === undefined ? invoice.metadata : data.metadata
    });

    if (!updated) {
      throw new NotFoundException('Invoice not found');
    }

    return this.getInvoice(tenantId, invoiceId);
  }

  issueInvoice(tenantId: string, invoiceId: string): InvoiceEntity & { lines: InvoiceLineEntity[] } {
    const invoice = this.getInvoice(tenantId, invoiceId);

    if (invoice.status !== 'draft') {
      throw new ConflictException('Only draft invoices can be issued');
    }

    this.invoicesRepository.update(tenantId, invoiceId, { status: 'issued' });
    return this.getInvoice(tenantId, invoiceId);
  }

  voidInvoice(tenantId: string, invoiceId: string): InvoiceEntity & { lines: InvoiceLineEntity[] } {
    const invoice = this.getInvoice(tenantId, invoiceId);

    if (invoice.status === 'paid') {
      throw new ConflictException('Paid invoices cannot be voided');
    }

    if (invoice.status === 'void') {
      throw new ConflictException('Invoice is already void');
    }

    this.invoicesRepository.update(tenantId, invoiceId, { status: 'void' });
    return this.getInvoice(tenantId, invoiceId);
  }

  addLine(tenantId: string, invoiceId: string, data: AddLineDto): InvoiceEntity & { lines: InvoiceLineEntity[] } {
    const invoice = this.getInvoice(tenantId, invoiceId);
    this.ensureDraft(invoice);
    this.validateLineData(data);

    const lineSubtotal = Math.round(data.quantity * data.unit_price_minor);
    const lineTax = data.line_tax_minor ?? 0;

    this.invoicesRepository.createLine({
      tenant_id: tenantId,
      invoice_id: invoiceId,
      product_id: data.product_id ?? null,
      description: data.description.trim(),
      quantity: data.quantity,
      unit_price_minor: data.unit_price_minor,
      line_subtotal_minor: lineSubtotal,
      line_tax_minor: lineTax,
      line_total_minor: lineSubtotal + lineTax
    });

    return this.recalculateTotals(tenantId, invoiceId);
  }

  removeLine(tenantId: string, invoiceId: string, lineId: string): InvoiceEntity & { lines: InvoiceLineEntity[] } {
    const invoice = this.getInvoice(tenantId, invoiceId);
    this.ensureDraft(invoice);

    const deleted = this.invoicesRepository.deleteLine(tenantId, invoiceId, lineId);
    if (!deleted) {
      throw new NotFoundException('Invoice line not found');
    }

    return this.recalculateTotals(tenantId, invoiceId);
  }

  private recalculateTotals(tenantId: string, invoiceId: string): InvoiceEntity & { lines: InvoiceLineEntity[] } {
    const lines = this.invoicesRepository.listLines(tenantId, invoiceId);
    const subtotal = lines.reduce((sum, line) => sum + line.line_subtotal_minor, 0);
    const tax = lines.reduce((sum, line) => sum + line.line_tax_minor, 0);

    this.invoicesRepository.update(tenantId, invoiceId, {
      subtotal_minor: subtotal,
      tax_minor: tax,
      total_minor: subtotal + tax
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

    if (line.line_tax_minor !== undefined && (!Number.isFinite(line.line_tax_minor) || line.line_tax_minor < 0)) {
      throw new BadRequestException('line_tax_minor must be greater than or equal to 0');
    }
  }

  private generateInvoiceNumber(tenantId: string): string {
    const sequence = this.invoicesRepository.countByTenant(tenantId) + 1;
    return `INV-${sequence.toString().padStart(6, '0')}`;
  }
}
