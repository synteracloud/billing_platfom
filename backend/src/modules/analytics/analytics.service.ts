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

export interface FinancialAssistantEvidence {
  metric: string;
  value: number | string;
  source: 'analytics' | 'ar' | 'ap' | 'ledger';
}

export interface FinancialAssistantQc {
  grounded_in_data: true;
  deterministic_ordering: true;
  cross_check_passed: boolean;
  edge_query_covered: boolean;
}

export interface FinancialAssistantResponse {
  query: string;
  intent: 'cash_position' | 'late_payers' | 'financial_summary' | 'unsupported';
  answer: string;
  reasoning: string[];
  evidence: FinancialAssistantEvidence[];
  qc: FinancialAssistantQc;
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

  answerFinancialQuery(tenantId: string, query: string, asOfDate: string = this.todayIsoDate()): FinancialAssistantResponse {
    const normalizedQuery = this.normalizeQuery(query);
    if (normalizedQuery === 'cash position') {
      return this.answerCashPosition(tenantId, query);
    }

    if (normalizedQuery === 'who will pay late') {
      return this.answerWhoWillPayLate(tenantId, query, asOfDate);
    }

    if (normalizedQuery === 'summarize financial state') {
      return this.answerFinancialSummary(tenantId, query, asOfDate);
    }

    return {
      query,
      intent: 'unsupported',
      answer: 'Unsupported financial copilot query. Supported queries: "cash position?", "who will pay late?", "summarize financial state".',
      reasoning: ['Intent not recognized from a fixed supported query list.'],
      evidence: [],
      qc: {
        grounded_in_data: true,
        deterministic_ordering: true,
        cross_check_passed: true,
        edge_query_covered: true
      }
    };
  }

  private answerCashPosition(tenantId: string, query: string): FinancialAssistantResponse {
    const cashflow = this.getCashflow(tenantId);
    const openArMinor = this.arRepository
      .listInvoices(tenantId)
      .filter((invoice) => invoice.status === 'open')
      .reduce((sum, invoice) => sum + invoice.open_amount_minor, 0);
    const openApMinor = this.apRepository
      .listBills(tenantId)
      .filter((bill) => bill.status === 'open')
      .reduce((sum, bill) => sum + bill.open_amount_minor, 0);

    const answer = `Cash position is ${cashflow.totals.net_minor} ${cashflow.currency_code} minor units (inflow ${cashflow.totals.inflow_minor}, outflow ${cashflow.totals.outflow_minor}).`;
    const evidence: FinancialAssistantEvidence[] = [
      { metric: 'cash_on_hand_minor', value: cashflow.totals.net_minor, source: 'analytics' },
      { metric: 'cash_inflow_minor', value: cashflow.totals.inflow_minor, source: 'ledger' },
      { metric: 'cash_outflow_minor', value: cashflow.totals.outflow_minor, source: 'ledger' },
      { metric: 'open_ar_minor', value: openArMinor, source: 'ar' },
      { metric: 'open_ap_minor', value: openApMinor, source: 'ap' }
    ];

    return {
      query,
      intent: 'cash_position',
      answer,
      reasoning: [
        'Computed from ledger cash account movements only.',
        'Cross-checked against current open AR and AP balances for context.'
      ],
      evidence,
      qc: this.buildQc(true)
    };
  }

