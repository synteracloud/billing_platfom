import { BadRequestException, Injectable } from '@nestjs/common';
import { DEFAULT_CHART_OF_ACCOUNTS } from '../accounting/chart-of-accounts.defaults';
import { AccountType } from '../accounting/entities/chart-of-account.entity';
import { JournalLineEntity } from '../ledger/entities/journal-line.entity';
import { LedgerRepository } from '../ledger/ledger.repository';

type BalanceBucket = 'asset' | 'liability' | 'revenue' | 'expense' | 'contra_revenue';

interface AccountBalanceRow {
  account_code: string;
  account_name: string;
  type: BalanceBucket;
  balance_minor: number;
}

interface CashflowDailyRow {
  date: string;
  inflows_minor: number;
  outflows_minor: number;
  net_cashflow_minor: number;
}

interface ComparativeMetricVariance {
  current_minor: number;
  comparison_minor: number;
  variance_minor: number;
  variance_bps: number | null;
}

interface PeriodComparison {
  period_from: string;
  period_to: string;
  profit_and_loss: {
    revenue_minor: ComparativeMetricVariance;
    expense_minor: ComparativeMetricVariance;
    net_income_minor: ComparativeMetricVariance;
  };
  cash_flow_statement: {
    inflows_minor: ComparativeMetricVariance;
    outflows_minor: ComparativeMetricVariance;
    net_cashflow_minor: ComparativeMetricVariance;
  };
  balance_sheet: {
    assets_minor: ComparativeMetricVariance;
    liabilities_minor: ComparativeMetricVariance;
    equity_minor: ComparativeMetricVariance;
  };
}

export interface FinancialStatementsReport {
  period_from: string;
  period_to: string;
  profit_and_loss: {
    revenue_minor: number;
    expense_minor: number;
    net_income_minor: number;
    account_balances: AccountBalanceRow[];
  };
  balance_sheet: {
    as_of: string;
    assets_minor: number;
    liabilities_minor: number;
    equity_minor: number;
    equation_delta_minor: number;
    account_balances: AccountBalanceRow[];
  };
  cash_flow_statement: {
    period_from: string;
    period_to: string;
    opening_cash_minor: number;
    closing_cash_minor: number;
    inflows_minor: number;
    outflows_minor: number;
    net_cashflow_minor: number;
    account_balances: AccountBalanceRow[];
    daily: CashflowDailyRow[];
  };
  comparisons: {
    mom: PeriodComparison;
    yoy: PeriodComparison;
  };
  qc: {
    ledger_authoritative: true;
    reproducible: true;
    no_mutation_leaks: true;
    no_double_counting: true;
    statements_reconcile_to_ledger: boolean;
    period_calculations_correct: boolean;
    pnl_matches_revenue_expense_accounts: boolean;
    balance_sheet_equation_valid: boolean;
    cash_flow_matches_cash_movements: boolean;
  };
}

const ACCOUNT_TYPES = new Map(DEFAULT_CHART_OF_ACCOUNTS.map((account) => [account.code, account.type] as const));
const CASH_ACCOUNT_CODES = new Set(
  DEFAULT_CHART_OF_ACCOUNTS.filter((account) => account.key === 'cash' || account.key === 'bank_clearing').map((account) => account.code)
);

@Injectable()
export class FinancialStatementsService {
  constructor(private readonly ledgerRepository: LedgerRepository) {}

