const test = require('node:test');
const assert = require('node:assert/strict');

const { EventsService } = require('../.tmp-test-dist/modules/events/events.service');
const { EventsRepository } = require('../.tmp-test-dist/modules/events/events.repository');
const { EventConsumerIdempotencyService } = require('../.tmp-test-dist/modules/idempotency/event-consumer-idempotency.service');
const { IdempotencyRepository } = require('../.tmp-test-dist/modules/idempotency/idempotency.repository');
const { IdempotencyService } = require('../.tmp-test-dist/modules/idempotency/idempotency.service');
const { EventQueuePublisher } = require('../.tmp-test-dist/modules/events/queue/event-queue.publisher');
const { InMemoryQueueDriver } = require('../.tmp-test-dist/modules/events/queue/in-memory-queue.driver');
const { PollingRepository } = require('../.tmp-test-dist/modules/integrations/polling.repository');
const { PollingService } = require('../.tmp-test-dist/modules/integrations/polling.service');
const { IntegrationsSchedulerService } = require('../.tmp-test-dist/modules/integrations/scheduler.service');

function createPollingSystem() {
  const eventsRepository = new EventsRepository();
  const idempotencyRepository = new IdempotencyRepository();
  const idempotencyService = new IdempotencyService(idempotencyRepository);
  const consumerIdempotency = new EventConsumerIdempotencyService(idempotencyService);
  const queueDriver = new InMemoryQueueDriver();
  const eventPublisher = new EventQueuePublisher(queueDriver);
  const eventsService = new EventsService(eventsRepository, consumerIdempotency, eventPublisher);
  const pollingRepository = new PollingRepository();
  const pollingService = new PollingService(pollingRepository, eventsService);
  const schedulerService = new IntegrationsSchedulerService(pollingService, pollingRepository);

  return { eventsRepository, pollingService, schedulerService };
}

function sampleResponse() {
  return {
    records: [
      {
        source_object_type: ' payment ',
        source_object_id: ' ext-pay-1 ',
        occurred_at: '2026-03-25T00:00:00.000Z',
        raw_payload: { id: 'ext-pay-1', amount_minor: 1000, currency: 'USD' },
        canonical_entity: 'should_be_ignored',
        amount_minor: 1000,
        currency_code: 'usd'
      },
      {
        source_object_type: 'transaction',
        source_object_id: 'ext-pay-2',
        occurred_at: '2026-03-25T00:05:00.000Z',
        raw_payload: { id: 'ext-pay-2', amount_minor: 2500, currency: 'USD' },
        canonical_entity: 'bank_transaction',
        amount_minor: 2500,
        currency_code: 'USD'
      }
    ],
    next_cursor: 'cursor-2'
  };
}

test('simulate repeated pulls and validate deduplication (no duplicate ingestion)', async () => {
  const { pollingService, eventsRepository } = createPollingSystem();

  const first = pollingService.executePull({
    tenant_id: 'tenant-1',
    connector_id: 'stripe',
    pulled_at: '2026-03-25T10:00:00.000Z',
    response: sampleResponse()
  });

  const second = pollingService.executePull({
    tenant_id: 'tenant-1',
    connector_id: 'stripe',
    pulled_at: '2026-03-25T10:01:00.000Z',
    response: sampleResponse()
  });

  assert.equal(first.ingested_count, 2);
  assert.equal(first.duplicate_count, 0);
  assert.equal(second.ingested_count, 0);
  assert.equal(second.duplicate_count, 2);
  assert.equal(pollingService.listRawResponses('tenant-1', 'stripe').length, 2);
  assert.equal(pollingService.listNormalizedRecords('tenant-1', 'stripe').length, 2);
  assert.equal(eventsRepository.listAll().filter((event) => event.type === 'integration.record.normalized.v1').length, 2);
});

test('normalization is canonical and connector-decoupled', async () => {
  const { pollingService } = createPollingSystem();

  pollingService.executePull({
    tenant_id: 'tenant-1',
    connector_id: 'stripe',
    pulled_at: '2026-03-25T10:00:00.000Z',
    response: sampleResponse()
  });

  const normalized = pollingService.listNormalizedRecords('tenant-1', 'stripe');
  assert.equal(normalized[0].canonical_entity, 'payment');
  assert.equal(normalized[0].currency_code, 'USD');
  assert.equal(normalized[0].source_object_type, 'payment');
  assert.equal(normalized[1].canonical_entity, 'bank_transaction');
});

test('safe retries and stable scheduling prevent duplicate slot execution', async () => {
  const { schedulerService, pollingService } = createPollingSystem();

  const client = {
    pull: async () => sampleResponse()
  };

  const first = await schedulerService.runSlot('tenant-1', 'stripe', 15, client, new Date('2026-03-25T10:09:00.000Z'));
  const second = await schedulerService.runSlot('tenant-1', 'stripe', 15, client, new Date('2026-03-25T10:12:00.000Z'));
  const third = await schedulerService.runSlot('tenant-1', 'stripe', 15, client, new Date('2026-03-25T10:16:00.000Z'));

  assert.ok(first);
  assert.equal(second, null);
  assert.ok(third);
  assert.equal(pollingService.listRawResponses('tenant-1', 'stripe').length, 2);
});
