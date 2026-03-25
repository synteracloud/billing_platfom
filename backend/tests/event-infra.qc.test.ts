import assert from 'assert';
import { EventConsumerIdempotencyService } from '../src/modules/idempotency/event-consumer-idempotency.service';
import { IdempotencyRepository } from '../src/modules/idempotency/idempotency.repository';
import { IdempotencyService } from '../src/modules/idempotency/idempotency.service';
import { EventBusService } from '../src/modules/events/event-bus.service';
import { EventsRepository } from '../src/modules/events/events.repository';
import { EventsService } from '../src/modules/events/events.service';
import { EventProcessingRegistry } from '../src/modules/events/queue/event-processing.registry';
import { EventProcessingWorker } from '../src/modules/events/queue/event-processing.worker';
import { EventQueuePublisher } from '../src/modules/events/queue/event-queue.publisher';
import { InMemoryQueueDriver } from '../src/modules/events/queue/in-memory-queue.driver';

async function main() {
  const idempotencyRepository = new IdempotencyRepository();
  const idempotencyService = new IdempotencyService(idempotencyRepository);
  const eventConsumerIdempotencyService = new EventConsumerIdempotencyService(idempotencyService);
  const eventsRepository = new EventsRepository();
  const queueDriver = new InMemoryQueueDriver();
  const eventQueuePublisher = new EventQueuePublisher(queueDriver);
  const eventsService = new EventsService(eventsRepository, eventConsumerIdempotencyService, eventQueuePublisher);
  const processingRegistry = new EventProcessingRegistry();
  const worker = new EventProcessingWorker(queueDriver, processingRegistry, eventConsumerIdempotencyService);
  await worker.onApplicationBootstrap();

  // Handlers are decoupled from producer and retriable/idempotent.
  let invoiceProcessed = 0;
  let paymentProcessed = 0;
  let retryAttempts = 0;
  const versionOrder: number[] = [];

  processingRegistry.register('billing.invoice.issued.v1', async (event) => {
    invoiceProcessed += 1;
    versionOrder.push(event.aggregate_version);
  });

  processingRegistry.register('billing.payment.settled.v1', async (event) => {
    if (event.aggregate_id === 'pay-retry') {
      retryAttempts += 1;
      if (retryAttempts === 1) {
        throw new Error('simulated transient failure');
      }
    }
    paymentProcessed += 1;
  });

  // Event bus publish/consume path.
  const eventBus = new EventBusService(eventsRepository, eventConsumerIdempotencyService);
  const busSeen: string[] = [];
  const subscription = eventBus.subscribe('billing.invoice.issued.v1', async (event) => {
    busSeen.push(event.id);
  });

  const issued = eventsService.logEvent({
    tenant_id: 'tenant-qc',
    type: 'billing.invoice.issued.v1',
    aggregate_type: 'invoice',
    aggregate_id: 'inv-1',
    aggregate_version: 1,
    idempotency_key: 'qc-invoice-issued-1',
    payload: { invoice_id: 'inv-1', total_minor: 1000, currency_code: 'USD', issue_date: '2024-01-01', due_date: '2024-02-01' }
  });

  await eventBus.publish(issued);
  await subscription.waitForIdle();

  // Duplicate enqueue should not duplicate side effects.
  await eventQueuePublisher.publish(issued);

  // Retry safety: first attempt fails, second attempt succeeds once.
  eventsService.logEvent({
    tenant_id: 'tenant-qc',
    type: 'billing.payment.settled.v1',
    aggregate_type: 'payment',
    aggregate_id: 'pay-retry',
    aggregate_version: 1,
    idempotency_key: 'qc-payment-retry-1',
    payload: { payment_id: 'pay-retry', amount_minor: 1000, currency_code: 'USD', settled_at: '2024-01-01T00:00:00.000Z' }
  });

  // Out-of-order delivery simulation.
  eventsService.logEvent({
    tenant_id: 'tenant-qc',
    type: 'billing.invoice.issued.v1',
    aggregate_type: 'invoice',
    aggregate_id: 'inv-out-of-order',
    aggregate_version: 2,
    idempotency_key: 'qc-invoice-ooo-2',
    payload: { invoice_id: 'inv-out-of-order', total_minor: 2000, currency_code: 'USD', issue_date: '2024-01-02', due_date: '2024-02-02' }
  });
  eventsService.logEvent({
    tenant_id: 'tenant-qc',
    type: 'billing.invoice.issued.v1',
    aggregate_type: 'invoice',
    aggregate_id: 'inv-out-of-order',
    aggregate_version: 1,
    idempotency_key: 'qc-invoice-ooo-1',
    payload: { invoice_id: 'inv-out-of-order', total_minor: 2000, currency_code: 'USD', issue_date: '2024-01-01', due_date: '2024-02-01' }
  });

  await new Promise((resolve) => setTimeout(resolve, 1000));

  assert.equal(busSeen.filter((id) => id === issued.id).length, 1, 'event bus must consume each event id once per subscription');
  assert.equal(invoiceProcessed, 3, 'invoice handler must process all enqueued invoice-issued events exactly once');
  assert.equal(paymentProcessed, 1, 'payment handler must finish with exactly one successful side effect');
  assert.equal(retryAttempts, 2, 'payment retry must reattempt after failure');
  assert.deepEqual(versionOrder.slice(-2), [2, 1], 'out-of-order delivery should be observable and safe for handlers');

  const stored = eventsService.listEvents('tenant-qc', {});
  assert.equal(stored.length, 4, 'all domain events must remain present in immutable event log for audit trace');

  await subscription.unsubscribe();
  await worker.onModuleDestroy();
  await queueDriver.close();

  console.log('event infra qc test passed');
}

main().catch((error) => {
  console.error(error);
  process.exitCode = 1;
});
