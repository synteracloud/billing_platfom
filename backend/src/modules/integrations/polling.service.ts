import { Injectable } from '@nestjs/common';
import { createHash } from 'crypto';
import { EventsService } from '../events/events.service';
import { createRawIntegrationResponse } from './entities/raw-integration-response.entity';
import { PollingRepository } from './polling.repository';

export interface ExternalPullRecord {
  source_object_type: string;
  source_object_id: string;
  occurred_at: string;
  raw_payload: Record<string, unknown>;
  canonical_entity?: string;
  amount_minor?: number | null;
  currency_code?: string | null;
}

export interface ExternalPullResponse {
  records: ExternalPullRecord[];
  next_cursor?: string | null;
}

export interface PollingClient {
  pull(cursor?: string | null): Promise<ExternalPullResponse>;
}

export interface ExecutePullInput {
  tenant_id: string;
  connector_id: string;
  pulled_at?: string;
  response: ExternalPullResponse;
}

@Injectable()
export class PollingService {
  constructor(
    private readonly pollingRepository: PollingRepository,
    private readonly eventsService: EventsService
  ) {}

  async pullFromApi(tenantId: string, connectorId: string, client: PollingClient, pulledAt = new Date().toISOString()): Promise<PullSummary> {
    const checkpoint = this.pollingRepository.getCheckpoint(tenantId, connectorId);
    const response = await client.pull(checkpoint?.cursor ?? null);

    const summary = this.executePull({
      tenant_id: tenantId,
      connector_id: connectorId,
      pulled_at: pulledAt,
      response
    });

    this.pollingRepository.upsertCheckpoint({
      tenant_id: tenantId,
      connector_id: connectorId,
      cursor: response.next_cursor ?? checkpoint?.cursor ?? null,
      updated_at: pulledAt
    });

    return summary;
  }

  executePull(input: ExecutePullInput): PullSummary {
    const pulledAt = input.pulled_at ?? new Date().toISOString();
    let ingestedCount = 0;
    let duplicateCount = 0;

    for (const record of input.response.records) {
      const contentHash = this.hashPayload(record.raw_payload);
      const inserted = this.pollingRepository.insertRawResponse(createRawIntegrationResponse({
        tenant_id: input.tenant_id,
        connector_id: input.connector_id,
        source_object_type: record.source_object_type,
        source_object_id: record.source_object_id,
        occurred_at: record.occurred_at,
        pulled_at: pulledAt,
        content_hash: contentHash,
        raw_payload: record.raw_payload
      }));

      if (!inserted.inserted) {
        duplicateCount += 1;
        continue;
      }

      ingestedCount += 1;
      this.eventsService.logEvent({
        tenant_id: input.tenant_id,
        type: 'integration.record.normalized.v1',
        aggregate_type: 'normalized_record',
        aggregate_id: inserted.record.id,
        aggregate_version: 1,
        idempotency_key: `integration:normalized:${input.connector_id}:${record.source_object_id}:${contentHash}`,
        event_category: 'integration',
        payload: {
          normalized_record_id: inserted.record.id,
          source_system: input.connector_id,
          source_record_id: record.source_object_id,
          canonical_entity: record.canonical_entity ?? record.source_object_type,
          amount_minor: record.amount_minor ?? null,
          currency_code: record.currency_code ?? null
        }
      });
    }

    return {
      tenant_id: input.tenant_id,
      connector_id: input.connector_id,
      pulled_count: input.response.records.length,
      ingested_count: ingestedCount,
      duplicate_count: duplicateCount,
      pulled_at: pulledAt
    };
  }

  listRawResponses(tenantId: string, connectorId?: string) {
    return this.pollingRepository.listRawResponses(tenantId, connectorId);
  }

  private hashPayload(payload: Record<string, unknown>): string {
    return createHash('sha256').update(JSON.stringify(payload)).digest('hex');
  }
}

export interface PullSummary {
  tenant_id: string;
  connector_id: string;
  pulled_count: number;
  ingested_count: number;
  duplicate_count: number;
  pulled_at: string;
}
