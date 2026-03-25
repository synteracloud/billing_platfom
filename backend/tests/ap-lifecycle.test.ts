import assert from 'assert';
import { ApRepository } from '../src/modules/ap/ap.repository';
import { ApService } from '../src/modules/ap/ap.service';

async function main() {
  const emitted: Array<{ type: string; aggregate_id: string; payload: Record<string, unknown> }> = [];
  const eventsService = {
    logEvent(input: { type: string; aggregate_id: string; payload: Record<string, unknown> }) {
      emitted.push(input);
      return input;
    }
  };

  const service = new ApService(
    new ApRepository(),
    eventsService as never,
    {
      listEntries: () => [
        {
          id: 'je-ap-control',
          entry_date: '2026-03-01',
          lines: [
            { account_code: '2000', direction: 'credit', amount_minor: 1000 },
            { account_code: '2000', direction: 'debit', amount_minor: 1000 }
          ]
        },
        {
          id: 'je-expense-1',
          entry_date: '2026-03-02',
          lines: [
            { account_code: '5000', direction: 'debit', amount_minor: 450 },
            { account_code: '2000', direction: 'credit', amount_minor: 450 }
          ]
        },
        {
          id: 'je-expense-future',
          entry_date: '2026-04-01',
          lines: [
            { account_code: '5000', direction: 'debit', amount_minor: 999 },
            { account_code: '2000', direction: 'credit', amount_minor: 999 }
          ]
        }
      ]
    } as never
  );

  const tenantId = 'tenant-ap';
  const vendorId = 'vendor-1';

  service.applyBillApproved(
    tenantId,
    {
      bill_id: 'bill-1',
      vendor_id: vendorId,
      approved_at: '2026-03-01T00:00:00.000Z',
      due_date: '2026-03-31',
      total_minor: 1000,
      currency_code: 'USD'
    },
    'corr-1'
  );

  service.applyBillPaid(
    tenantId,
    {
      bill_id: 'bill-1',
      paid_at: '2026-03-02T00:00:00.000Z',
      amount_paid_minor: 400
    },
    'corr-2'
  );

  service.applyBillPaid(
    tenantId,
    {
      bill_id: 'bill-1',
      paid_at: '2026-03-03T00:00:00.000Z',
      amount_paid_minor: 600
    },
    'corr-3'
  );

  const payableState = service.getVendorPayableState(tenantId, vendorId);
  assert.equal(payableState.total_open_amount_minor, 0, 'bill lifecycle should close payable after full payment');
  assert.equal(payableState.total_paid_amount_minor, 1000, 'paid total should match bill total after lifecycle simulation');
  assert.equal(payableState.bill_count_open, 0, 'no open bills expected');
  assert.equal(payableState.bill_count_total, 1, 'single bill expected');
  const dueTracking = service.getVendorDueTrackingState(tenantId, vendorId, '2026-03-31');
  assert.equal(dueTracking.due_amount_minor, 0, 'closed bill should not appear in due tracking');
  assert.equal(dueTracking.overdue_amount_minor, 0, 'closed bill should not appear in overdue tracking');

  assert.equal(emitted.length, 3, 'event-driven updates should emit payable update for each lifecycle transition');
  assert.ok(emitted.every((event) => event.type === 'subledger.payable.updated.v1'));

  service.applyBillPaidFromEvent(
    tenantId,
    {
      bill_id: 'bill-1',
      paid_at: '2026-03-03T00:00:00.000Z',
      amount_paid_minor: 600
    },
    'corr-3',
    'evt-bill-paid-duplicate'
  );
  service.applyBillPaidFromEvent(
    tenantId,
    {
      bill_id: 'bill-1',
      paid_at: '2026-03-03T00:00:00.000Z',
      amount_paid_minor: 600
    },
    'corr-3',
    'evt-bill-paid-duplicate'
  );

  const stateAfterDuplicate = service.getVendorPayableState(tenantId, vendorId);
  assert.equal(stateAfterDuplicate.total_paid_amount_minor, 1000, 'duplicate bill.paid event must be idempotent');

  const reconciliation = service.reconcileOpenPayablesToLedger(tenantId);
  assert.equal(reconciliation.total_open_amount_minor, 0, 'AP open payable total should be zero after full payment');
  assert.equal(reconciliation.ledger_ap_amount_minor, 0, 'ledger AP control total should match AP projection');
  assert.equal(reconciliation.variance_minor, 0, 'AP projection should reconcile with ledger AP account');

  service.applyBillApproved(
    tenantId,
    {
      bill_id: 'bill-2',
      vendor_id: vendorId,
      approved_at: '2026-03-04T00:00:00.000Z',
      due_date: '2026-03-20',
      total_minor: 750,
      currency_code: 'USD'
    },
    'corr-4'
  );

  const outflow = service.buildOutflowProjection(tenantId, {
    as_of_date: '2026-03-31',
    simulated_upcoming_bills: [
      {
        bill_id: 'bill-3',
        vendor_id: 'vendor-2',
        due_date: '2026-04-15',
        open_amount_minor: 1200
      }
    ]
  });

  assert.equal(outflow.obligations_total_minor, 1950, 'outflow projection should include AP and simulated obligations');
  assert.equal(outflow.expenses_total_minor, 450, 'outflow projection should include ledger expense debits up to as-of date');
  assert.equal(outflow.projected_outflow_total_minor, 2400, 'outflow projection total should aggregate obligations and expenses');
  assert.deepEqual(
    outflow.obligations.map((line) => [line.bill_id, line.source, line.amount_minor]),
    [
      ['bill-2', 'ap', 750],
      ['bill-3', 'simulated', 1200]
    ],
    'outflow obligations should be deterministic and source-aware'
  );
  assert.deepEqual(
    outflow.expenses.map((line) => [line.journal_entry_id, line.amount_minor]),
    [['je-expense-1', 450]],
    'outflow expenses should not include future ledger entries'
  );

  const outflowRepeat = service.buildOutflowProjection(tenantId, {
    as_of_date: '2026-03-31',
    simulated_upcoming_bills: [
      {
        bill_id: 'bill-3',
        vendor_id: 'vendor-2',
        due_date: '2026-04-15',
        open_amount_minor: 1200
      }
    ]
  });
  assert.deepEqual(outflowRepeat, outflow, 'outflow projection should be deterministic for same AP + ledger input');

  console.log('ap lifecycle test passed');
}

main().catch((error) => {
  console.error(error);
  process.exitCode = 1;
});
