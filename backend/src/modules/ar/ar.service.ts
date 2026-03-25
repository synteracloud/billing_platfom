import { BadRequestException, Injectable, NotFoundException } from '@nestjs/common';
import { CustomersService } from '../customers/customers.service';
import { InvoiceEntity } from '../invoices/entities/invoice.entity';
import { InvoicesRepository } from '../invoices/invoices.repository';
import { PaymentsRepository } from '../payments/payments.repository';

interface StatementEntry {
  type: 'invoice' | 'payment';
  id: string;
  date: string;
  reference: string | null;
  currency: string;
  amount_minor: number;
  running_balance_minor: number;
}

@Injectable()
export class ArService {
  constructor(
    private readonly customersService: CustomersService,
    private readonly invoicesRepository: InvoicesRepository,
    private readonly paymentsRepository: PaymentsRepository
  ) {}

  getCustomerBalance(tenantId: string, customerId: string): {
    customer_id: string;
    currency: string | null;
    open_invoices_count: number;
    total_invoiced_minor: number;
    total_paid_minor: number;
    outstanding_balance_minor: number;
  } {
    this.customersService.getCustomer(tenantId, customerId);

    const customerInvoices = this.invoicesRepository
      .listByTenant(tenantId)
      .filter((invoice) => invoice.customer_id === customerId && invoice.status !== 'void');

    const currency = this.findSingleCurrency(customerInvoices);

    const totalInvoiced = customerInvoices.reduce((sum, invoice) => sum + invoice.total_minor, 0);
    const totalPaid = customerInvoices.reduce((sum, invoice) => sum + invoice.amount_paid_minor, 0);

    return {
      customer_id: customerId,
      currency,
      open_invoices_count: customerInvoices.filter((invoice) => invoice.amount_due_minor > 0).length,
      total_invoiced_minor: totalInvoiced,
      total_paid_minor: totalPaid,
      outstanding_balance_minor: customerInvoices.reduce((sum, invoice) => sum + invoice.amount_due_minor, 0)
    };
  }

  getAging(tenantId: string, customerId: string, asOf?: string): {
    customer_id: string;
    as_of: string;
    currency: string | null;
    buckets: Record<'current' | 'days_1_30' | 'days_31_60' | 'days_61_90' | 'days_90_plus', number>;
    total_outstanding_minor: number;
  } {
    this.customersService.getCustomer(tenantId, customerId);
    const asOfDate = this.resolveAsOfDate(asOf);

    const customerInvoices = this.invoicesRepository
      .listByTenant(tenantId)
      .filter((invoice) => invoice.customer_id === customerId && invoice.status === 'issued' && invoice.amount_due_minor > 0);

    const currency = this.findSingleCurrency(customerInvoices);
    const buckets = {
      current: 0,
      days_1_30: 0,
      days_31_60: 0,
      days_61_90: 0,
      days_90_plus: 0
    };

    for (const invoice of customerInvoices) {
      const daysPastDue = this.daysPastDue(invoice, asOfDate);
      if (daysPastDue <= 0) {
        buckets.current += invoice.amount_due_minor;
      } else if (daysPastDue <= 30) {
        buckets.days_1_30 += invoice.amount_due_minor;
      } else if (daysPastDue <= 60) {
        buckets.days_31_60 += invoice.amount_due_minor;
      } else if (daysPastDue <= 90) {
        buckets.days_61_90 += invoice.amount_due_minor;
      } else {
        buckets.days_90_plus += invoice.amount_due_minor;
      }
    }

    return {
      customer_id: customerId,
      as_of: asOfDate,
      currency,
      buckets,
      total_outstanding_minor: Object.values(buckets).reduce((sum, value) => sum + value, 0)
    };
  }

