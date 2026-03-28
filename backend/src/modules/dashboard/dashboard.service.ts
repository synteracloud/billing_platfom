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

export interface InflowProjectionLine {
  invoice_id: string;
  due_date: string | null;
  projected_payment_date: string;
  amount_due_minor: number;
  payment_probability: number;
  projected_amount_minor: number;
  days_overdue: number;
}

export interface ArInflowProjection {
  as_of_date: string;
  delay_days: number;
  outstanding_ar_minor: number;
  projected_inflow_minor: number;
  projection_accuracy_ratio: number;
  projections: InflowProjectionLine[];
}

function toUtcDate(value: string): Date {
  return new Date(`${value}T00:00:00.000Z`);
}

function calculateDaysPastDue(dueDate: string, asOfDate: string): number {
  const dueDateUtc = toUtcDate(dueDate);
  const asOfUtc = toUtcDate(asOfDate);
  return Math.floor((asOfUtc.getTime() - dueDateUtc.getTime()) / (24 * 60 * 60 * 1000));
}

function addDaysUtc(dateString: string, days: number): string {
  const date = toUtcDate(dateString);
  const safeDays = Number.isFinite(days) ? Math.max(0, Math.floor(days)) : 0;
  date.setUTCDate(date.getUTCDate() + safeDays);
  return date.toISOString().slice(0, 10);
}

function clampProbability(value: number): number {
  if (!Number.isFinite(value)) {
    return 0;
  }

  return Math.max(0, Math.min(1, value));
}

type ArInvoiceLike = {
  id?: string;
  invoice_id?: string;
  status: InvoiceEntity['status'];
  due_date: string | null;
  amount_due_minor: number;
  payment_probability?: number;
};

export function buildArInflowProjection(
  invoices: ArInvoiceLike[],
  options: {
    asOfDate: string;
    delayDays?: number;
    defaultPaymentProbability?: number;
  }
): ArInflowProjection {
  const delayDays = Number.isFinite(options.delayDays) ? Math.max(0, Math.floor(options.delayDays as number)) : 0;
  const defaultProbability = clampProbability(options.defaultPaymentProbability ?? 1);

  const eligibleInvoices = invoices.filter(
    (invoice) =>
      invoice.amount_due_minor > 0 && invoice.status !== 'draft' && invoice.status !== 'void' && invoice.status !== 'paid' && Boolean(invoice.id ?? invoice.invoice_id)
  );

  const projections = eligibleInvoices.map<InflowProjectionLine>((invoice) => {
    const invoiceId = (invoice.id ?? invoice.invoice_id) as string;
    const dueDate = invoice.due_date;
    const daysOverdue = dueDate ? Math.max(0, calculateDaysPastDue(dueDate, options.asOfDate)) : 0;
    const overdueDecay = Math.max(0.25, 1 - daysOverdue / 180);
    const baseProbability = clampProbability(invoice.payment_probability ?? defaultProbability);
    const effectiveProbability = clampProbability(baseProbability * overdueDecay);
    const projectedAmount = Math.min(invoice.amount_due_minor, Math.floor(invoice.amount_due_minor * effectiveProbability));
    const baseProjectionDate = dueDate ?? options.asOfDate;

    return {
      invoice_id: invoiceId,
      due_date: dueDate,
      projected_payment_date: addDaysUtc(baseProjectionDate, delayDays),
      amount_due_minor: invoice.amount_due_minor,
      payment_probability: effectiveProbability,
      projected_amount_minor: projectedAmount,
      days_overdue: daysOverdue,
    };
  });

  const outstandingAr = projections.reduce((sum, line) => sum + line.amount_due_minor, 0);
  const projectedInflow = projections.reduce((sum, line) => sum + line.projected_amount_minor, 0);

  return {
    as_of_date: options.asOfDate,
    delay_days: delayDays,
    outstanding_ar_minor: outstandingAr,
    projected_inflow_minor: projectedInflow,
    projection_accuracy_ratio: outstandingAr === 0 ? 1 : projectedInflow / outstandingAr,
    projections,
  };
}

