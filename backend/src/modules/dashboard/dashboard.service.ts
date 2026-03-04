import { Injectable } from '@nestjs/common';
import { InvoicesService } from '../invoices/invoices.service';
import { PaymentsService } from '../payments/payments.service';
import { SubscriptionsService } from '../subscriptions/subscriptions.service';

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
        active_subscriptions: number;
      };
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
      .filter((payment) => (payment.received_at ?? '').slice(0, 10) === today)
      .reduce((total, payment) => total + payment.amount_minor, 0);

    const outstandingBalance = invoices.reduce((total, invoice) => total + invoice.amount_due_minor, 0);
    const invoicesDue = invoices.filter((invoice) => invoice.status === 'issued' || invoice.status === 'overdue').length;
    const activeSubscriptions = subscriptions.filter((subscription) => subscription.status === 'active').length;

    return {
      dashboard: {
        metrics: {
          revenue_today: revenueToday,
          outstanding_balance: outstandingBalance,
          invoices_due: invoicesDue,
          active_subscriptions: activeSubscriptions,
        },
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
          paymentDate: payment.received_at,
          amount: payment.amount_minor,
          status: payment.status,
        })),
      },
    };
  }
}