  getStatement(tenantId: string, customerId: string, options: { from?: string; to?: string }): {
    customer_id: string;
    currency: string | null;
    period: { from: string | null; to: string | null };
    opening_balance_minor: number;
    closing_balance_minor: number;
    entries: StatementEntry[];
  } {
    this.customersService.getCustomer(tenantId, customerId);

    const from = this.parseDateOrNull(options.from, 'from');
    const to = this.parseDateOrNull(options.to, 'to');
    if (from && to && from > to) {
      throw new BadRequestException('from must be before or equal to to');
    }

    const invoices = this.invoicesRepository
      .listByTenant(tenantId)
      .filter((invoice) => invoice.customer_id === customerId && invoice.status !== 'void');

    const payments = this.paymentsRepository
      .listByTenant(tenantId)
      .filter((payment) => payment.customer_id === customerId && payment.status !== 'void');

    const currency = this.findSingleCurrency(invoices);

    const openingInvoices = invoices
      .filter((invoice) => from && this.normalizeDate(invoice.issue_date ?? invoice.created_at.slice(0, 10)) < from)
      .reduce((sum, invoice) => sum + invoice.total_minor, 0);

    const openingPayments = payments
      .filter((payment) => from && this.normalizeDate(payment.payment_date) < from)
      .reduce((sum, payment) => sum + payment.amount_received_minor, 0);

    const openingBalance = openingInvoices - openingPayments;

    const invoiceEntries = invoices
      .map((invoice) => ({
        type: 'invoice' as const,
        id: invoice.id,
        date: this.normalizeDate(invoice.issue_date ?? invoice.created_at.slice(0, 10)),
        reference: invoice.invoice_number,
        currency: invoice.currency,
        amount_minor: invoice.total_minor
      }))
      .filter((entry) => this.withinRange(entry.date, from, to));

    const paymentEntries = payments
      .map((payment) => ({
        type: 'payment' as const,
        id: payment.id,
        date: this.normalizeDate(payment.payment_date),
        reference: payment.payment_reference,
        currency: payment.currency,
        amount_minor: -payment.amount_received_minor
      }))
      .filter((entry) => this.withinRange(entry.date, from, to));

    const entries = [...invoiceEntries, ...paymentEntries]
      .sort((a, b) => a.date.localeCompare(b.date) || a.id.localeCompare(b.id))
      .map((entry) => {
        return entry;
      });

    let runningBalance = openingBalance;
    const statementEntries = entries.map((entry) => {
      runningBalance += entry.amount_minor;
      return {
        ...entry,
        running_balance_minor: runningBalance
      };
    });

    return {
      customer_id: customerId,
      currency,
      period: { from, to },
      opening_balance_minor: openingBalance,
      closing_balance_minor: runningBalance,
      entries: statementEntries
    };
  }

  private resolveAsOfDate(asOf?: string): string {
    if (!asOf) {
      return new Date().toISOString().slice(0, 10);
    }

    return this.parseDateOrNull(asOf, 'as_of') ?? new Date().toISOString().slice(0, 10);
  }

  private findSingleCurrency(invoices: InvoiceEntity[]): string | null {
    const currencies = new Set(invoices.map((invoice) => invoice.currency));
    if (currencies.size === 0) {
      return null;
    }

    if (currencies.size > 1) {
      throw new NotFoundException('Multi-currency customer balances are not supported by this endpoint');
    }

    return invoices[0].currency;
  }

  private daysPastDue(invoice: InvoiceEntity, asOfDate: string): number {
    if (!invoice.due_date) {
      return 0;
    }

    const dueDate = new Date(`${invoice.due_date}T00:00:00.000Z`);
    const asOf = new Date(`${asOfDate}T00:00:00.000Z`);
    return Math.floor((asOf.getTime() - dueDate.getTime()) / 86_400_000);
  }

  private parseDateOrNull(value: string | undefined, field: string): string | null {
    if (!value) {
      return null;
    }

    if (!/^\d{4}-\d{2}-\d{2}$/.test(value)) {
      throw new BadRequestException(`${field} must be a valid ISO date (YYYY-MM-DD)`);
    }

    const date = new Date(`${value}T00:00:00.000Z`);
    if (Number.isNaN(date.getTime())) {
      throw new BadRequestException(`${field} must be a valid ISO date (YYYY-MM-DD)`);
    }

    return value;
  }

  private normalizeDate(value: string): string {
    return value.slice(0, 10);
  }

  private withinRange(date: string, from: string | null, to: string | null): boolean {
    if (from && date < from) {
      return false;
    }

    if (to && date > to) {
      return false;
    }

    return true;
  }
}
