const test = require('node:test');
const assert = require('node:assert/strict');

const { ApService } = require('../.tmp-test-dist/modules/ap/ap.service');
const { ApRepository } = require('../.tmp-test-dist/modules/ap/ap.repository');
const { ApReadOnlyGuard } = require('../.tmp-test-dist/modules/ap/ap-readonly.guard');
const { EventsService } = require('../.tmp-test-dist/modules/events/events.service');
const { EventsRepository } = require('../.tmp-test-dist/modules/events/events.repository');
const { EventConsumerIdempotencyService } = require('../.tmp-test-dist/modules/idempotency/event-consumer-idempotency.service');
const { IdempotencyRepository } = require('../.tmp-test-dist/modules/idempotency/idempotency.repository');
const { IdempotencyService } = require('../.tmp-test-dist/modules/idempotency/idempotency.service');
const { EventQueuePublisher } = require('../.tmp-test-dist/modules/events/queue/event-queue.publisher');
const { InMemoryQueueDriver } = require('../.tmp-test-dist/modules/events/queue/in-memory-queue.driver');

function buildExecutionContext(method) {
  return {
    switchToHttp: () => ({
      getRequest: () => ({ method })
    })
  };
}

function buildService() {
  const idempotencyService = new IdempotencyService(new IdempotencyRepository());
  const eventConsumerIdempotencyService = new EventConsumerIdempotencyService(idempotencyService);
  const eventsService = new EventsService(
    new EventsRepository(),
    eventConsumerIdempotencyService,
    new EventQueuePublisher(new InMemoryQueueDriver())
  );

  return new ApService(new ApRepository(), eventsService);
}

test('AP APIs derive vendor balance, bills, and due/overdue from payable projection', () => {
  const tenantId = 'tenant-ap';
  const vendorId = 'vendor-1';
  const apService = buildService();

  apService.applyBillCreated(
    tenantId,
    {
      bill_id: 'bill-1',
      vendor_id: vendorId,
      created_at: '2026-01-01',
      due_date: '2026-01-10',
      total_minor: 1200,
      currency_code: 'USD',
      expense_classification: 'operating'
    },
    'corr-1'
  );

  apService.applyBillCreated(
    tenantId,
    {
      bill_id: 'bill-2',
      vendor_id: vendorId,
      created_at: '2026-01-02',
      due_date: '2026-03-10',
      total_minor: 3000,
      currency_code: 'USD',
      expense_classification: 'asset'
    },
    'corr-2'
  );

  apService.applyPayableUpdated(
    tenantId,
    {
      payable_position_id: 'bill-1',
      vendor_id: vendorId,
      open_amount_minor: 200,
      currency_code: 'USD'
    },
    'corr-3'
  );

  const balance = apService.getVendorBalance(tenantId, vendorId);
  assert.equal(balance.total_open_amount_minor, 3200);
  assert.equal(balance.total_paid_amount_minor, 1000);
  assert.equal(balance.bill_count_total, 2);
  assert.equal(balance.bill_count_open, 2);

  const bills = apService.getBills(tenantId, vendorId);
  assert.equal(bills.bills.length, 2);
  assert.deepEqual(
    bills.bills.map((item) => [item.bill_id, item.open_amount_minor]),
    [
      ['bill-1', 200],
      ['bill-2', 3000]
    ]
  );

  const dueOverdue = apService.getDueOverdue(tenantId, vendorId, '2026-02-01');
  assert.equal(dueOverdue.overdue_amount_minor, 200);
  assert.equal(dueOverdue.due_amount_minor, 3000);
});

test('AP API due/overdue handles edge cases for unknown due dates and closed bills', () => {
  const tenantId = 'tenant-ap-edge';
  const vendorId = 'vendor-edge';
  const apService = buildService();

  apService.applyBillCreated(
    tenantId,
    {
      bill_id: 'bill-open-unknown',
      vendor_id: vendorId,
      created_at: '2026-02-01',
      due_date: null,
      total_minor: 700,
      currency_code: 'USD',
      expense_classification: 'operating'
    },
    'corr-4'
  );

  apService.applyBillCreated(
    tenantId,
    {
      bill_id: 'bill-closed',
      vendor_id: vendorId,
      created_at: '2026-02-03',
      due_date: '2026-02-04',
      total_minor: 200,
      currency_code: 'USD',
      expense_classification: 'operating'
    },
    'corr-5'
  );

  apService.applyPayableUpdated(
    tenantId,
    {
      payable_position_id: 'bill-closed',
      vendor_id: vendorId,
      open_amount_minor: 0,
      currency_code: 'USD'
    },
    'corr-6'
  );

  const dueOverdue = apService.getDueOverdue(tenantId, vendorId, '2026-02-10');
  assert.equal(dueOverdue.overdue_amount_minor, 0);
  assert.equal(dueOverdue.due_amount_minor, 0);
  assert.equal(dueOverdue.unknown_due_date_amount_minor, 700);
  assert.equal(dueOverdue.unknown_due_date_bill_count, 1);
});

test('AP read-only guard blocks non-GET methods', () => {
  const guard = new ApReadOnlyGuard();
  assert.equal(guard.canActivate(buildExecutionContext('GET')), true);
  assert.throws(() => guard.canActivate(buildExecutionContext('POST')));
});
