import { BadRequestException, Injectable, NotFoundException } from '@nestjs/common';
import { EventsService } from '../events/events.service';
import { LedgerRepository } from '../ledger/ledger.repository';
import { ApRepository, PayableBillPosition, VendorPayableState } from './ap.repository';

export type BillApprovedPayload = {
  bill_id: string;
  vendor_id: string;
  approved_at: string;
  due_date: string | null;
  total_minor: number;
  currency_code: string;
};

export type BillPaidPayload = {
  bill_id: string;
  paid_at: string;
  amount_paid_minor: number;
};

export interface VendorDueTrackingState {
  vendor_id: string;
  as_of_date: string;
  overdue_amount_minor: number;
  due_amount_minor: number;
  unknown_due_date_amount_minor: number;
  overdue_bill_count: number;
  due_bill_count: number;
  unknown_due_date_bill_count: number;
}

export interface ApLedgerReconciliation {
  total_open_amount_minor: number;
  ledger_ap_amount_minor: number;
  variance_minor: number;
}

export interface OutflowExpenseLine {
  journal_entry_id: string;
  entry_date: string;
  amount_minor: number;
}

export interface OutflowBillObligationLine {
  bill_id: string;
  vendor_id: string;
  due_date: string | null;
  amount_minor: number;
  source: 'ap' | 'simulated';
}

export interface OutflowProjection {
  as_of_date: string;
  obligations_total_minor: number;
  expenses_total_minor: number;
  projected_outflow_total_minor: number;
  obligations: OutflowBillObligationLine[];
  expenses: OutflowExpenseLine[];
}

export interface OutflowProjectionOptions {
  as_of_date?: string;
  simulated_upcoming_bills?: Array<{
    bill_id: string;
    vendor_id: string;
    due_date: string | null;
    open_amount_minor: number;
  }>;
}

@Injectable()
export class ApService {
  constructor(
    private readonly apRepository: ApRepository,
    private readonly eventsService: EventsService,
    private readonly ledgerRepository: LedgerRepository = { listEntries: () => [] } as LedgerRepository
  ) {}

  applyBillApproved(tenantId: string, payload: BillApprovedPayload, correlationId: string | null): void {
    this.applyBillApprovedFromEvent(tenantId, payload, correlationId, `bill-approved:${payload.bill_id}:${payload.approved_at}`);
  }

  applyBillApprovedFromEvent(
    tenantId: string,
    payload: BillApprovedPayload,
    correlationId: string | null,
    eventId: string
  ): void {
    if (!payload.vendor_id?.trim()) {
      throw new BadRequestException('vendor_id is required for AP bill flows');
    }

    if (!this.apRepository.markEventApplied(tenantId, 'bill-approved', eventId)) {
      return;
    }

    const now = new Date().toISOString();
    const previous = this.apRepository.findBill(tenantId, payload.bill_id);
    const baseOpenAmount = previous ? previous.open_amount_minor : payload.total_minor;

    const next: PayableBillPosition = {
      bill_id: payload.bill_id,
      vendor_id: payload.vendor_id,
      currency_code: payload.currency_code,
      approved_at: payload.approved_at,
      due_date: payload.due_date,
      total_minor: payload.total_minor,
      open_amount_minor: Math.max(0, Math.min(payload.total_minor, baseOpenAmount)),
      paid_amount_minor: Math.max(0, payload.total_minor - Math.max(0, Math.min(payload.total_minor, baseOpenAmount))),
      status: baseOpenAmount <= 0 ? 'closed' : 'open',
      updated_at: now
    };

    this.apRepository.upsertBill(tenantId, next);
    this.emitPayableUpdated(tenantId, next, correlationId);
  }

  applyBillPaid(tenantId: string, payload: BillPaidPayload, correlationId: string | null): void {
    this.applyBillPaidFromEvent(tenantId, payload, correlationId, `bill-paid:${payload.bill_id}:${payload.paid_at}:${payload.amount_paid_minor}`);
  }

