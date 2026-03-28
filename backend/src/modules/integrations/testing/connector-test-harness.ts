import { EventsRepository } from '../../events/events.repository';
import { EventsService } from '../../events/events.service';
import { EventQueuePublisher } from '../../events/queue/event-queue.publisher';
import { InMemoryQueueDriver } from '../../events/queue/in-memory-queue.driver';
import { EventConsumerIdempotencyService } from '../../idempotency/event-consumer-idempotency.service';
import { IdempotencyRepository } from '../../idempotency/idempotency.repository';
import { IdempotencyService } from '../../idempotency/idempotency.service';
import { WebhooksRepository } from '../../webhooks/webhooks.repository';
import { IngestWebhookInput, WebhookIngestionResult, WebhooksService } from '../../webhooks/webhooks.service';
import { ExecutePullInput, PollingService, PullSummary } from '../polling.service';
import { PollingRepository } from '../polling.repository';

export interface ReplayWebhookBatchInput {
  provider: string;
  deliveries: Array<Omit<IngestWebhookInput, 'provider'>>;
}

export interface SimulatePollingBatchInput {
  tenant_id: string;
  connector_id: string;
  pulls: Array<Pick<ExecutePullInput, 'pulled_at' | 'response'>>;
}

export interface NormalizationValidationInput {
  tenant_id: string;
  connector_id?: string;
  expected_canonical_entities?: string[];
}

export interface ConnectorHarnessSnapshot {
  webhooks_count: number;
  raw_responses_count: number;
  normalized_records_count: number;
  normalized_event_count: number;
}

/**
 * Test-only harness that keeps all connector replay/polling state fully isolated in memory.
 * It must never be wired into production modules.
 */
export class ConnectorTestHarness {
  private constructor(
    private readonly pollingService: PollingService,
    private readonly pollingRepository: PollingRepository,
    private readonly webhooksService: WebhooksService,
    private readonly webhooksRepository: WebhooksRepository,
    private readonly eventsRepository: EventsRepository
  ) {}

  static createIsolated(): ConnectorTestHarness {
    const eventsRepository = new EventsRepository();
    const idempotencyRepository = new IdempotencyRepository();
    const idempotencyService = new IdempotencyService(idempotencyRepository);
    const consumerIdempotency = new EventConsumerIdempotencyService(idempotencyService);
    const queueDriver = new InMemoryQueueDriver();
    const eventPublisher = new EventQueuePublisher(queueDriver);
    const eventsService = new EventsService(eventsRepository, consumerIdempotency, eventPublisher);

    const pollingRepository = new PollingRepository();
    const pollingService = new PollingService(pollingRepository, eventsService);

    const webhooksRepository = new WebhooksRepository();
    const webhooksService = new WebhooksService(webhooksRepository);

    return new ConnectorTestHarness(
      pollingService,
      pollingRepository,
      webhooksService,
      webhooksRepository,
      eventsRepository
    );
  }

  replayWebhookPayloads(input: ReplayWebhookBatchInput): WebhookIngestionResult[] {
    return input.deliveries.map((delivery) => this.webhooksService.ingest({
      provider: input.provider,
      delivery_id: delivery.delivery_id,
      payload_raw: delivery.payload_raw,
      signature: delivery.signature,
      timestamp: delivery.timestamp
    }));
  }

  simulatePolling(input: SimulatePollingBatchInput): PullSummary[] {
    return input.pulls.map((pull) => this.pollingService.executePull({
      tenant_id: input.tenant_id,
      connector_id: input.connector_id,
      pulled_at: pull.pulled_at,
      response: pull.response
    }));
  }

  validateNormalization(input: NormalizationValidationInput): {
    valid: boolean;
    normalized_count: number;
    canonical_entities: string[];
  } {
    const normalized = this.pollingService.listNormalizedRecords(input.tenant_id, input.connector_id);
    const canonicalEntities = normalized.map((record) => record.canonical_entity);

    if (!input.expected_canonical_entities || input.expected_canonical_entities.length === 0) {
      return {
        valid: normalized.length > 0,
        normalized_count: normalized.length,
        canonical_entities: canonicalEntities
      };
    }

    const expected = [...input.expected_canonical_entities].sort();
    const actual = [...canonicalEntities].sort();

    return {
      valid: expected.length === actual.length && expected.every((value, index) => value === actual[index]),
      normalized_count: normalized.length,
      canonical_entities: canonicalEntities
    };
  }

  snapshot(tenantId: string, connectorId?: string): ConnectorHarnessSnapshot {
    const rawResponses = this.pollingService.listRawResponses(tenantId, connectorId);
    const normalizedRecords = this.pollingService.listNormalizedRecords(tenantId, connectorId);

    const normalizedEventCount = this.eventsRepository
      .listAll()
      .filter((event) => event.type === 'integration.record.normalized.v1')
      .filter((event) => event.tenant_id === tenantId).length;

    return {
      webhooks_count: this.webhooksRepository.list().length,
      raw_responses_count: rawResponses.length,
      normalized_records_count: normalizedRecords.length,
      normalized_event_count: normalizedEventCount
    };
  }
}
