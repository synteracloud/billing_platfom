import assert from 'assert';
import { EventConsumerIdempotencyService } from '../src/modules/idempotency/event-consumer-idempotency.service';
import { IdempotencyRepository } from '../src/modules/idempotency/idempotency.repository';
import { IdempotencyService } from '../src/modules/idempotency/idempotency.service';
import { EventBusService } from '../src/modules/events/event-bus.service';
import { EventsRepository } from '../src/modules/events/events.repository';
import { EventsService } from '../src/modules/events/events.service';
import { EventQueuePublisher } from '../src/modules/events/queue/event-queue.publisher';
import { InMemoryQueueDriver } from '../src/modules/events/queue/in-memory-queue.driver';
import { IntegrationIngestionService } from '../src/modules/integration-ingestion/integration-ingestion.service';

async function main() {
  const idempotencyRepository = new IdempotencyRepository();
  const idempotencyService = new IdempotencyService(idempotencyRepository);
  const eventConsumerIdempotencyService = new EventConsumerIdempotencyService(idempotencyService);
  const eventsRepository = new EventsRepository();
  const queueDriver = new InMemoryQueueDriver();
  const eventQueuePublisher = new EventQueuePublisher(queueDriver);
  const eventsService = new EventsService(eventsRepository, eventConsumerIdempotencyService, eventQueuePublisher);
  const eventBus = new EventBusService(eventsRepository, eventConsumerIdempotencyService);
  const ingestionService = new IntegrationIngestionService(eventsService);

  const seenTypes: string[] = [];
  const seenPayloads: Array<Record<string, unknown>> = [];

  const paymentSub = eventBus.subscribe('payment.external.received.v1', (event) => {
    seenTypes.push(event.type);
    seenPayloads.push(event.payload as Record<string, unknown>);
  });

  const bankSub = eventBus.subscribe('bank.transaction.synced.v1', (event) => {
    seenTypes.push(event.type);
    seenPayloads.push(event.payload as Record<string, unknown>);
  });

  const paymentEvent = ingestionService.ingestExternalPayment({
    tenant_id: 'tenant-ingest',
    source_system: 'Stripe',
    source_payment_id: 'pay_ext_1',
    amount: 51.25,
    currency: 'usd',
    received_at: '2026-03-25T00:00:00.000Z'
  });

  const bankEvent = ingestionService.syncBankTransaction({
    tenant_id: 'tenant-ingest',
    source_system: 'Plaid',
    source_transaction_id: 'txn_100',
    amount: 51.25,
    currency: 'usd',
    direction: 'credit',
    synced_at: '2026-03-25T00:01:00.000Z'
  });

  await eventBus.publish(paymentEvent);
  await eventBus.publish(bankEvent);
  await paymentSub.waitForIdle();
  await bankSub.waitForIdle();

  assert.deepEqual(seenTypes, ['payment.external.received.v1', 'bank.transaction.synced.v1']);
  assert.equal(eventsService.listEvents('tenant-ingest', {}).length, 2, 'must emit exactly two canonical events');

  assert.deepEqual(paymentEvent.payload, {
    tenant_id: 'tenant-ingest',
    source_system: 'stripe',
    external_payment_id: 'pay_ext_1',
    received_at: '2026-03-25T00:00:00.000Z',
    amount_minor: 5125,
    currency_code: 'USD',
    status: 'received'
  });

  assert.deepEqual(bankEvent.payload, {
    tenant_id: 'tenant-ingest',
    source_system: 'plaid',
    bank_transaction_id: 'txn_100',
    synced_at: '2026-03-25T00:01:00.000Z',
    amount_minor: 5125,
    currency_code: 'USD',
    direction: 'credit'
  });

  const stored = eventsService.listEvents('tenant-ingest', {});
  assert(stored.every((event) => event.aggregate_type === 'external_payment' || event.aggregate_type === 'bank_transaction'));

  await paymentSub.unsubscribe();
  await bankSub.unsubscribe();

  console.log('integration ingestion event test passed');
}

main().catch((error) => {
  console.error(error);
  process.exitCode = 1;
});
