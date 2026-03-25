import { Injectable } from '@nestjs/common';
import { ApRepository } from '../ap/ap.repository';
import { ArRepository } from '../ar/ar.repository';
import { LedgerRepository } from '../ledger/ledger.repository';

const CASH_ACCOUNT_CODES = new Set(['1000', '1010']);

export interface CashflowPoint {
  date: string;
  inflow_minor: number;
  outflow_minor: number;
  net_minor: number;
}

export interface CashflowReport {
  currency_code: string;
  totals: {
    inflow_minor: number;
    outflow_minor: number;
    net_minor: number;
  };
  by_day: CashflowPoint[];
}

export interface ProjectionPoint {
  date: string;
  amount_minor: number;
}

export interface ProjectionReport {
  currency_code: string;
  total_minor: number;
  by_day: ProjectionPoint[];
}

export interface RunwayReport {
  currency_code: string;
  cash_on_hand_minor: number;
  projected_daily_net_burn_minor: number;
  projected_runway_days: number | null;
  based_on_horizon_days: number;
}

export interface CollectionPrediction {
  invoice_id: string;
  customer_id: string;
  due_date: string | null;
  open_amount_minor: number;
  probability_of_delay: number;
  risk_level: 'low' | 'medium' | 'high';
  drivers: string[];
}

export interface CollectionsPredictionReport {
  assistive_only: true;
  no_automatic_actions: true;
  model_version: string;
  generated_at: string;
  predictions: CollectionPrediction[];
}

@Injectable()
export class AnalyticsService {
  constructor(
    private readonly ledgerRepository: LedgerRepository,
    private readonly arRepository: ArRepository,
    private readonly apRepository: ApRepository
  ) {}

  getCashflow(tenantId: string): CashflowReport {
    const dayTotals = new Map<string, { inflow_minor: number; outflow_minor: number }>();
    let currencyCode = 'USD';

    for (const entry of this.ledgerRepository.listEntries(tenantId)) {
      currencyCode = entry.currency_code || currencyCode;
      const netCashMovement = entry.lines.reduce((sum, line) => {
        if (!CASH_ACCOUNT_CODES.has(line.account_code)) {
          return sum;
        }

        return sum + (line.direction === 'debit' ? line.amount_minor : -line.amount_minor);
      }, 0);

      if (netCashMovement === 0) {
        continue;
      }

      const day = entry.entry_date;
      const current = dayTotals.get(day) ?? { inflow_minor: 0, outflow_minor: 0 };
      if (netCashMovement > 0) {
        current.inflow_minor += netCashMovement;
      } else {
        current.outflow_minor += Math.abs(netCashMovement);
      }
      dayTotals.set(day, current);
    }

    const byDay = Array.from(dayTotals.entries())
      .sort(([left], [right]) => left.localeCompare(right))
      .map(([date, point]) => ({
        date,
        inflow_minor: point.inflow_minor,
        outflow_minor: point.outflow_minor,
        net_minor: point.inflow_minor - point.outflow_minor
      }));

    const totals = byDay.reduce(
      (acc, point) => {
        acc.inflow_minor += point.inflow_minor;
        acc.outflow_minor += point.outflow_minor;
        acc.net_minor += point.net_minor;
        return acc;
      },
      { inflow_minor: 0, outflow_minor: 0, net_minor: 0 }
    );

    return {
      currency_code: currencyCode,
      totals,
      by_day: byDay
    };
  }

  getInflowProjection(tenantId: string): ProjectionReport {
    const invoices = this.arRepository.listInvoices(tenantId).filter((invoice) => invoice.status === 'open' && invoice.open_amount_minor > 0);
    return this.buildProjection(
      invoices.map((invoice) => ({
        date: invoice.due_date ?? invoice.issue_date,
        amount_minor: invoice.open_amount_minor,
        currency_code: invoice.currency_code
      }))
    );
  }

