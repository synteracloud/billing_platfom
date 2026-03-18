const test = require('node:test');
const assert = require('node:assert/strict');
const { EventBusService } = require('../.tmp-test-dist/modules/events/event-bus.service');
const { EventsService } = require('../.tmp-test-dist/modules/events/events.service');
const { EventsRepository } = require('../.tmp-test-dist/modules/events/events.repository');
const { EventConsumerIdempotencyService } = require('../.tmp-test-dist/modules/idempotency/event-consumer-idempotency.service');
const { IdempotencyRepository } = require('../.tmp-test-dist/modules/idempotency/idempotency.repository');
const { IdempotencyService } = require('../.tmp-test-dist/modules/idempotency/idempotency.service');

function createEventsService() {
  const eventsRepository = new EventsRepository();
  const idempotencyRepository = new IdempotencyRepository();
  const idempotencyService = new IdempotencyService(idempotencyRepository);
  const eventConsumerIdempotencyService = new EventConsumerIdempotencyService(idempotencyService);
  const eventBusService = new EventBusService(eventsRepository, eventConsumerIdempotencyService);
  const eventsService = new EventsService(eventsRepository, eventConsumerIdempotencyService, eventBusService);

  return { eventsService, eventsRepository };
}

test('publishes invoice events to multiple sync and async consumers without coupling', async () => {
  const { eventsService } = createEventsService();
  const deliveries = [];

  const first = eventsService.subscribe('billing.invoice.issued.v1', (event) => {
    deliveries.push(['sync', event.aggregate_id, event.payload.invoice_id]);
  });

  const second = eventsService.subscribe('billing.invoice.issued.v1', async (event) => {
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
  const { eventsService } = createEventsService();
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

  const subscription = eventsService.subscribe('billing.payment.settled.v1', async (event) => {
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
  const { eventsService } = createEventsService();
  const totalEvents = 200;
  let syncCount = 0;
  let asyncCount = 0;

  const syncSubscription = eventsService.subscribe('billing.invoice.created.v1', () => {
    syncCount += 1;
  });

  const asyncSubscription = eventsService.subscribe('billing.invoice.created.v1', async () => {
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

  await Promise.all([syncSubscription.waitForIdle(), asyncSubscription.waitForIdle(), eventsService.waitForIdle()]);

  assert.equal(syncCount, totalEvents);
  assert.equal(asyncCount, totalEvents);
});