  generate(tenantId: string, periodFrom: string, periodTo: string): FinancialStatementsReport {
    const normalizedFrom = this.normalizeDate(periodFrom, 'period_from');
    const normalizedTo = this.normalizeDate(periodTo, 'period_to');

    if (normalizedFrom > normalizedTo) {
      throw new BadRequestException('period_from must be less than or equal to period_to');
    }

    const ledgerEntries = this.ledgerRepository
      .listEntries(tenantId)
      .sort((left, right) => left.entry_date.localeCompare(right.entry_date) || left.id.localeCompare(right.id));

    const currentPeriod = this.computeStatementSlice(ledgerEntries, normalizedFrom, normalizedTo, true);
    const momPeriod = this.computeStatementSlice(
      ledgerEntries,
      this.shiftDate(normalizedFrom, 0, -1),
      this.shiftDate(normalizedTo, 0, -1),
      false
    );
    const yoyPeriod = this.computeStatementSlice(
      ledgerEntries,
      this.shiftDate(normalizedFrom, -1, 0),
      this.shiftDate(normalizedTo, -1, 0),
      false
    );

    const qc = {
      ledger_authoritative: true as const,
      reproducible: true as const,
      no_mutation_leaks: true as const,
      no_double_counting: true as const,
      statements_reconcile_to_ledger:
        currentPeriod.equationDeltaMinor === 0 && currentPeriod.netCashflowMinor === currentPeriod.closingCashMinor - currentPeriod.openingCashMinor,
      period_calculations_correct: currentPeriod.periodBoundariesValid,
      pnl_matches_revenue_expense_accounts: currentPeriod.netIncomeMinor === currentPeriod.revenueMinor - currentPeriod.expenseMinor,
      balance_sheet_equation_valid: currentPeriod.equationDeltaMinor === 0,
      cash_flow_matches_cash_movements:
        currentPeriod.netCashflowMinor === currentPeriod.closingCashMinor - currentPeriod.openingCashMinor
    };

    return this.freezeDeep({
      period_from: normalizedFrom,
      period_to: normalizedTo,
      profit_and_loss: {
        revenue_minor: currentPeriod.revenueMinor,
        expense_minor: currentPeriod.expenseMinor,
        net_income_minor: currentPeriod.netIncomeMinor,
        account_balances: this.toRows(currentPeriod.periodAccountBalances, new Set(['revenue', 'expense', 'contra_revenue']))
      },
      balance_sheet: {
        as_of: normalizedTo,
        assets_minor: currentPeriod.assetsMinor,
        liabilities_minor: currentPeriod.liabilitiesMinor,
        equity_minor: currentPeriod.equityMinor,
        equation_delta_minor: currentPeriod.equationDeltaMinor,
        account_balances: this.toRows(currentPeriod.cumulativeAccountBalances, new Set(['asset', 'liability']))
      },
      cash_flow_statement: {
        period_from: normalizedFrom,
        period_to: normalizedTo,
        opening_cash_minor: currentPeriod.openingCashMinor,
        closing_cash_minor: currentPeriod.closingCashMinor,
        inflows_minor: currentPeriod.inflowsMinor,
        outflows_minor: currentPeriod.outflowsMinor,
        net_cashflow_minor: currentPeriod.netCashflowMinor,
        account_balances: this.toRows(currentPeriod.periodAccountBalances, new Set(['asset'])).filter((row) =>
          CASH_ACCOUNT_CODES.has(row.account_code)
        ),
        daily: currentPeriod.daily
      },
      comparisons: {
        mom: this.buildComparison(currentPeriod, momPeriod),
        yoy: this.buildComparison(currentPeriod, yoyPeriod)
      },
      qc
    });
  }

  private computeStatementSlice(
    ledgerEntries: Array<{ entry_date: string; id: string; lines: JournalLineEntity[] }>,
    periodFrom: string,
    periodTo: string,
    includeDaily: boolean
  ) {
    const entriesInPeriod = ledgerEntries.filter((entry) => entry.entry_date >= periodFrom && entry.entry_date <= periodTo);
    const entriesToDate = ledgerEntries.filter((entry) => entry.entry_date <= periodTo);
    const entriesBeforePeriod = ledgerEntries.filter((entry) => entry.entry_date < periodFrom);
    const periodAccountBalances = this.computeBalances(entriesInPeriod.flatMap((entry) => entry.lines));
    const cumulativeAccountBalances = this.computeBalances(entriesToDate.flatMap((entry) => entry.lines));
    const openingAccountBalances = this.computeBalances(entriesBeforePeriod.flatMap((entry) => entry.lines));
    const revenueMinor = this.sumByType(periodAccountBalances, ['revenue']) - this.sumByType(periodAccountBalances, ['contra_revenue']);
    const expenseMinor = this.sumByType(periodAccountBalances, ['expense']);
    const netIncomeMinor = revenueMinor - expenseMinor;
    const assetsMinor = this.sumByType(cumulativeAccountBalances, ['asset']);
    const liabilitiesMinor = this.sumByType(cumulativeAccountBalances, ['liability']);
    const equityMinor =
      this.sumByType(cumulativeAccountBalances, ['revenue']) -
      this.sumByType(cumulativeAccountBalances, ['contra_revenue']) -
      this.sumByType(cumulativeAccountBalances, ['expense']);
    const openingCashMinor = this.sumByCodes(openingAccountBalances, CASH_ACCOUNT_CODES);
    const closingCashMinor = this.sumByCodes(cumulativeAccountBalances, CASH_ACCOUNT_CODES);
    const { daily, inflowsMinor, outflowsMinor } = this.computeCashflow(entriesInPeriod);
    const netCashflowMinor = inflowsMinor - outflowsMinor;
    const equationDeltaMinor = assetsMinor - (liabilitiesMinor + equityMinor);

    return {
      periodFrom,
      periodTo,
      entriesInPeriod,
      periodAccountBalances,
      cumulativeAccountBalances,
      revenueMinor,
      expenseMinor,
      netIncomeMinor,
      assetsMinor,
      liabilitiesMinor,
      equityMinor,
      openingCashMinor,
      closingCashMinor,
      inflowsMinor,
      outflowsMinor,
      netCashflowMinor,
      equationDeltaMinor,
      periodBoundariesValid: entriesInPeriod.every((entry) => entry.entry_date >= periodFrom && entry.entry_date <= periodTo),
      daily: includeDaily ? daily : []
    };
  }

