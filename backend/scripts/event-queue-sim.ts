import { createDomainEvent } from '../src/modules/events/entities/event.entity';
import { EventConsumerIdempotencyService } from '../src/modules/idempotency/event-consumer-idempotency.service';
import { IdempotencyRepository } from '../src/modules/idempotency/idempotency.repository';
import { IdempotencyService } from '../src/modules/idempotency/idempotency.service';
import { EventProcessingRegistry } from '../src/modules/events/queue/event-processing.registry';
import { EventProcessingWorker } from '../src/modules/events/queue/event-processing.worker';
import { EventQueuePublisher } from '../src/modules/events/queue/event-queue.publisher';
import { InMemoryQueueDriver } from '../src/modules/events/queue/in-memory-queue.driver';

const sleep = (ms: number) => new Promise((resolve) => setTimeout(resolve, ms));

async function main(): Promise<void> {
  const driver = new InMemoryQueueDriver();
  const registry = new EventProcessingRegistry();
  const idempotencyRepository = new IdempotencyRepository();
  const idempotencyService = new IdempotencyService(idempotencyRepository);
  const consumerIdempotency = new EventConsumerIdempotencyService(idempotencyService);
  const worker = new EventProcessingWorker(driver, registry, consumerIdempotency);
  const publisher = new EventQueuePublisher(driver as never);

  let transientFailures = 0;
  let successCount = 0;
  const processedIds = new Set<string>();
  const processedVersions = new Map<string, number[]>();

  registry.register('billing.invoice.issued.v1', async (event) => {
    if (event.payload && (event.payload as { should_fail_once?: boolean }).should_fail_once && transientFailures === 0) {
      transientFailures += 1;
      throw new Error('simulated transient failure');
    }

    processedIds.add(event.event_id);
    successCount += 1;
    const versions = processedVersions.get(event.aggregate_id) ?? [];
    versions.push(event.aggregate_version);
    processedVersions.set(event.aggregate_id, versions);
  });

  await worker.onApplicationBootstrap();

  const retryEvent = createDomainEvent({
    type: 'billing.invoice.issued.v1',
    tenant_id: 'tenant-1',
    aggregate_type: 'invoice',
    aggregate_id: 'invoice-retry',
    aggregate_version: 1,
    payload: {
      invoice_id: 'invoice-retry',
      issue_date: '2026-01-01',
      due_date: null,
      total_minor: 5000,
      currency_code: 'USD',
      should_fail_once: true
    } as never,
    idempotency_key: 'retry-event'
  });

  await publisher.publish(retryEvent);
  await publisher.publish(retryEvent);

  const highLoadEvents = Array.from({ length: 50 }, (_, index) =>
    createDomainEvent({
      type: 'billing.invoice.issued.v1',
      tenant_id: 'tenant-1',
      aggregate_type: 'invoice',
      aggregate_id: `invoice-${Math.floor(index / 5)}`,
      aggregate_version: index + 2,
      payload: {
        invoice_id: `invoice-${Math.floor(index / 5)}`,
        issue_date: '2026-01-01',
        due_date: null,
        total_minor: 100 + index,
        currency_code: 'USD'
      },
      idempotency_key: `load-${index}`
    })
  );

  for (const event of highLoadEvents) {
    await publisher.publish(event);
  }

  await sleep(3000);

  if (transientFailures !== 1) {
    throw new Error(`Expected 1 transient failure, received ${transientFailures}`);
  }

  if (!processedIds.has(retryEvent.id)) {
    throw new Error('Retry event was not processed successfully after retry');
  }

  if (successCount !== highLoadEvents.length + 1) {
    throw new Error(`Expected ${highLoadEvents.length + 1} successful executions, received ${successCount}`);
  }

  const duplicateCount = [...processedIds].filter((id) => id === retryEvent.id).length;
  if (duplicateCount !== 1) {
    throw new Error('Duplicate execution side-effects detected for retry event');
  }

  for (const [aggregateId, versions] of processedVersions.entries()) {
    const sorted = [...versions].sort((a, b) => a - b);
    if (versions.join(',') !== sorted.join(',')) {
      throw new Error(`Aggregate ordering violated for ${aggregateId}`);
    }
  }

  console.log(
    JSON.stringify({
      transientFailures,
      processedEvents: processedIds.size,
      successCount,
      aggregateCount: processedVersions.size
    })
  );

  await worker.onModuleDestroy();
}

void main();
