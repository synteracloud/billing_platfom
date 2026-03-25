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

  const service = new ApService(new ApRepository(), eventsService as never);

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

  assert.equal(emitted.length, 3, 'event-driven updates should emit payable update for each lifecycle transition');
  assert.ok(emitted.every((event) => event.type === 'subledger.payable.updated.v1'));

  console.log('ap lifecycle test passed');
}

main().catch((error) => {
  console.error(error);
  process.exitCode = 1;
});