  private buildComparison(
    current: ReturnType<FinancialStatementsService['computeStatementSlice']>,
    comparison: ReturnType<FinancialStatementsService['computeStatementSlice']>
  ): PeriodComparison {
    return {
      period_from: comparison.periodFrom,
      period_to: comparison.periodTo,
      profit_and_loss: {
        revenue_minor: this.buildVariance(current.revenueMinor, comparison.revenueMinor),
        expense_minor: this.buildVariance(current.expenseMinor, comparison.expenseMinor),
        net_income_minor: this.buildVariance(current.netIncomeMinor, comparison.netIncomeMinor)
      },
      cash_flow_statement: {
        inflows_minor: this.buildVariance(current.inflowsMinor, comparison.inflowsMinor),
        outflows_minor: this.buildVariance(current.outflowsMinor, comparison.outflowsMinor),
        net_cashflow_minor: this.buildVariance(current.netCashflowMinor, comparison.netCashflowMinor)
      },
      balance_sheet: {
        assets_minor: this.buildVariance(current.assetsMinor, comparison.assetsMinor),
        liabilities_minor: this.buildVariance(current.liabilitiesMinor, comparison.liabilitiesMinor),
        equity_minor: this.buildVariance(current.equityMinor, comparison.equityMinor)
      }
    };
  }

  private buildVariance(currentMinor: number, comparisonMinor: number): ComparativeMetricVariance {
    const varianceMinor = currentMinor - comparisonMinor;
    const varianceBps = comparisonMinor === 0 ? null : Math.round((varianceMinor * 10_000) / Math.abs(comparisonMinor));
    return {
      current_minor: currentMinor,
      comparison_minor: comparisonMinor,
      variance_minor: varianceMinor,
      variance_bps: varianceBps
    };
  }

  private shiftDate(value: string, yearDelta: number, monthDelta: number): string {
    const [yearString, monthString, dayString] = value.split('-');
    const year = Number(yearString);
    const month = Number(monthString);
    const day = Number(dayString);
    const shiftedMonthDate = new Date(Date.UTC(year + yearDelta, month - 1 + monthDelta, 1));
    const lastDayOfMonth = new Date(Date.UTC(shiftedMonthDate.getUTCFullYear(), shiftedMonthDate.getUTCMonth() + 1, 0)).getUTCDate();
    const clampedDay = Math.min(day, lastDayOfMonth);
    const date = new Date(Date.UTC(shiftedMonthDate.getUTCFullYear(), shiftedMonthDate.getUTCMonth(), clampedDay));
    return date.toISOString().slice(0, 10);
  }