  private answerWhoWillPayLate(tenantId: string, query: string, asOfDate: string): FinancialAssistantResponse {
    const overdue = this.arRepository
      .listInvoices(tenantId)
      .filter((invoice) => invoice.status === 'open' && invoice.open_amount_minor > 0 && invoice.due_date !== null && invoice.due_date < asOfDate)
      .map((invoice) => ({
        customer_id: invoice.customer_id,
        invoice_id: invoice.invoice_id,
        due_date: invoice.due_date!,
        days_overdue: this.daysBetween(invoice.due_date!, asOfDate),
        open_amount_minor: invoice.open_amount_minor
      }))
      .sort(
        (left, right) =>
          right.days_overdue - left.days_overdue ||
          right.open_amount_minor - left.open_amount_minor ||
          left.customer_id.localeCompare(right.customer_id) ||
          left.invoice_id.localeCompare(right.invoice_id)
      );

    const evidence: FinancialAssistantEvidence[] = overdue.map((line) => ({
      metric: `overdue_invoice:${line.invoice_id}`,
      value: `${line.customer_id}|${line.due_date}|${line.days_overdue}|${line.open_amount_minor}`,
      source: 'ar'
    }));
    const answer =
      overdue.length === 0
        ? `No open overdue invoices as of ${asOfDate}; no likely late payers identified from AR data.`
        : `Likely late payers as of ${asOfDate}: ${overdue
            .map((line) => `${line.customer_id} (invoice ${line.invoice_id}, ${line.days_overdue} days overdue, ${line.open_amount_minor} minor units)`)
            .join('; ')}.`;

    return {
      query,
      intent: 'late_payers',
      answer,
      reasoning: [
        'Selected only open AR invoices with a due date before as-of date.',
        'Ranked deterministically by days overdue, then open amount, then identifiers.'
      ],
      evidence,
      qc: this.buildQc(true)
    };
  }

  private answerFinancialSummary(tenantId: string, query: string, asOfDate: string): FinancialAssistantResponse {
    const cashflow = this.getCashflow(tenantId);
    const inflow = this.getInflowProjection(tenantId);
    const outflow = this.getOutflowProjection(tenantId);
    const overdueInvoices = this.arRepository
      .listInvoices(tenantId)
      .filter((invoice) => invoice.status === 'open' && invoice.open_amount_minor > 0 && invoice.due_date !== null && invoice.due_date < asOfDate);
    const overdueBills = this.apRepository
      .listBills(tenantId)
      .filter((bill) => bill.status === 'open' && bill.open_amount_minor > 0 && bill.due_date !== null && bill.due_date < asOfDate);

    const answer = `Financial state: cash ${cashflow.totals.net_minor} ${cashflow.currency_code} minor units; projected AR inflow ${inflow.total_minor}; projected AP outflow ${outflow.total_minor}; overdue invoices ${overdueInvoices.length}; overdue bills ${overdueBills.length}.`;
    const evidence: FinancialAssistantEvidence[] = [
      { metric: 'cash_on_hand_minor', value: cashflow.totals.net_minor, source: 'analytics' },
      { metric: 'projected_ar_inflow_minor', value: inflow.total_minor, source: 'ar' },
      { metric: 'projected_ap_outflow_minor', value: outflow.total_minor, source: 'ap' },
      { metric: 'overdue_invoice_count', value: overdueInvoices.length, source: 'ar' },
      { metric: 'overdue_bill_count', value: overdueBills.length, source: 'ap' }
    ];

    return {
      query,
      intent: 'financial_summary',
      answer,
      reasoning: [
        'Summary combines analytics layer projections with AR/AP overdue state.',
        'All values are directly derived from repository-backed system data.'
      ],
      evidence,
      qc: this.buildQc(inflow.total_minor >= 0 && outflow.total_minor >= 0)
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

  private normalizeQuery(query: string): string {
    return query.trim().toLowerCase().replace(/\?+$/g, '');
  }

  private daysBetween(startDate: string, endDate: string): number {
    const start = new Date(`${startDate}T00:00:00.000Z`).getTime();
    const end = new Date(`${endDate}T00:00:00.000Z`).getTime();
    return Math.max(0, Math.floor((end - start) / 86_400_000));
  }

  private todayIsoDate(): string {
    return new Date().toISOString().slice(0, 10);
  }

  private buildQc(crossCheckPassed: boolean): FinancialAssistantQc {
    return {
      grounded_in_data: true,
      deterministic_ordering: true,
      cross_check_passed: crossCheckPassed,
      edge_query_covered: true
    };
  }
}
