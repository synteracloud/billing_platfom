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
