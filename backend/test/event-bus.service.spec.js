const test = require('node:test');
const assert = require('node:assert/strict');
const { EventBusService } = require('../.tmp-test-dist/modules/events/event-bus.service');
const { EventsService } = require('../.tmp-test-dist/modules/events/events.service');
const { EventsRepository } = require('../.tmp-test-dist/modules/events/events.repository');
const { FinancialTransactionManager } = require('../.tmp-test-dist/common/transactions/financial-transaction.manager');
const { EventConsumerIdempotencyService } = require('../.tmp-test-dist/modules/idempotency/event-consumer-idempotency.service');
const { IdempotencyRepository } = require('../.tmp-test-dist/modules/idempotency/idempotency.repository');
const { IdempotencyService } = require('../.tmp-test-dist/modules/idempotency/idempotency.service');

function createEventsService() {
  const eventsRepository = new EventsRepository();
  const idempotencyRepository = new IdempotencyRepository();
  const idempotencyService = new IdempotencyService(idempotencyRepository);
  const eventConsumerIdempotencyService = new EventConsumerIdempotencyService(idempotencyService);
  const eventBusService = new EventBusService(eventsRepository, eventConsumerIdempotencyService);
  const transactionManager = new FinancialTransactionManager();
  const eventsService = new EventsService(eventsRepository, eventConsumerIdempotencyService, eventBusService, transactionManager);

  return { eventsService, eventsRepository, eventBusService, transactionManager };
}

test('publishes invoice events to multiple sync and async consumers without coupling', async () => {
  const { eventsService, eventBusService } = createEventsService();
  const deliveries = [];

  const first = eventBusService.subscribe('billing.invoice.issued.v1', (event) => {
    deliveries.push(['sync', event.aggregate_id, event.payload.invoice_id]);
  });

  const second = eventBusService.subscribe('billing.invoice.issued.v1', async (event) => {
    await new Promise((resolve) => setTimeout(resolve, 5));
    deliveries.push(['async', event.aggregate_id, event.payload.currency_code]);
  });

  eventsService.logEvent({
    type: 'billing.invoice.issued.v1',
    tenant_id: 'tenant-1',
    aggregate_type: 'invoice',
    aggregate_id: 'invoice-1',
    aggregate_version: 1,
      payload: {
        invoice_id: 'invoice-1',
        customer_id: 'customer-1',
        issue_date: '2025-02-01',
        due_date: '2025-02-10',
        total_minor: 1250,
        currency_code: 'USD'
      }
  });

  await Promise.all([first.waitForIdle(), second.waitForIdle()]);

  assert.deepEqual(deliveries, [
    ['sync', 'invoice-1', 'invoice-1'],
    ['async', 'invoice-1', 'USD']
  ]);
});

test('replays stored canonical domain events to new subscribers and retries safely after transient failures', async () => {
  const { eventsService, eventBusService } = createEventsService();
  const delivered = [];
  let attempts = 0;

  const logged = eventsService.logEvent({
    type: 'billing.payment.settled.v1',
    tenant_id: 'tenant-1',
    aggregate_type: 'payment',
    aggregate_id: 'payment-1',
    aggregate_version: 1,
    payload: {
      payment_id: 'payment-1',
      settled_at: '2025-02-02T00:00:00.000Z',
      amount_minor: 2500,
      currency_code: 'USD'
    }
  });

  const subscription = eventBusService.subscribe('billing.payment.settled.v1', async (event) => {
    attempts += 1;
    if (attempts === 1) {
      throw new Error('temporary failure');
    }

    delivered.push(event.id);
  });

  await subscription.waitForIdle();

  assert.equal(attempts, 2);
  assert.deepEqual(delivered, [logged.id]);
});