  getOutflowProjection(tenantId: string): ProjectionReport {
    const bills = this.apRepository.listBills(tenantId).filter((bill) => bill.status === 'open' && bill.open_amount_minor > 0);
    return this.buildProjection(
      bills.map((bill) => ({
        date: bill.due_date ?? bill.approved_at,
        amount_minor: bill.open_amount_minor,
        currency_code: bill.currency_code
      }))
    );
  }

  getRunway(tenantId: string, horizonDays = 90): RunwayReport {
    const horizon = Number.isFinite(horizonDays) && horizonDays > 0 ? Math.floor(horizonDays) : 90;
    const cashflow = this.getCashflow(tenantId);
    const inflow = this.getInflowProjection(tenantId);
    const outflow = this.getOutflowProjection(tenantId);

    const cashOnHandMinor = cashflow.totals.net_minor;
    const projectedPeriodBurnMinor = Math.max(0, outflow.total_minor - inflow.total_minor);
    const projectedDailyBurnMinor = projectedPeriodBurnMinor / horizon;
    const projectedRunwayDays = projectedDailyBurnMinor <= 0 ? null : Math.floor(cashOnHandMinor / projectedDailyBurnMinor);

    return {
      currency_code: cashflow.currency_code,
      cash_on_hand_minor: cashOnHandMinor,
      projected_daily_net_burn_minor: Math.round(projectedDailyBurnMinor),
      projected_runway_days: projectedRunwayDays,
      based_on_horizon_days: horizon
    };
  }

  getCollectionsPrediction(tenantId: string): CollectionsPredictionReport {
    const invoices = this.arRepository.listInvoices(tenantId);
    const openInvoices = invoices.filter((invoice) => invoice.status === 'open' && invoice.open_amount_minor > 0);
    const historical = invoices.filter((invoice) => invoice.status === 'closed' && Boolean(invoice.due_date));
    const byCustomer = new Map<string, typeof historical>();

    for (const entry of historical) {
      const bucket = byCustomer.get(entry.customer_id) ?? [];
      bucket.push(entry);
      byCustomer.set(entry.customer_id, bucket);
    }

    const portfolioPattern = this.computePattern(historical);
    const portfolioOpenAmounts = openInvoices.map((invoice) => invoice.open_amount_minor);

    const predictions = openInvoices
      .map((invoice) => {
        const customerPattern = this.computePattern(byCustomer.get(invoice.customer_id) ?? []);
        const effectiveLateRatio = customerPattern.sample_size > 0 ? customerPattern.late_ratio : portfolioPattern.late_ratio;
        const effectiveAvgDelay = customerPattern.sample_size > 0 ? customerPattern.avg_delay_days : portfolioPattern.avg_delay_days;
        const overdueDays = invoice.due_date ? this.dayDistance(invoice.due_date, this.todayUtcDate()) : 0;
        const normalizedOverdue = this.normalize(overdueDays, 0, 45);
        const normalizedDelayPattern = this.normalize(effectiveAvgDelay, 0, 30);
        const normalizedOpenAmount = this.normalize(
          invoice.open_amount_minor,
          0,
          Math.max(1, this.percentile95(portfolioOpenAmounts))
        );
        const paymentCompletionRatio = invoice.total_minor > 0
          ? this.normalize(invoice.paid_amount_minor / invoice.total_minor, 0, 1)
          : 0;
        const normalizedUnpaidRatio = this.normalize(1 - paymentCompletionRatio, 0, 1);

        const score = 0.1
          + (effectiveLateRatio * 0.35)
          + (normalizedDelayPattern * 0.25)
          + (normalizedOverdue * 0.25)
          + (normalizedOpenAmount * 0.1)
          + (normalizedUnpaidRatio * 0.1);

        const probability = this.roundProbability(this.normalize(score, 0, 1));
        const drivers: string[] = [];
        if (effectiveLateRatio >= 0.4) {
          drivers.push('customer_history_late_payments');
        }
        if (effectiveAvgDelay >= 7) {
          drivers.push('customer_average_delay_high');
        }
        if (overdueDays > 0) {
          drivers.push('invoice_currently_overdue');
        }
        if (normalizedOpenAmount >= 0.75) {
          drivers.push('high_open_balance');
        }
        if (drivers.length === 0) {
          drivers.push('stable_payment_pattern');
        }

        return {
          invoice_id: invoice.invoice_id,
          customer_id: invoice.customer_id,
          due_date: invoice.due_date,
          open_amount_minor: invoice.open_amount_minor,
          probability_of_delay: probability,
          risk_level: this.toRiskLevel(probability),
          drivers
        } satisfies CollectionPrediction;
      })
      .sort((left, right) => right.probability_of_delay - left.probability_of_delay || left.invoice_id.localeCompare(right.invoice_id));

    return {
      assistive_only: true,
      no_automatic_actions: true,
      model_version: 'collections.v1',
      generated_at: new Date().toISOString(),
      predictions
    };
  }

