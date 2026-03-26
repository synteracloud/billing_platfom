import { Injectable } from '@nestjs/common';
import { ApRepository } from '../ap/ap.repository';
import { ArRepository } from '../ar/ar.repository';
import { LedgerRepository } from '../ledger/ledger.repository';

const CASH_ACCOUNT_CODES = new Set(['1000', '1010']);

export type TransactionClassificationCategory =
  | 'expense'
  | 'revenue'
  | 'asset'
  | 'liability'
  | 'transfer'
  | 'equity'
  | 'other';

export interface ClassificationInput {
  amount_minor?: number | null;
  transaction_description?: string | null;
  metadata?: Record<string, unknown> | null;
  ocr?: {
    text?: string | null;
    fields?: Record<string, string | number | boolean | null> | null;
  } | null;
}

export interface ClassificationResult {
  category: TransactionClassificationCategory;
  confidence_score: number;
  rationale: string[];
  deterministic_fallback_used: boolean;
}

export interface CollectionsPredictionItem {
  invoice_id: string;
  customer_id: string;
  due_date: string;
  open_amount_minor: number;
  probability_of_delay: number;
  drivers: string[];
  rationale: string[];
}

export interface CollectionsPredictionReport {
  assistive_only: true;
  no_automatic_actions: true;
  model_version: 'deterministic_v1';
  predictions: CollectionsPredictionItem[];
}

export interface CopilotSuggestion {
  suggestion_id: string;
  priority: 'high' | 'medium' | 'low';
  summary: string;
  rationale: string[];
  recommended_actions: string[];
  authoritative: false;
}

export interface CopilotSuggestionReport {
  assistive_only: true;
  authoritative: false;
  no_automatic_actions: true;
  suggestions: CopilotSuggestion[];
}

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


export interface TaxSummaryReport {
  tax_collected_minor: number;
  tax_paid_minor: number;
  net_tax_liability_minor: number;
  by_jurisdiction: Array<{
    jurisdiction: string;
    tax_collected_minor: number;
    tax_paid_minor: number;
    net_tax_liability_minor: number;
  }>;
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