export function validateArInflowProjectionAccuracy(
  projection: ArInflowProjection,
  actualCollectedMinorByInvoiceId: Record<string, number>
): { absolute_error_minor: number; accuracy_ratio: number } {
  const { absoluteError, projectedTotal } = projection.projections.reduce(
    (acc, line) => {
      const actual = Math.max(0, actualCollectedMinorByInvoiceId[line.invoice_id] ?? 0);
      return {
        projectedTotal: acc.projectedTotal + line.projected_amount_minor,
        absoluteError: acc.absoluteError + Math.abs(line.projected_amount_minor - actual),
      };
    },
    { projectedTotal: 0, absoluteError: 0 }
  );

  return {
    absolute_error_minor: absoluteError,
    accuracy_ratio: projectedTotal === 0 ? (absoluteError === 0 ? 1 : 0) : Math.max(0, 1 - absoluteError / projectedTotal),
  };
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

export interface TrendPoint {
  date: string;
  amount_minor: number;
}

export interface NetCashflowTrendPoint {
  date: string;
  net_cashflow_minor: number;
}

const CASH_ACCOUNT_CODES = new Set(['1000', '1010']);

export function buildCashflowTrends(
  ledgerEntries: Array<{
    entry_date: string;
    lines: Array<{ account_code: string; direction: 'debit' | 'credit'; amount_minor: number }>;
  }>
): {
  revenue_trend: TrendPoint[];
  expense_trend: TrendPoint[];
  net_cashflow_trend: NetCashflowTrendPoint[];
} {
  const dailyMovement = new Map<string, { inflow_minor: number; outflow_minor: number }>();

  for (const entry of ledgerEntries) {
    const netCashMovement = entry.lines.reduce((sum, line) => {
      if (!CASH_ACCOUNT_CODES.has(line.account_code)) {
        return sum;
      }

      return sum + (line.direction === 'debit' ? line.amount_minor : -line.amount_minor);
    }, 0);

    if (netCashMovement === 0) {
      continue;
    }

    const current = dailyMovement.get(entry.entry_date) ?? { inflow_minor: 0, outflow_minor: 0 };
    if (netCashMovement > 0) {
      current.inflow_minor += netCashMovement;
    } else {
      current.outflow_minor += Math.abs(netCashMovement);
    }
    dailyMovement.set(entry.entry_date, current);
  }

  const byDay = Array.from(dailyMovement.entries())
    .sort(([left], [right]) => left.localeCompare(right))
    .map(([date, movement]) => ({
      date,
      inflow_minor: movement.inflow_minor,
      outflow_minor: movement.outflow_minor,
    }));

  return {
    revenue_trend: byDay.map((point) => ({ date: point.date, amount_minor: point.inflow_minor })),
    expense_trend: byDay.map((point) => ({ date: point.date, amount_minor: point.outflow_minor })),
    net_cashflow_trend: byDay.map((point) => ({
      date: point.date,
      net_cashflow_minor: point.inflow_minor - point.outflow_minor,
    })),
  };
}

export function computeCurrentCashMinor(ledgerEntries: Array<{ lines: Array<{ account_code: string; direction: 'debit' | 'credit'; amount_minor: number }> }>): number {
  return ledgerEntries.reduce((entrySum, entry) => {
    return entrySum + entry.lines.reduce((lineSum, line) => {
      if (!CASH_ACCOUNT_CODES.has(line.account_code)) {
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
      revenue_trend: TrendPoint[];
      expense_trend: TrendPoint[];
      net_cashflow_trend: NetCashflowTrendPoint[];
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

    const ledgerEntries = this.ledgerRepository.listEntries(tenantId);
    const currentCashMinor = computeCurrentCashMinor(ledgerEntries);
    const inflowsMinor = payments.reduce((sum, payment) => sum + Math.max(0, payment.amount_received_minor), 0);
    const outflowsMinor = this.computeOutflowsMinor(ledgerEntries);
    const trends = buildCashflowTrends(ledgerEntries);
    const hasTrendData = trends.net_cashflow_trend.length > 0 || trends.revenue_trend.length > 0 || trends.expense_trend.length > 0;
    const fallbackRevenueTrend = hasTrendData ? trends.revenue_trend : this.buildRevenueTrendFromPayments(payments);
    const fallbackExpenseTrend = hasTrendData ? trends.expense_trend : [];
    const fallbackNetCashflowTrend = hasTrendData
      ? trends.net_cashflow_trend
      : fallbackRevenueTrend.map((point) => ({ date: point.date, net_cashflow_minor: point.amount_minor }));
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
        revenue_trend: fallbackRevenueTrend,
        expense_trend: fallbackExpenseTrend,
        net_cashflow_trend: fallbackNetCashflowTrend,
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

  private computeOutflowsMinor(entries: Array<{ source_type: string; lines: Array<{ account_code: string; direction: 'debit' | 'credit'; amount_minor: number }> }>): number {
    const billPaymentOutflows = entries.reduce((sum, entry) => {
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

  private buildRevenueTrendFromPayments(payments: Array<{ payment_date: string | null; amount_received_minor: number }>): TrendPoint[] {
    const dayTotals = new Map<string, number>();

    for (const payment of payments) {
      if (!payment.payment_date || payment.amount_received_minor <= 0) {
        continue;
      }

      const day = payment.payment_date.slice(0, 10);
      dayTotals.set(day, (dayTotals.get(day) ?? 0) + payment.amount_received_minor);
    }

    return Array.from(dayTotals.entries())
      .sort(([left], [right]) => left.localeCompare(right))
      .map(([date, amount_minor]) => ({ date, amount_minor }));
  }

}
