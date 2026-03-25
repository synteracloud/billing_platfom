const test = require('node:test');
const assert = require('node:assert/strict');
const { EventProcessingWorker } = require('../.tmp-test-dist/modules/events/queue/event-processing.worker');
const { EventProcessingRegistry } = require('../.tmp-test-dist/modules/events/queue/event-processing.registry');
const { InMemoryQueueDriver } = require('../.tmp-test-dist/modules/events/queue/in-memory-queue.driver');
const { EventConsumerIdempotencyService } = require('../.tmp-test-dist/modules/idempotency/event-consumer-idempotency.service');
const { IdempotencyRepository } = require('../.tmp-test-dist/modules/idempotency/idempotency.repository');
const { IdempotencyService } = require('../.tmp-test-dist/modules/idempotency/idempotency.service');

function buildEnvelope(overrides = {}) {
  return {
    event_id: overrides.event_id ?? 'evt-1',
    event_name: overrides.event_name ?? 'billing.payment.settled.v1',
    event_version: 1,
    occurred_at: overrides.occurred_at ?? new Date().toISOString(),
    recorded_at: new Date().toISOString(),
    tenant_id: 'tenant-1',
    aggregate_type: 'payment',
    aggregate_id: overrides.aggregate_id ?? 'payment-1',
    aggregate_version: overrides.aggregate_version ?? 1,
    causation_id: null,
    correlation_id: null,
    idempotency_key: overrides.idempotency_key ?? 'billing.payment.settled.v1:payment-1:1',
    producer: 'test-suite',
    payload: { payment_id: 'payment-1' }
  };
}

async function setupWorker() {
  const queueDriver = new InMemoryQueueDriver();
  const processingRegistry = new EventProcessingRegistry();
  const idempotencyRepository = new IdempotencyRepository();
  const idempotencyService = new IdempotencyService(idempotencyRepository);
  const eventConsumerIdempotencyService = new EventConsumerIdempotencyService(idempotencyService);
  const worker = new EventProcessingWorker(queueDriver, processingRegistry, eventConsumerIdempotencyService);
  await worker.onApplicationBootstrap();
  return { queueDriver, processingRegistry, worker };
}

test('prevents duplicate side effects when duplicate events are delivered', async () => {
  const { queueDriver, processingRegistry, worker } = await setupWorker();
  let sideEffects = 0;

  processingRegistry.register('billing.payment.settled.v1', 'settlement-hook', async () => {
    sideEffects += 1;
  });

  const envelope = buildEnvelope();

  await queueDriver.add('billing.payment.settled.v1', envelope, { jobId: 'job-1', attempts: 3, backoffDelayMs: 1 });
  await queueDriver.add('billing.payment.settled.v1', envelope, { jobId: 'job-2', attempts: 3, backoffDelayMs: 1 });

  await new Promise((resolve) => setTimeout(resolve, 20));
  await worker.onModuleDestroy();

  assert.equal(sideEffects, 1);
});

test('retries safely after failure and succeeds exactly once', async () => {
  const { queueDriver, processingRegistry, worker } = await setupWorker();
  let attempts = 0;
  let sideEffects = 0;

  processingRegistry.register('billing.payment.settled.v1', 'retrying-handler', async () => {
    attempts += 1;
    if (attempts === 1) {
      throw new Error('transient failure');
    }

    sideEffects += 1;
  });

  await queueDriver.add('billing.payment.settled.v1', buildEnvelope(), { jobId: 'job-retry', attempts: 3, backoffDelayMs: 1 });

  await new Promise((resolve) => setTimeout(resolve, 30));
  await worker.onModuleDestroy();

  assert.equal(attempts, 2);
  assert.equal(sideEffects, 1);
});

test('processes out-of-order delivery without duplicate effects', async () => {
  const { queueDriver, processingRegistry, worker } = await setupWorker();
  const processed = [];

  processingRegistry.register('billing.payment.settled.v1', 'ordered-handler', async (event) => {
    processed.push(event.aggregate_version);
  });

  await queueDriver.add(
    'billing.payment.settled.v1',
    buildEnvelope({
      event_id: 'evt-2',
      aggregate_version: 2,
      idempotency_key: 'billing.payment.settled.v1:payment-1:2'
    }),
    { jobId: 'job-v2', attempts: 3, backoffDelayMs: 1 }
  );
  await queueDriver.add('billing.payment.settled.v1', buildEnvelope({ event_id: 'evt-1', aggregate_version: 1 }), {
    jobId: 'job-v1',
    attempts: 3,
    backoffDelayMs: 1
  });

  await new Promise((resolve) => setTimeout(resolve, 30));
  await worker.onModuleDestroy();

  assert.deepEqual(processed.sort((a, b) => a - b), [1, 2]);
});