  applyBillPaidFromEvent(tenantId: string, payload: BillPaidPayload, correlationId: string | null, eventId: string): void {
    if (!this.apRepository.markEventApplied(tenantId, 'bill-paid', eventId)) {
      return;
    }

    const bill = this.apRepository.findBill(tenantId, payload.bill_id);
    if (!bill || bill.status === 'void') {
      return;
    }

    const paymentDelta = Math.max(0, payload.amount_paid_minor);
    const nextOpen = Math.max(0, Math.min(bill.total_minor, bill.open_amount_minor - paymentDelta));
    const next: PayableBillPosition = {
      ...bill,
      open_amount_minor: nextOpen,
      paid_amount_minor: Math.max(0, bill.total_minor - nextOpen),
      status: nextOpen === 0 ? 'closed' : 'open',
      updated_at: new Date().toISOString()
    };

    this.apRepository.upsertBill(tenantId, next);
    this.emitPayableUpdated(tenantId, next, correlationId);
  }

  getVendorPayableState(tenantId: string, vendorId: string): VendorPayableState {
    const bills = this.apRepository.listBillsByVendor(tenantId, vendorId);
    if (bills.length === 0) {
      throw new NotFoundException('Vendor payable state not found');
    }

    return {
      vendor_id: vendorId,
      currency_code: bills[0].currency_code,
      total_open_amount_minor: bills.reduce((sum, item) => sum + item.open_amount_minor, 0),
      total_paid_amount_minor: bills.reduce((sum, item) => sum + item.paid_amount_minor, 0),
      bill_count_open: bills.filter((item) => item.status === 'open').length,
      bill_count_total: bills.length,
      bills: [...bills].sort((a, b) => a.approved_at.localeCompare(b.approved_at) || a.bill_id.localeCompare(b.bill_id)),
      updated_at: bills.map((item) => item.updated_at).sort().at(-1) ?? null
    };
  }

  getVendorDueTrackingState(tenantId: string, vendorId: string, asOfDate: string): VendorDueTrackingState {
    const bills = this.apRepository
      .listBillsByVendor(tenantId, vendorId)
      .filter((bill) => bill.status === 'open' && bill.open_amount_minor > 0);

    const normalizedDate = asOfDate.slice(0, 10);
    let overdueAmount = 0;
    let dueAmount = 0;
    let unknownAmount = 0;
    let overdueCount = 0;
    let dueCount = 0;
    let unknownCount = 0;

    for (const bill of bills) {
      if (!bill.due_date) {
        unknownAmount += bill.open_amount_minor;
        unknownCount += 1;
        continue;
      }

      if (bill.due_date < normalizedDate) {
        overdueAmount += bill.open_amount_minor;
        overdueCount += 1;
        continue;
      }

      dueAmount += bill.open_amount_minor;
      dueCount += 1;
    }

    return {
      vendor_id: vendorId,
      as_of_date: normalizedDate,
      overdue_amount_minor: overdueAmount,
      due_amount_minor: dueAmount,
      unknown_due_date_amount_minor: unknownAmount,
      overdue_bill_count: overdueCount,
      due_bill_count: dueCount,
      unknown_due_date_bill_count: unknownCount
    };
  }

  reconcileOpenPayablesToLedger(tenantId: string): ApLedgerReconciliation {
    const totalOpenAmount = this.apRepository
      .listBills(tenantId)
      .filter((bill) => bill.status === 'open')
      .reduce((sum, bill) => sum + bill.open_amount_minor, 0);

    const ledgerApAmount = this.ledgerRepository.listEntries(tenantId).reduce((entrySum, entry) => {
      return entrySum + entry.lines.reduce((lineSum, line) => {
        if (line.account_code !== '2000') {
          return lineSum;
        }

        return lineSum + (line.direction === 'credit' ? line.amount_minor : -line.amount_minor);
      }, 0);
    }, 0);

    return {
      total_open_amount_minor: totalOpenAmount,
      ledger_ap_amount_minor: ledgerApAmount,
      variance_minor: totalOpenAmount - ledgerApAmount
    };
  }