  getTaxSummary(tenantId: string): TaxSummaryReport {
    const totals = this.ledgerRepository.listEntries(tenantId).reduce((acc, entry) => {
      for (const line of entry.lines) {
        if (line.account_code !== '2100') {
          continue;
        }
        if (line.direction === 'credit') {
          acc.tax_collected_minor += line.amount_minor;
        } else {
          acc.tax_paid_minor += line.amount_minor;
        }
      }
      return acc;
    }, { tax_collected_minor: 0, tax_paid_minor: 0 });

    const net = totals.tax_collected_minor - totals.tax_paid_minor;
    return {
      ...totals,
      net_tax_liability_minor: net,
      by_jurisdiction: [{
        jurisdiction: 'GLOBAL',
        tax_collected_minor: totals.tax_collected_minor,
        tax_paid_minor: totals.tax_paid_minor,
        net_tax_liability_minor: net
      }]
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

  classifyTransaction(input: ClassificationInput): ClassificationResult {
    const evidence = [
      input.transaction_description,
      typeof input.metadata?.['merchant_name'] === 'string' ? String(input.metadata['merchant_name']) : null,
      input.ocr?.text,
      ...Object.values(input.ocr?.fields ?? {}).map((value) => (value == null ? null : String(value)))
    ]
      .filter((value): value is string => Boolean(value))
      .join(' ')
      .toLowerCase();

    const categorySignals: Array<{ category: TransactionClassificationCategory; keywords: string[]; reason: string }> = [
      { category: 'expense', keywords: ['bill', 'vendor', 'expense', 'utilities', 'rent', 'office'], reason: 'expense_keywords' },
      { category: 'revenue', keywords: ['invoice', 'customer payment', 'sale', 'subscription'], reason: 'revenue_keywords' },
      { category: 'asset', keywords: ['equipment', 'deposit', 'prepaid', 'asset'], reason: 'asset_keywords' },
      { category: 'liability', keywords: ['loan', 'tax payable', 'payroll payable', 'liability'], reason: 'liability_keywords' },
      { category: 'transfer', keywords: ['transfer', 'sweep', 'internal move'], reason: 'transfer_keywords' },
      { category: 'equity', keywords: ['owner contribution', 'dividend', 'equity'], reason: 'equity_keywords' }
    ];

    const scored = categorySignals
      .map((signal) => {
        const matchedKeywords = signal.keywords.filter((keyword) => this.evidenceContainsKeyword(evidence, keyword));
        return {
          category: signal.category,
          count: matchedKeywords.length,
          matchedKeywords,
          reason: signal.reason
        };
      })
      .filter((signal) => signal.count > 0)
      .sort((left, right) => right.count - left.count);

    if (scored.length === 0) {
      return {
        category: 'other',
        confidence_score: 0.35,
        rationale: ['No deterministic keyword signal found; defaulting to other'],
        deterministic_fallback_used: true
      };
    }

    const top = scored[0];
    const second = scored[1];
    if (second && second.count === top.count) {
      return {
        category: 'other',
        confidence_score: 0.38,
        rationale: ['Conflicting deterministic signals detected; defaulting to other for safety'],
        deterministic_fallback_used: true
      };
    }

    const confidenceScore = Math.max(0.4, Math.min(0.95, 0.45 + top.count * 0.15));
    return {
      category: top.category,
      confidence_score: Number(confidenceScore.toFixed(2)),
      rationale: [`Matched ${top.reason}`, ...top.matchedKeywords.map((keyword) => `keyword:${keyword}`)],
      deterministic_fallback_used: false
    };
  }

  getCollectionsPrediction(tenantId: string): CollectionsPredictionReport {
    const invoices = this.arRepository.listInvoices(tenantId);
    const closedInvoices = invoices.filter((invoice) => invoice.status === 'closed');
    const openInvoices = invoices.filter((invoice) => invoice.status === 'open' && invoice.open_amount_minor > 0);

    const customerHistory = new Map<
      string,
      {
        total_closed: number;
        late_count: number;
        cumulative_late_days: number;
      }
    >();

    for (const invoice of closedInvoices) {
      const history = customerHistory.get(invoice.customer_id) ?? { total_closed: 0, late_count: 0, cumulative_late_days: 0 };
      history.total_closed += 1;
      const daysLate = this.diffInDaysSigned(invoice.updated_at, invoice.due_date ?? invoice.issue_date);
      if (daysLate > 0) {
        history.late_count += 1;
        history.cumulative_late_days += daysLate;
      }
      customerHistory.set(invoice.customer_id, history);
    }

    const referenceDate = invoices
      .map((invoice) => this.resolveGroundedDate(invoice.updated_at, invoice.due_date, invoice.issue_date))
      .sort((left, right) => right.localeCompare(left))[0]
      ?.slice(0, 10) ?? '1970-01-01';

    const predictions = openInvoices
      .map((invoice) => {
        const history = customerHistory.get(invoice.customer_id) ?? { total_closed: 0, late_count: 0, cumulative_late_days: 0 };
        const lateRatio = history.total_closed === 0 ? 0.25 : history.late_count / history.total_closed;
        const avgLateDays = history.late_count === 0 ? 0 : history.cumulative_late_days / history.late_count;
        const invoiceDueDate = this.resolveGroundedDate(invoice.due_date, invoice.issue_date, invoice.updated_at);
        const overdueDays = Math.max(0, this.diffInDaysSigned(referenceDate, invoiceDueDate));
        const groundedOpenAmountMinor = this.toGroundedMinor(invoice.open_amount_minor);

        const score =
          0.2 +
          lateRatio * 0.5 +
          Math.min(1, avgLateDays / 30) * 0.15 +
          Math.min(1, overdueDays / 30) * 0.15;
        const probability = Number(Math.max(0.01, Math.min(0.99, score)).toFixed(4));

        const drivers: string[] = [];
        if (lateRatio >= 0.4) {
          drivers.push('customer_history_late_payments');
        }
        if (avgLateDays >= 7) {
          drivers.push('customer_history_avg_days_late');
        }
        if (overdueDays > 0) {
          drivers.push('invoice_currently_overdue');
        }
        if (drivers.length === 0) {
          drivers.push('baseline_open_invoice_risk');
        }

        return {
          invoice_id: invoice.invoice_id,
          customer_id: invoice.customer_id,
          due_date: invoiceDueDate,
          open_amount_minor: groundedOpenAmountMinor,
          probability_of_delay: probability,
          drivers,
          rationale: [
            `late_ratio=${lateRatio.toFixed(2)}`,
            `avg_late_days=${avgLateDays.toFixed(1)}`,
            `overdue_days=${overdueDays}`,
            'grounded_from_ar_history=true'
          ]
        };
      })
      .sort((left, right) => {
        if (right.probability_of_delay !== left.probability_of_delay) {
          return right.probability_of_delay - left.probability_of_delay;
        }

        if (left.due_date !== right.due_date) {
          return left.due_date.localeCompare(right.due_date);
        }

        return left.invoice_id.localeCompare(right.invoice_id);
      });

    return {
      assistive_only: true,
      no_automatic_actions: true,
      model_version: 'deterministic_v1',
      predictions
    };
  }

  getCopilotSuggestions(tenantId: string): CopilotSuggestionReport {
    const anomalies = this.getAnomalies(tenantId).anomalies.slice(0, 2);
    const collections = this.getCollectionsPrediction(tenantId).predictions.slice(0, 2);
    const suggestions: CopilotSuggestion[] = [];

    for (const anomaly of anomalies) {
      suggestions.push({
        suggestion_id: `anomaly-${anomaly.date}-${anomaly.type}`,
        priority: anomaly.score >= 5 ? 'high' : 'medium',
        summary: `Review ${anomaly.type.replaceAll('_', ' ')} on ${anomaly.date}`,
        rationale: [anomaly.note, `score=${anomaly.score}`, `threshold_minor=${anomaly.threshold_minor}`],
        recommended_actions: ['Verify supporting entries in ledger', 'Confirm source transaction metadata before any action'],
        authoritative: false
      });
    }

    for (const row of collections) {
      if (row.probability_of_delay < 0.5) {
        continue;
      }

      suggestions.push({
        suggestion_id: `collections-${row.invoice_id}`,
        priority: row.probability_of_delay >= 0.75 ? 'high' : 'medium',
        summary: `Prepare proactive follow-up for invoice ${row.invoice_id}`,
        rationale: [`Predicted delay probability ${row.probability_of_delay}`, ...row.drivers],
        recommended_actions: ['Queue reminder draft for analyst review', 'Cross-check customer payment history before outreach'],
        authoritative: false
      });
    }

    if (suggestions.length === 0) {
      suggestions.push({
        suggestion_id: 'monitoring-baseline',
        priority: 'low',
        summary: 'No elevated AI signals; continue routine monitoring',
        rationale: ['No high-confidence anomaly or collections risk detected from current records'],
        recommended_actions: ['Keep weekly review cadence', 'Treat AI output as assistive context only'],
        authoritative: false
      });
    }

    return {
      assistive_only: true,
      authoritative: false,
      no_automatic_actions: true,
      suggestions
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
      const baseline = Math.max(Math.abs(median), 1);
      const relativeDelta = Math.abs(value - median) / baseline;
      return relativeDelta * 0.6745;
    }

    return (0.6745 * (value - median)) / mad;
  }

  private computeThreshold(median: number, mad: number, zScore: number): number {
    return Math.round(median + (zScore * mad) / 0.6745);
  }

  private diffInDaysSigned(left: string, right: string): number {
    const leftTime = Date.parse(left);
    const rightTime = Date.parse(right);
    if (!Number.isFinite(leftTime) || !Number.isFinite(rightTime)) {
      return 0;
    }

    const dayMs = 24 * 60 * 60 * 1000;
    return Math.round((leftTime - rightTime) / dayMs);
  }

  private evidenceContainsKeyword(evidence: string, keyword: string): boolean {
    const normalizedKeyword = keyword.trim().toLowerCase();
    if (!normalizedKeyword) {
      return false;
    }

    if (normalizedKeyword.includes(' ')) {
      return evidence.includes(normalizedKeyword);
    }

    const pattern = new RegExp(`\\b${this.escapeForRegExp(normalizedKeyword)}\\b`, 'i');
    return pattern.test(evidence);
  }

  private escapeForRegExp(value: string): string {
    return value.replace(/[.*+?^${}()|[\]\\]/g, '\\$&');
  }

  private resolveGroundedDate(...values: Array<string | null | undefined>): string {
    for (const value of values) {
      if (!value) {
        continue;
      }

      const parsed = Date.parse(value);
      if (Number.isFinite(parsed)) {
        return new Date(parsed).toISOString().slice(0, 10);
      }
    }

    return '1970-01-01';
  }

  private toGroundedMinor(value: number): number {
    if (!Number.isFinite(value)) {
      return 0;
    }

    return Math.max(0, Math.round(value));
  }
}
