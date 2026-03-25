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
          lines: [
            { account_code: '2000', direction: 'credit', amount_minor: 1000 },
            { account_code: '2000', direction: 'debit', amount_minor: 1000 }
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

  console.log('ap lifecycle test passed');
}

main().catch((error) => {
  console.error(error);
  process.exitCode = 1;
});
