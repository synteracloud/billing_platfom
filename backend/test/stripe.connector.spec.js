const test = require('node:test');
const assert = require('node:assert/strict');

const { StripeConnector } = require('../.tmp-test-dist/modules/payments/connectors/stripe/stripe.connector');
const { EventsService } = require('../.tmp-test-dist/modules/events/events.service');
const { EventsRepository } = require('../.tmp-test-dist/modules/events/events.repository');
const { EventConsumerIdempotencyService } = require('../.tmp-test-dist/modules/idempotency/event-consumer-idempotency.service');
const { IdempotencyRepository } = require('../.tmp-test-dist/modules/idempotency/idempotency.repository');
const { IdempotencyService } = require('../.tmp-test-dist/modules/idempotency/idempotency.service');
const { EventQueuePublisher } = require('../.tmp-test-dist/modules/events/queue/event-queue.publisher');
const { InMemoryQueueDriver } = require('../.tmp-test-dist/modules/events/queue/in-memory-queue.driver');

function createConnectorFixture() {
  const eventsRepository = new EventsRepository();
  const idempotencyRepository = new IdempotencyRepository();
  const idempotencyService = new IdempotencyService(idempotencyRepository);
  const eventConsumerIdempotencyService = new EventConsumerIdempotencyService(idempotencyService);
  const queueDriver = new InMemoryQueueDriver();
  const eventQueuePublisher = new EventQueuePublisher(queueDriver);
  const eventsService = new EventsService(eventsRepository, eventConsumerIdempotencyService, eventQueuePublisher);

  return {
    connector: new StripeConnector(eventsService, idempotencyService),
    eventsRepository
  };
}

test('maps stripe succeeded payment_intent to canonical payment', () => {
  const tenantId = 'tenant-1';
  const { connector, eventsRepository } = createConnectorFixture();

  const payment = connector.handleWebhook(tenantId, {
    id: 'evt_1',
    type: 'payment_intent.succeeded',
    created: 1767225600,
    data: {
      object: {
        object: 'payment_intent',
        id: 'pi_123',
        status: 'succeeded',
        amount_received: 2599,
        currency: 'usd',
        created: 1767225600,
        customer: 'cus_external',
        payment_method_types: ['card'],
        metadata: { customer_id: 'customer-internal-1' }
      }
    }
  });

  assert.equal(payment.id, 'stripe:pi_123');
  assert.equal(payment.tenant_id, tenantId);
  assert.equal(payment.customer_id, 'customer-internal-1');
  assert.equal(payment.amount_received_minor, 2599);
  assert.equal(payment.currency, 'USD');
  assert.equal(payment.payment_method, 'card');
  assert.equal(payment.status, 'settled');
  assert.equal(payment.allocated_minor, 0);
  assert.equal(payment.unallocated_minor, 2599);

  const events = eventsRepository.listByTenant(tenantId, {});
  assert.equal(events.length, 1);
  assert.equal(events[0].type, 'integration.record.normalized.v1');
  assert.equal(events[0].payload.canonical_entity, 'payment');
  assert.equal(events[0].payload.amount_minor, 2599);
});

test('is idempotent for webhook retries and emits one normalized event', () => {
  const tenantId = 'tenant-2';
  const { connector, eventsRepository } = createConnectorFixture();

  const webhook = {
    id: 'evt_retry_1',
    type: 'charge.succeeded',
    data: {
      object: {
        object: 'charge',
        id: 'ch_123',
        status: 'succeeded',
        amount: 1200,
        currency: 'usd',
        created: 1767225600,
        customer: 'cus_123',
        payment_method_details: { type: 'card' }
      }
    }
  };

  const first = connector.handleWebhook(tenantId, webhook);
  const second = connector.handleWebhook(tenantId, webhook);

  assert.deepEqual(second, first);

  const events = eventsRepository.listByTenant(tenantId, {});
  assert.equal(events.length, 1);
  assert.equal(events[0].payload.source_record_id, 'evt_retry_1');
});