test('handles high event volume for multiple consumers with no event loss', async () => {
  const { eventsService, eventBusService } = createEventsService();
  const totalEvents = 200;
  let syncCount = 0;
  let asyncCount = 0;

  const syncSubscription = eventBusService.subscribe('billing.invoice.created.v1', () => {
    syncCount += 1;
  });

  const asyncSubscription = eventBusService.subscribe('billing.invoice.created.v1', async () => {
    await Promise.resolve();
    asyncCount += 1;
  });

  for (let index = 0; index < totalEvents; index += 1) {
    eventsService.logEvent({
      type: 'billing.invoice.created.v1',
      tenant_id: 'tenant-1',
      aggregate_type: 'invoice',
      aggregate_id: `invoice-${index}`,
      aggregate_version: 1,
      payload: {
        invoice_id: `invoice-${index}`,
        customer_id: `customer-${index}`,
        invoice_number: `INV-${index}`,
        status: 'draft',
        total_minor: index + 1,
        currency_code: 'USD'
      }
    });
  }

  await Promise.all([syncSubscription.waitForIdle(), asyncSubscription.waitForIdle(), eventBusService.waitForIdle()]);

  assert.equal(syncCount, totalEvents);
  assert.equal(asyncCount, totalEvents);
});

test('records complete audit events and deduplicates duplicate audit mutations', async () => {
  const { eventsService } = createEventsService();

  const first = eventsService.logMutation({
    tenant_id: 'tenant-1',
    entity_type: 'invoice',
    entity_id: 'invoice-99',
    action: 'issued',
    aggregate_version: 2,
    actor_type: 'user',
    actor_id: 'user-42',
    payload: {
      invoice_id: 'invoice-99',
      status: 'issued'
    }
  });

  const duplicate = eventsService.logMutation({
    tenant_id: 'tenant-1',
    entity_type: 'invoice',
    entity_id: 'invoice-99',
    action: 'issued',
    aggregate_version: 2,
    actor_type: 'user',
    actor_id: 'user-42',
    payload: {
      invoice_id: 'invoice-99',
      status: 'issued'
    }
  });

  assert.equal(first.id, duplicate.id);
  assert.equal(first.event_category, 'audit');
  assert.equal(first.actor_type, 'user');
  assert.equal(first.payload.action, 'issued');
  assert.equal(first.payload.entity.type, 'invoice');
  assert.equal(first.payload.entity.id, 'invoice-99');
  assert.ok(first.payload.timestamp);
  assert.equal(first.payload.actor.id, 'user-42');
});

test('emits bill.created and bill.paid only after commit with canonical payloads', async () => {
  const { eventsService, eventBusService, transactionManager } = createEventsService();
  const delivered = [];
  const subscription = eventBusService.subscribe('billing.bill.created.v1', (event) => {
    delivered.push(event.type);
    assert.equal(event.payload.bill_id, 'bill-1');
    assert.equal(event.payload.currency_code, 'USD');
  });
  const paidSubscription = eventBusService.subscribe('billing.bill.paid.v1', (event) => {
    delivered.push(event.type);
    assert.equal(event.payload.bill_id, 'bill-1');
    assert.equal(event.payload.amount_paid_minor, 2500);
    assert.equal(event.payload.currency_code, 'USD');
  });

  await transactionManager.wrapper(async () => {
    eventsService.logEvent({
      type: 'billing.bill.created.v1',
      tenant_id: 'tenant-1',
      aggregate_type: 'bill',
      aggregate_id: 'bill-1',
      aggregate_version: 1,
      payload: {
        bill_id: 'bill-1',
        created_at: '2025-02-01T00:00:00.000Z',
        total_minor: 2500,
        currency_code: 'USD',
        expense_classification: 'operating'
      }
    });
    eventsService.logEvent({
      type: 'billing.bill.paid.v1',
      tenant_id: 'tenant-1',
      aggregate_type: 'bill',
      aggregate_id: 'bill-1',
      aggregate_version: 2,
      payload: {
        bill_id: 'bill-1',
        paid_at: '2025-02-02T00:00:00.000Z',
        amount_paid_minor: 2500,
        currency_code: 'USD'
      }
    });
    assert.equal(delivered.length, 0);
  }, []);

  await Promise.all([subscription.waitForIdle(), paidSubscription.waitForIdle()]);
  assert.deepEqual(delivered, ['billing.bill.created.v1', 'billing.bill.paid.v1']);
});
