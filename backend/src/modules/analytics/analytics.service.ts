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

type ClassificationRule = {
  category: TransactionClassificationCategory;
  weight: number;
  label: string;
  keywords: string[];
};

const CLASSIFICATION_RULES: ClassificationRule[] = [
  {
    category: 'revenue',
    weight: 0.46,
    label: 'Revenue terms',
    keywords: ['invoice', 'payment received', 'sale', 'subscription', 'deposit from customer', 'customer payment', 'income', 'payout']
  },
  {
    category: 'expense',
    weight: 0.46,
    label: 'Expense terms',
    keywords: ['bill', 'vendor', 'payroll', 'expense', 'rent', 'utility', 'supplier', 'purchase', 'withdrawal', 'fee', 'tax payment']
  },
  {
    category: 'transfer',
    weight: 0.54,
    label: 'Transfer terms',
    keywords: ['transfer', 'internal transfer', 'sweep', 'cash move', 'wallet transfer', 'bank transfer']
  },
  {
    category: 'asset',
    weight: 0.4,
    label: 'Asset terms',
    keywords: ['equipment', 'capitalized', 'prepaid', 'fixed asset', 'inventory purchase']
  },
  {
    category: 'liability',
    weight: 0.42,
    label: 'Liability terms',
    keywords: ['loan', 'debt', 'credit card payable', 'accrued', 'interest payable']
  },
  {
    category: 'equity',
    weight: 0.5,
    label: 'Equity terms',
    keywords: ['owner contribution', 'share issuance', 'dividend', 'capital contribution']
  }
];

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

  classifyTransaction(input: ClassificationInput): ClassificationResult {
    const normalizedDescription = (input.transaction_description ?? '').trim().toLowerCase();
    const normalizedMetadata = this.flattenText(input.metadata);
    const normalizedOcrText = (input.ocr?.text ?? '').trim().toLowerCase();
    const normalizedOcrFields = this.flattenText(input.ocr?.fields);
    const haystack = [normalizedDescription, normalizedMetadata, normalizedOcrText, normalizedOcrFields].filter(Boolean).join(' ');
    const amountMinor = typeof input.amount_minor === 'number' ? input.amount_minor : null;

    const scores = new Map<TransactionClassificationCategory, number>();
    const rationale: string[] = [];

    for (const rule of CLASSIFICATION_RULES) {
      let hits = 0;
      for (const keyword of rule.keywords) {
        if (this.hasKeywordMatch(haystack, keyword)) {
          hits += 1;
        }
      }

      if (hits > 0) {
        const scoreContribution = Math.min(1, hits / 2) * rule.weight;
        scores.set(rule.category, (scores.get(rule.category) ?? 0) + scoreContribution);
        rationale.push(`${rule.label}: ${hits} match(es)`);
      }
    }

    if (this.hasKeywordMatch(haystack, 'refund') || this.hasKeywordMatch(haystack, 'chargeback')) {
      scores.set('expense', (scores.get('expense') ?? 0) + 0.2);
      rationale.push('Refund/chargeback marker');
    }

    if (this.hasKeywordMatch(haystack, 'capital call') || this.hasKeywordMatch(haystack, 'owner draw')) {
      scores.set('equity', (scores.get('equity') ?? 0) + 0.2);
      rationale.push('Equity marker');
    }

    const scored = Array.from(scores.entries()).sort(([leftCategory, leftScore], [rightCategory, rightScore]) => {
      if (rightScore !== leftScore) {
        return rightScore - leftScore;
      }
      return leftCategory.localeCompare(rightCategory);
    });

    if (scored.length === 0) {
      return {
        category: this.getFallbackCategory(amountMinor),
        confidence_score: 0.25,
        rationale: ['Deterministic fallback'],
        deterministic_fallback_used: true
      };
    }

    const [topCategory, topScore] = scored[0];
    const secondScore = scored[1]?.[1] ?? 0;
    const separation = Math.max(0, topScore - secondScore);
    const normalizedConfidence = Math.min(0.99, Math.max(0.3, topScore * 0.7 + separation * 0.4));

    return {
      category: topCategory,
      confidence_score: Number(normalizedConfidence.toFixed(4)),
      rationale,
      deterministic_fallback_used: false
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

  private flattenText(value: unknown): string {
    if (!value || typeof value !== 'object') {
      return '';
    }

    return Object.values(value as Record<string, unknown>)
      .map((item) => (item == null ? '' : String(item).trim().toLowerCase()))
      .filter(Boolean)
      .join(' ');
  }

  private getFallbackCategory(amountMinor: number | null): TransactionClassificationCategory {
    if (amountMinor == null || amountMinor === 0) {
      return 'other';
    }

    return amountMinor > 0 ? 'revenue' : 'expense';
  }

  private hasKeywordMatch(haystack: string, keyword: string): boolean {
    const escaped = keyword.replace(/[.*+?^${}()|[\]\\]/g, '\\$&');
    const pattern = new RegExp(`(^|\\W)${escaped}(\\W|$)`);
    return pattern.test(haystack);
  }
}