  buildOutflowProjection(tenantId: string, options: OutflowProjectionOptions = {}): OutflowProjection {
    const asOfDate = (options.as_of_date ?? new Date().toISOString().slice(0, 10)).slice(0, 10);
    const obligations = this.buildBillObligations(tenantId, options.simulated_upcoming_bills ?? []);
    const expenses = this.buildLedgerExpenses(tenantId, asOfDate);
    const obligationsTotal = obligations.reduce((sum, line) => sum + line.amount_minor, 0);
    const expensesTotal = expenses.reduce((sum, line) => sum + line.amount_minor, 0);

    return {
      as_of_date: asOfDate,
      obligations_total_minor: obligationsTotal,
      expenses_total_minor: expensesTotal,
      projected_outflow_total_minor: obligationsTotal + expensesTotal,
      obligations,
      expenses
    };
  }

  private buildBillObligations(
    tenantId: string,
    simulatedUpcomingBills: Array<{
      bill_id: string;
      vendor_id: string;
      due_date: string | null;
      open_amount_minor: number;
    }>
  ): OutflowBillObligationLine[] {
    const obligationsByBillId = new Map<string, OutflowBillObligationLine>();

    for (const bill of this.apRepository.listBills(tenantId)) {
      if (bill.status !== 'open' || bill.open_amount_minor <= 0) {
        continue;
      }

      obligationsByBillId.set(bill.bill_id, {
        bill_id: bill.bill_id,
        vendor_id: bill.vendor_id,
        due_date: bill.due_date,
        amount_minor: bill.open_amount_minor,
        source: 'ap'
      });
    }

    for (const simulated of simulatedUpcomingBills) {
      const amountMinor = Math.max(0, simulated.open_amount_minor);
      if (amountMinor === 0) {
        continue;
      }

      obligationsByBillId.set(simulated.bill_id, {
        bill_id: simulated.bill_id,
        vendor_id: simulated.vendor_id,
        due_date: simulated.due_date,
        amount_minor: amountMinor,
        source: 'simulated'
      });
    }

    return Array.from(obligationsByBillId.values()).sort((left, right) => {
      const dueDateLeft = left.due_date ?? '9999-12-31';
      const dueDateRight = right.due_date ?? '9999-12-31';
      return (
        dueDateLeft.localeCompare(dueDateRight) ||
        left.vendor_id.localeCompare(right.vendor_id) ||
        left.bill_id.localeCompare(right.bill_id)
      );
    });
  }

  private buildLedgerExpenses(tenantId: string, asOfDate: string): OutflowExpenseLine[] {
    return this.ledgerRepository
      .listEntries(tenantId)
      .filter((entry) => entry.entry_date <= asOfDate)
      .map((entry) => ({
        journal_entry_id: entry.id,
        entry_date: entry.entry_date,
        amount_minor: entry.lines.reduce((sum, line) => {
          if (!line.account_code.startsWith('5')) {
            return sum;
          }

          return sum + (line.direction === 'debit' ? line.amount_minor : -line.amount_minor);
        }, 0)
      }))
      .filter((line) => line.amount_minor > 0)
      .sort((left, right) => left.entry_date.localeCompare(right.entry_date) || left.journal_entry_id.localeCompare(right.journal_entry_id));
  }

  private emitPayableUpdated(tenantId: string, position: PayableBillPosition, correlationId: string | null): void {
    this.eventsService.logEvent({
      tenant_id: tenantId,
      type: 'subledger.payable.updated.v1',
      aggregate_type: 'payable_position',
      aggregate_id: position.bill_id,
      aggregate_version: 1,
      correlation_id: correlationId,
      idempotency_key: `subledger.payable.updated.v1:${position.bill_id}:${position.updated_at}:${position.open_amount_minor}`,
      payload: {
        payable_position_id: position.bill_id,
        vendor_id: position.vendor_id,
        open_amount_minor: position.open_amount_minor,
        currency_code: position.currency_code
      }
    });
  }
}
