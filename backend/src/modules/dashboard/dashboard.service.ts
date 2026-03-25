import { Injectable } from '@nestjs/common';
import { InvoicesService } from '../invoices/invoices.service';
import { PaymentsService } from '../payments/payments.service';
import { SubscriptionsService } from '../subscriptions/subscriptions.service';
import { InvoiceEntity } from '../invoices/entities/invoice.entity';
import { LedgerRepository } from '../ledger/ledger.repository';

export interface AgingBuckets {
  current: number;
  days_30: number;
  days_60: number;
  days_90_plus: number;
}

export interface BillDueState {
  bill_id: string;
  due_date: string;
  overdue: boolean;
  days_overdue: number;
}

export interface BillDueTracking {
  due: BillDueState[];
  overdue: BillDueState[];
}

function toUtcDate(value: string): Date {
  return new Date(`${value}T00:00:00.000Z`);
}

function calculateDaysPastDue(dueDate: string, asOfDate: string): number {
  const dueDateUtc = toUtcDate(dueDate);
  const asOfUtc = toUtcDate(asOfDate);
  return Math.floor((asOfUtc.getTime() - dueDateUtc.getTime()) / (24 * 60 * 60 * 1000));
}

type BillLikeState = {
  id?: string;
  bill_id?: string;
  status: InvoiceEntity['status'];
  due_date: string | null;
  amount_due_minor: number;
};

export function trackBillDueStates(bills: BillLikeState[], asOfDate: string): BillDueTracking {
  const trackedById = bills.reduce<Map<string, BillLikeState>>((tracked, bill) => {
    const billId = bill.bill_id ?? bill.id;
    if (!billId) {
      return tracked;
    }

    if (tracked.has(billId)) {
      return tracked;
    }

    if (bill.amount_due_minor <= 0) {
      return tracked;
    }

    if (bill.status === 'draft' || bill.status === 'void' || bill.status === 'paid') {
      return tracked;
    }

    if (!bill.due_date) {
      return tracked;
    }

    return new Map(tracked).set(billId, bill);
  }, new Map<string, BillLikeState>());

  const due = Array.from(trackedById.entries()).map(([billId, bill]) => {
    const daysPastDue = calculateDaysPastDue(bill.due_date as string, asOfDate);
    return {
      bill_id: billId,
      due_date: bill.due_date as string,
      overdue: daysPastDue > 0,
      days_overdue: Math.max(0, daysPastDue),
    };
  });

  return {
    due,
    overdue: due.filter((bill) => bill.overdue),
  };
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


export interface RunwayAnalyticsInput {
  current_cash_minor: number;
  inflows_minor: number;
  outflows_minor: number;
}

export interface RunwayAnalyticsResult extends RunwayAnalyticsInput {
  net_burn_minor: number;
  runway_days: number | null;
}

export function computeCurrentCashMinor(ledgerEntries: Array<{ lines: Array<{ account_code: string; direction: 'debit' | 'credit'; amount_minor: number }> }>): number {
  return ledgerEntries.reduce((entrySum, entry) => {
    return entrySum + entry.lines.reduce((lineSum, line) => {
      if (line.account_code !== '1000') {
        return lineSum;
      }

      return lineSum + (line.direction === 'debit' ? line.amount_minor : -line.amount_minor);
    }, 0);
  }, 0);
}

export function computeNetBurnMinor(inflowsMinor: number, outflowsMinor: number): number {
  return outflowsMinor - inflowsMinor;
}

export function computeRunwayAnalytics(input: RunwayAnalyticsInput): RunwayAnalyticsResult {
  const currentCashMinor = Math.max(0, input.current_cash_minor);
  const inflowsMinor = Math.max(0, input.inflows_minor);
  const outflowsMinor = Math.max(0, input.outflows_minor);
  const netBurnMinor = computeNetBurnMinor(inflowsMinor, outflowsMinor);

  if (currentCashMinor === 0 || netBurnMinor <= 0) {
    return {
      current_cash_minor: currentCashMinor,
      inflows_minor: inflowsMinor,
      outflows_minor: outflowsMinor,
      net_burn_minor: netBurnMinor,
      runway_days: null,
    };
  }

  return {
    current_cash_minor: currentCashMinor,
    inflows_minor: inflowsMinor,
    outflows_minor: outflowsMinor,
    net_burn_minor: netBurnMinor,
    runway_days: Number((currentCashMinor / netBurnMinor).toFixed(2)),
  };
}

@Injectable()
export class DashboardService {
  constructor(
    private readonly invoicesService: InvoicesService,
    private readonly paymentsService: PaymentsService,
    private readonly subscriptionsService: SubscriptionsService,
    private readonly ledgerRepository: LedgerRepository,
  ) {}

  getMetrics(tenantId: string): {
    dashboard: {
      metrics: {
        revenue_today: number;
        outstanding_balance: number;
        invoices_due: number;
        runway_days: number | null;
        net_burn_minor: number;
        current_cash_minor: number;
        inflows_minor: number;
        outflows_minor: number;
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

    const currentCashMinor = computeCurrentCashMinor(this.ledgerRepository.listEntries(tenantId));
    const inflowsMinor = payments.reduce((sum, payment) => sum + Math.max(0, payment.amount_received_minor), 0);
    const outflowsMinor = this.computeOutflowsMinor(tenantId);
    const runway = computeRunwayAnalytics({
      current_cash_minor: currentCashMinor,
      inflows_minor: inflowsMinor,
      outflows_minor: outflowsMinor,
    });

    return {
      dashboard: {
        metrics: {
          revenue_today: revenueToday,
          outstanding_balance: outstandingBalance,
          invoices_due: invoicesDue,
          runway_days: runway.runway_days,
          net_burn_minor: runway.net_burn_minor,
          current_cash_minor: runway.current_cash_minor,
          inflows_minor: runway.inflows_minor,
          outflows_minor: runway.outflows_minor,
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

  private computeOutflowsMinor(tenantId: string): number {
    const billPaymentOutflows = this.ledgerRepository.listEntries(tenantId).reduce((sum, entry) => {
      if (entry.source_type !== 'bill') {
        return sum;
      }

      return sum + entry.lines.reduce((lineSum, line) => {
        if (line.account_code !== '1000' || line.direction !== 'credit') {
          return lineSum;
        }

        return lineSum + line.amount_minor;
      }, 0);
    }, 0);

    return Math.max(0, billPaymentOutflows);
  }

}