  private buildProjection(items: Array<{ date: string; amount_minor: number; currency_code: string }>): ProjectionReport {
    const byDay = new Map<string, number>();
    let currencyCode = 'USD';

    for (const item of items) {
      currencyCode = item.currency_code || currencyCode;
      byDay.set(item.date, (byDay.get(item.date) ?? 0) + item.amount_minor);
    }

    const points = Array.from(byDay.entries())
      .sort(([left], [right]) => left.localeCompare(right))
      .map(([date, amount_minor]) => ({ date, amount_minor }));

    return {
      currency_code: currencyCode,
      total_minor: points.reduce((sum, item) => sum + item.amount_minor, 0),
      by_day: points
    };
  }

  private computePattern(invoices: Array<{ due_date: string | null; updated_at: string }>): {
    sample_size: number;
    late_ratio: number;
    avg_delay_days: number;
  } {
    const valid = invoices.filter((invoice) => Boolean(invoice.due_date));
    if (valid.length === 0) {
      return {
        sample_size: 0,
        late_ratio: 0.2,
        avg_delay_days: 3
      };
    }

    const delays = valid.map((invoice) => {
      const paidDate = invoice.updated_at.slice(0, 10);
      const dueDate = invoice.due_date as string;
      return Math.max(0, this.dayDistance(dueDate, paidDate));
    });
    const lateCount = delays.filter((delay) => delay > 0).length;
    const lateRatio = lateCount / valid.length;
    const avgDelay = delays.reduce((sum, delay) => sum + delay, 0) / valid.length;

    return {
      sample_size: valid.length,
      late_ratio: this.normalize(lateRatio, 0, 1),
      avg_delay_days: Math.max(0, avgDelay)
    };
  }

  private percentile95(values: number[]): number {
    if (values.length === 0) {
      return 1;
    }
    const sorted = [...values].sort((left, right) => left - right);
    const index = Math.min(sorted.length - 1, Math.floor((sorted.length - 1) * 0.95));
    return sorted[index];
  }

  private normalize(value: number, min: number, max: number): number {
    if (!Number.isFinite(value) || max <= min) {
      return 0;
    }
    const normalized = (value - min) / (max - min);
    return Math.max(0, Math.min(1, normalized));
  }

  private dayDistance(from: string, to: string): number {
    const fromTime = Date.parse(`${from}T00:00:00.000Z`);
    const toTime = Date.parse(`${to}T00:00:00.000Z`);
    if (!Number.isFinite(fromTime) || !Number.isFinite(toTime)) {
      return 0;
    }
    return Math.floor((toTime - fromTime) / 86_400_000);
  }

  private roundProbability(value: number): number {
    return Math.round(Math.max(0.01, Math.min(0.99, value)) * 1000) / 1000;
  }

  private toRiskLevel(probability: number): 'low' | 'medium' | 'high' {
    if (probability >= 0.67) {
      return 'high';
    }
    if (probability >= 0.34) {
      return 'medium';
    }
    return 'low';
  }

  private todayUtcDate(): string {
    return new Date().toISOString().slice(0, 10);
  }
}