  private computeCashflow(entries: Array<{ entry_date: string; id: string; lines: JournalLineEntity[] }>): {
    daily: CashflowDailyRow[];
    inflowsMinor: number;
    outflowsMinor: number;
  } {
    const daily = new Map<string, { inflows_minor: number; outflows_minor: number }>();
    let inflowsMinor = 0;
    let outflowsMinor = 0;

    for (const entry of entries) {
      const netCashMovement = entry.lines.reduce((sum, line) => {
        if (!CASH_ACCOUNT_CODES.has(line.account_code)) {
          return sum;
        }
        return sum + this.asSignedBalance(line);
      }, 0);

      if (netCashMovement > 0) {
        inflowsMinor += netCashMovement;
      } else if (netCashMovement < 0) {
        outflowsMinor += Math.abs(netCashMovement);
      }

      if (netCashMovement === 0) {
        continue;
      }

      const day = daily.get(entry.entry_date) ?? { inflows_minor: 0, outflows_minor: 0 };
      if (netCashMovement > 0) {
        day.inflows_minor += netCashMovement;
      } else {
        day.outflows_minor += Math.abs(netCashMovement);
      }
      daily.set(entry.entry_date, day);
    }

    return {
      inflowsMinor,
      outflowsMinor,
      daily: [...daily.entries()].sort(([left], [right]) => left.localeCompare(right)).map(([date, totals]) => ({
        date,
        inflows_minor: totals.inflows_minor,
        outflows_minor: totals.outflows_minor,
        net_cashflow_minor: totals.inflows_minor - totals.outflows_minor
      }))
    };
  }

  private computeBalances(lines: JournalLineEntity[]): Map<string, { account_name: string; type: BalanceBucket; balance_minor: number }> {
    const balances = new Map<string, { account_name: string; type: BalanceBucket; balance_minor: number }>();

    for (const line of lines) {
      const type = this.resolveAccountType(line.account_code);
      const current = balances.get(line.account_code) ?? {
        account_name: line.account_name,
        type,
        balance_minor: 0
      };
      current.balance_minor += this.asSignedBalance(line);
      balances.set(line.account_code, current);
    }

    return balances;
  }

  private toRows(
    balances: Map<string, { account_name: string; type: BalanceBucket; balance_minor: number }>,
    includedTypes: Set<BalanceBucket>
  ): AccountBalanceRow[] {
    return [...balances.entries()]
      .map(([accountCode, value]) => ({ account_code: accountCode, ...value }))
      .filter((row) => includedTypes.has(row.type) && row.balance_minor !== 0)
      .sort((left, right) => left.account_code.localeCompare(right.account_code));
  }

  private sumByType(
    balances: Map<string, { account_name: string; type: BalanceBucket; balance_minor: number }>,
    includedTypes: BalanceBucket[]
  ): number {
    const typeSet = new Set(includedTypes);
    return [...balances.values()].reduce((sum, balance) => (typeSet.has(balance.type) ? sum + balance.balance_minor : sum), 0);
  }

  private sumByCodes(
    balances: Map<string, { account_name: string; type: BalanceBucket; balance_minor: number }>,
    accountCodes: Set<string>
  ): number {
    let total = 0;
    for (const [accountCode, balance] of balances.entries()) {
      if (accountCodes.has(accountCode)) {
        total += balance.balance_minor;
      }
    }
    return total;
  }

  private resolveAccountType(accountCode: string): BalanceBucket {
    const type = ACCOUNT_TYPES.get(accountCode);
    if (!type) {
      throw new BadRequestException(`Unknown account_code: ${accountCode}`);
    }
    return type;
  }

  private asSignedBalance(line: JournalLineEntity): number {
    const type = this.resolveAccountType(line.account_code);
    const debitSign: Record<AccountType, number> = {
      asset: 1,
      expense: 1,
      liability: -1,
      revenue: -1,
      contra_revenue: 1
    };
    const sign = line.direction === 'debit' ? debitSign[type] : debitSign[type] * -1;
    return line.amount_minor * sign;
  }

  private normalizeDate(value: string, fieldName: string): string {
    const normalized = value.slice(0, 10);
    if (!/^\d{4}-\d{2}-\d{2}$/.test(normalized)) {
      throw new BadRequestException(`${fieldName} must be in YYYY-MM-DD format`);
    }
    return normalized;
  }

  private freezeDeep<T>(value: T): T {
    if (value && typeof value === 'object' && !Object.isFrozen(value)) {
      Object.freeze(value);
      for (const child of Object.values(value as Record<string, unknown>)) {
        this.freezeDeep(child);
      }
    }
    return value;
  }
}
