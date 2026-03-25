import { Injectable } from '@nestjs/common';
import { InvoicesService } from '../invoices/invoices.service';
import { PaymentsService } from '../payments/payments.service';
import { SubscriptionsService } from '../subscriptions/subscriptions.service';
import { InvoiceEntity } from '../invoices/entities/invoice.entity';

export interface AgingBuckets {
  current: number;
  days_30: number;
  days_60: number;
  days_90_plus: number;
}

function toUtcDate(value: string): Date {
  return new Date(`${value}T00:00:00.000Z`);
}

function calculateDaysPastDue(dueDate: string, asOfDate: string): number {
  const dueDateUtc = toUtcDate(dueDate);
  const asOfUtc = toUtcDate(asOfDate);
  return Math.floor((asOfUtc.getTime() - dueDateUtc.getTime()) / (24 * 60 * 60 * 1000));
}

export function buildInvoiceAgingBuckets(invoices: Array<Pick<InvoiceEntity, 'status' | 'due_date' | 'amount_due_minor'>>, asOfDate: string): AgingBuckets {
  return invoices.reduce<AgingBuckets>(
    (buckets, invoice) => {
      if (invoice.amount_due_minor <= 0) {
        return buckets;
      }

      if (invoice.status === 'draft' || invoice.status === 'void' || invoice.status === 'paid') {
        return buckets;
      }

      if (!invoice.due_date) {
        buckets.current += invoice.amount_due_minor;
        return buckets;
      }

      const daysPastDue = calculateDaysPastDue(invoice.due_date, asOfDate);
      if (daysPastDue <= 0) {
        buckets.current += invoice.amount_due_minor;
      } else if (daysPastDue <= 30) {
        buckets.days_30 += invoice.amount_due_minor;
      } else if (daysPastDue <= 60) {
        buckets.days_60 += invoice.amount_due_minor;
      } else {
        buckets.days_90_plus += invoice.amount_due_minor;
      }

      return buckets;
    },
    {
      current: 0,
      days_30: 0,
      days_60: 0,
      days_90_plus: 0,
    }
  );
}

@Injectable()
export class DashboardService {
  constructor(
    private readonly invoicesService: InvoicesService,
    private readonly paymentsService: PaymentsService,
    private readonly subscriptionsService: SubscriptionsService,
  ) {}

  getMetrics(tenantId: string): {
    dashboard: {
      metrics: {
        revenue_today: number;
        outstanding_balance: number;
        invoices_due: number;
      };
      aging: AgingBuckets;
      active_subscriptions: number;
      revenue_trend: Array<Record<string, unknown>>;
      recent_invoices: Array<Record<string, unknown>>;
      recent_payments: Array<Record<string, unknown>>;
    };
  } {
    const invoices = this.invoicesService.listInvoices(tenantId);
    const payments = this.paymentsService.listPayments(tenantId);
    const subscriptions = this.subscriptionsService.listSubscriptions(tenantId);

    const today = new Date().toISOString().slice(0, 10);

    const revenueToday = payments
      .filter((payment) => (payment.payment_date ?? '').slice(0, 10) === today)
      .reduce((total, payment) => total + payment.amount_received_minor, 0);

    const outstandingBalance = invoices.reduce((total, invoice) => total + invoice.amount_due_minor, 0);
    const invoicesDue = invoices.filter((invoice) => invoice.status !== 'draft' && invoice.status !== 'void' && invoice.amount_due_minor > 0).length;
    const activeSubscriptions = subscriptions.filter((subscription) => subscription.status === 'active').length;
    const aging = buildInvoiceAgingBuckets(invoices, today);

    return {
      dashboard: {
        metrics: {
          revenue_today: revenueToday,
          outstanding_balance: outstandingBalance,
          invoices_due: invoicesDue,
        },
        aging,
        active_subscriptions: activeSubscriptions,
        revenue_trend: [],
        recent_invoices: invoices.slice(0, 5).map((invoice) => ({
          invoiceNumber: invoice.invoice_number,
          customer: invoice.customer_id,
          dueDate: invoice.due_date,
          total: invoice.total_minor,
          status: invoice.status,
        })),
        recent_payments: payments.slice(0, 5).map((payment) => ({
          paymentNumber: payment.payment_reference,
          customer: payment.customer_id,
          paymentDate: payment.payment_date,
          amount: payment.amount_received_minor,
          status: payment.status,
        })),
      },
    };
  }
}
