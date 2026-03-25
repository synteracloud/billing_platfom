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

export interface AnomalyItem {
  type: 'unusual_expense' | 'abnormal_cashflow_change' | 'outlier';
  date: string;
  amount_minor: number;
  metric: 'outflow_minor' | 'net_minor' | 'abs_net_minor';
  threshold_minor: number;
  score: number;
  note: string;
}

export interface AnomalyReport {
  currency_code: string;
  analysis_mode: 'read_only';
  automated_actions_enabled: false;
  thresholds: {
    robust_z_score: number;
    min_samples: number;
    minimum_absolute_minor: number;
  };
  anomalies: AnomalyItem[];
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

  getAnomalies(tenantId: string): AnomalyReport {
    const cashflow = this.getCashflow(tenantId);
    const byDay = cashflow.by_day;
    const anomalies: AnomalyItem[] = [];

    const robustZScore = 3.2;
    const minSamples = 6;
    const minimumAbsoluteMinor = 1000;

    const outflows = byDay.map((point) => point.outflow_minor);
    const netSeries = byDay.map((point) => point.net_minor);
    const absNetSeries = byDay.map((point) => Math.abs(point.net_minor));

    const outflowStats = this.computeRobustStats(outflows);
    const absNetStats = this.computeRobustStats(absNetSeries);
    const netChanges = byDay.slice(1).map((point, index) => point.net_minor - byDay[index].net_minor);
    const netChangeStats = this.computeRobustStats(netChanges);

    byDay.forEach((point, index) => {
      if (byDay.length >= minSamples) {
        const outflowScore = this.computeRobustScore(point.outflow_minor, outflowStats.median, outflowStats.mad);
        if (point.outflow_minor >= minimumAbsoluteMinor && outflowScore >= robustZScore) {
          anomalies.push({
            type: 'unusual_expense',
            date: point.date,
            amount_minor: point.outflow_minor,
            metric: 'outflow_minor',
            threshold_minor: this.computeThreshold(outflowStats.median, outflowStats.mad, robustZScore),
            score: Number(outflowScore.toFixed(2)),
            note: 'Expense outflow is materially above normal baseline.'
          });
        }

        const previousPoint = index > 0 ? byDay[index - 1] : null;
        const netChangeMinor = previousPoint ? point.net_minor - previousPoint.net_minor : 0;
        const netChangeScore = this.computeRobustScore(netChangeMinor, netChangeStats.median, netChangeStats.mad);
        if (
          previousPoint &&
          Math.abs(netChangeMinor) >= minimumAbsoluteMinor &&
          (Math.abs(netChangeScore) >= robustZScore ||
            Math.abs(netChangeMinor) >= minimumAbsoluteMinor * 2.5)
        ) {
          anomalies.push({
            type: 'abnormal_cashflow_change',
            date: point.date,
            amount_minor: netChangeMinor,
            metric: 'net_minor',
            threshold_minor: this.computeThreshold(netChangeStats.median, netChangeStats.mad, robustZScore),
            score: Number(netChangeScore.toFixed(2)),
            note: 'Net cashflow shift deviates significantly from expected pattern.'
          });
        }

        const absNetScore = this.computeRobustScore(Math.abs(point.net_minor), absNetStats.median, absNetStats.mad);
        if (Math.abs(point.net_minor) >= minimumAbsoluteMinor && absNetScore >= robustZScore + 0.4) {
          anomalies.push({
            type: 'outlier',
            date: point.date,
            amount_minor: point.net_minor,
            metric: 'abs_net_minor',
            threshold_minor: this.computeThreshold(absNetStats.median, absNetStats.mad, robustZScore + 0.4),
            score: Number(absNetScore.toFixed(2)),
            note: 'Cash movement magnitude is an outlier versus recent activity.'
          });
        }
      }
    });

    return {
      currency_code: cashflow.currency_code,
      analysis_mode: 'read_only',
      automated_actions_enabled: false,
      thresholds: {
        robust_z_score: robustZScore,
        min_samples: minSamples,
        minimum_absolute_minor: minimumAbsoluteMinor
      },
      anomalies
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

  private computeRobustStats(values: number[]): { median: number; mad: number } {
    const median = this.computeMedian(values);
    const deviations = values.map((value) => Math.abs(value - median));
    const mad = this.computeMedian(deviations);
    return { median, mad };
  }

  private computeMedian(values: number[]): number {
    if (values.length === 0) {
      return 0;
    }

    const sorted = [...values].sort((left, right) => left - right);
    const middle = Math.floor(sorted.length / 2);
    if (sorted.length % 2 === 0) {
      return (sorted[middle - 1] + sorted[middle]) / 2;
    }

    return sorted[middle];
  }

  private computeRobustScore(value: number, median: number, mad: number): number {
    if (mad === 0) {
      return value === median ? 0 : Number.POSITIVE_INFINITY;
    }

    return (0.6745 * (value - median)) / mad;
  }

  private computeThreshold(median: number, mad: number, zScore: number): number {
    return Math.round(median + (zScore * mad) / 0.6745);
  }
}
