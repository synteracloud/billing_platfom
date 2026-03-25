import { BadRequestException, Injectable } from '@nestjs/common';
import { createHash, randomUUID } from 'crypto';
import { EventsService } from '../events/events.service';
import { createRawIntegrationResponse } from './entities/raw-integration-response.entity';
import { NormalizedIntegrationRecord, PollingRepository } from './polling.repository';

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

      const normalized = this.normalizeRecord(input.tenant_id, input.connector_id, pulledAt, inserted.record, record);
      this.pollingRepository.upsertNormalizedRecord(normalized);

      ingestedCount += 1;
      this.eventsService.logEvent({
        tenant_id: input.tenant_id,
        type: 'integration.record.normalized.v1',
        aggregate_type: 'normalized_record',
        aggregate_id: normalized.id,
        aggregate_version: 1,
        idempotency_key: `integration:normalized:${input.connector_id}:${record.source_object_id}:${contentHash}`,
        event_category: 'integration',
        payload: normalized.normalized_payload
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

  listNormalizedRecords(tenantId: string, connectorId?: string) {
    return this.pollingRepository.listNormalizedRecords(tenantId, connectorId);
  }

  private normalizeRecord(
    tenantId: string,
    connectorId: string,
    pulledAt: string,
    insertedRaw: ReturnType<PollingRepository['insertRawResponse']>['record'],
    record: ExternalPullRecord
  ): NormalizedIntegrationRecord {
    const sourceObjectType = this.requireText(record.source_object_type, 'source_object_type').toLowerCase();
    const sourceObjectId = this.requireText(record.source_object_id, 'source_object_id');
    const occurredAt = this.requireDate(record.occurred_at, 'occurred_at') ?? pulledAt;
    const canonicalEntity = this.resolveCanonicalEntity(record.canonical_entity, sourceObjectType, connectorId);
    const amountMinor = this.normalizeAmountMinor(record.amount_minor);
    const currencyCode = this.normalizeCurrencyCode(record.currency_code);

    const normalizedPayload = {
      normalized_record_id: insertedRaw.id,
      source_system: connectorId,
      source_record_id: sourceObjectId,
      source_object_type: sourceObjectType,
      canonical_entity: canonicalEntity,
      occurred_at: occurredAt,
      amount_minor: amountMinor,
      currency_code: currencyCode,
      content_hash: insertedRaw.content_hash,
      raw_record_id: insertedRaw.id,
      normalized_at: pulledAt
    };

    return {
      id: randomUUID(),
      tenant_id: tenantId,
      connector_id: connectorId,
      source_object_type: sourceObjectType,
      source_object_id: sourceObjectId,
      canonical_entity: canonicalEntity,
      occurred_at: occurredAt,
      amount_minor: amountMinor,
      currency_code: currencyCode,
      content_hash: insertedRaw.content_hash,
      raw_response_id: insertedRaw.id,
      normalized_payload: normalizedPayload
    };
  }

  private resolveCanonicalEntity(candidate: string | undefined, sourceObjectType: string, connectorId: string): string {
    const allowed = new Set(['payment', 'bank_transaction', 'invoice']);
    const normalizedCandidate = candidate?.trim().toLowerCase().replace(/\s+/g, '_') ?? '';
    if (normalizedCandidate && allowed.has(normalizedCandidate)) {
      return normalizedCandidate;
    }

    const byType: Record<string, string> = {
      payment: 'payment',
      charge: 'payment',
      payout: 'payment',
      bank_transaction: 'bank_transaction',
      transaction: 'bank_transaction',
      invoice: 'invoice'
    };

    const direct = byType[sourceObjectType];
    if (direct) {
      return direct;
    }

    const providerFallback = connectorId.trim().toLowerCase();
    if (providerFallback.includes('bank')) {
      return 'bank_transaction';
    }

    return 'payment';
  }

  private normalizeAmountMinor(amountMinor: number | null | undefined): number | null {
    if (amountMinor === null || amountMinor === undefined) {
      return null;
    }

    if (!Number.isInteger(amountMinor)) {
      throw new BadRequestException('amount_minor must be an integer when provided');
    }

    return amountMinor;
  }

  private normalizeCurrencyCode(currencyCode: string | null | undefined): string | null {
    if (currencyCode === null || currencyCode === undefined) {
      return null;
    }

    const normalized = this.requireText(currencyCode, 'currency_code').toUpperCase();
    if (normalized.length !== 3) {
      throw new BadRequestException('currency_code must be a 3-letter ISO code when provided');
    }

    return normalized;
  }

  private requireText(value: string, fieldName: string): string {
    if (typeof value !== 'string' || value.trim().length === 0) {
      throw new BadRequestException(`${fieldName} is required`);
    }

    return value.trim();
  }

  private requireDate(value: string, fieldName: string): string | null {
    const normalized = this.requireText(value, fieldName);
    const parsed = new Date(normalized);
    if (Number.isNaN(parsed.valueOf())) {
      throw new BadRequestException(`${fieldName} must be a valid ISO date`);
    }

    return parsed.toISOString();
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
