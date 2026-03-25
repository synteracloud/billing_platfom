import { Injectable } from '@nestjs/common';
import { ApRepository } from '../ap/ap.repository';
import { ArRepository } from '../ar/ar.repository';
import { LedgerRepository } from '../ledger/ledger.repository';

const CASH_ACCOUNT_CODES = new Set(['1000', '1010']);
const AR_ACCOUNT_CODE = '1100';
const AP_ACCOUNT_CODE = '2000';

export interface CashflowReport {
  period_from: string;
  period_to: string;
  inflows_minor: number;
  outflows_minor: number;
  net_cashflow_minor: number;
  ar_inflow_minor: number;
  ap_outflow_minor: number;
  expense_outflow_minor: number;
  ledger_totals: {
    inflows_minor: number;
    outflows_minor: number;
    ar_control_delta_minor: number;
    ap_control_delta_minor: number;
  };
  reconciliation: {
    inflow_variance_minor: number;
    outflow_variance_minor: number;
  };
  daily: Array<{
    date: string;
    inflows_minor: number;
    outflows_minor: number;
    net_cashflow_minor: number;
  }>;
}

@Injectable()
export class CashflowService {
  constructor(
    private readonly ledgerRepository: LedgerRepository,
    private readonly arRepository: ArRepository,
    private readonly apRepository: ApRepository
  ) {}

  generate(tenantId: string, periodFrom: string, periodTo: string): CashflowReport {
    const normalizedFrom = periodFrom.slice(0, 10);
    const normalizedTo = periodTo.slice(0, 10);

    const entries = this.ledgerRepository
      .listEntries(tenantId)
      .filter((entry) => entry.entry_date >= normalizedFrom && entry.entry_date <= normalizedTo)
      .sort((left, right) => left.entry_date.localeCompare(right.entry_date) || left.id.localeCompare(right.id));

    let inflows = 0;
    let outflows = 0;
    let arInflows = 0;
    let apOutflows = 0;
    let expenseOutflows = 0;
    let arControlDelta = 0;
    let apControlDelta = 0;

    const dailyMap = new Map<string, { inflows_minor: number; outflows_minor: number }>();

    for (const entry of entries) {
      const netCashMovement = entry.lines.reduce((sum, line) => {
        if (!CASH_ACCOUNT_CODES.has(line.account_code)) {
          return sum;
        }

        return sum + (line.direction === 'debit' ? line.amount_minor : -line.amount_minor);
      }, 0);

      arControlDelta += entry.lines.reduce((sum, line) => {
        if (line.account_code !== AR_ACCOUNT_CODE) {
          return sum;
        }

        return sum + (line.direction === 'debit' ? line.amount_minor : -line.amount_minor);
      }, 0);

      apControlDelta += entry.lines.reduce((sum, line) => {
        if (line.account_code !== AP_ACCOUNT_CODE) {
          return sum;
        }

        return sum + (line.direction === 'credit' ? line.amount_minor : -line.amount_minor);
      }, 0);

      if (netCashMovement === 0) {
        continue;
      }

      const daily = dailyMap.get(entry.entry_date) ?? { inflows_minor: 0, outflows_minor: 0 };

      if (netCashMovement > 0) {
        inflows += netCashMovement;
        daily.inflows_minor += netCashMovement;

        if (entry.event_name === 'billing.payment.settled.v1' || entry.event_name === 'billing.payment.recorded.v1') {
          arInflows += netCashMovement;
        }
      } else {
        const absoluteOutflow = Math.abs(netCashMovement);
        outflows += absoluteOutflow;
        daily.outflows_minor += absoluteOutflow;

        if (entry.event_name === 'billing.bill.paid.v1') {
          apOutflows += absoluteOutflow;
        } else {
          expenseOutflows += absoluteOutflow;
        }
      }

      dailyMap.set(entry.entry_date, daily);
    }

    const arPaidTotal = this.arRepository
      .listInvoices(tenantId)
      .reduce((sum, invoice) => sum + invoice.paid_amount_minor, 0);

    const apPaidTotal = this.apRepository
      .listBills(tenantId)
      .reduce((sum, bill) => sum + bill.paid_amount_minor, 0);

    const daily = [...dailyMap.entries()]
      .sort(([left], [right]) => left.localeCompare(right))
      .map(([date, values]) => ({
        date,
        inflows_minor: values.inflows_minor,
        outflows_minor: values.outflows_minor,
        net_cashflow_minor: values.inflows_minor - values.outflows_minor
      }));

    return {
      period_from: normalizedFrom,
      period_to: normalizedTo,
      inflows_minor: inflows,
      outflows_minor: outflows,
      net_cashflow_minor: inflows - outflows,
      ar_inflow_minor: arInflows,
      ap_outflow_minor: apOutflows,
      expense_outflow_minor: expenseOutflows,
      ledger_totals: {
        inflows_minor: inflows,
        outflows_minor: outflows,
        ar_control_delta_minor: arControlDelta,
        ap_control_delta_minor: apControlDelta
      },
      reconciliation: {
        inflow_variance_minor: arPaidTotal - arInflows,
        outflow_variance_minor: apPaidTotal - apOutflows
      },
      daily
    };
  }
}
