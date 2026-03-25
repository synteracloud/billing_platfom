import { Injectable } from '@nestjs/common';
import { RawIntegrationResponseEntity } from './entities/raw-integration-response.entity';

export interface PollCheckpoint {
  tenant_id: string;
  connector_id: string;
  cursor: string | null;
  updated_at: string;
}

export interface NormalizedIntegrationRecord {
  id: string;
  tenant_id: string;
  connector_id: string;
  source_object_type: string;
  source_object_id: string;
  canonical_entity: string;
  occurred_at: string;
  amount_minor: number | null;
  currency_code: string | null;
  content_hash: string;
  raw_response_id: string;
  normalized_payload: Record<string, unknown>;
}

@Injectable()
export class PollingRepository {
  private readonly rawResponses = new Map<string, RawIntegrationResponseEntity>();
  private readonly dedupeIndex = new Map<string, string>();
  private readonly scheduleSlots = new Set<string>();
  private readonly checkpoints = new Map<string, PollCheckpoint>();
  private readonly normalizedRecords = new Map<string, NormalizedIntegrationRecord>();

  insertRawResponse(record: RawIntegrationResponseEntity): { inserted: boolean; record: RawIntegrationResponseEntity } {
    const dedupeKey = this.toDedupeKey(record.tenant_id, record.connector_id, record.source_object_id, record.content_hash);
    const existingId = this.dedupeIndex.get(dedupeKey);
    if (existingId) {
      return { inserted: false, record: this.clone(this.rawResponses.get(existingId)!) };
    }

    this.rawResponses.set(record.id, this.deepFreeze(this.clone(record)));
    this.dedupeIndex.set(dedupeKey, record.id);
    return { inserted: true, record: this.clone(record) };
  }

  upsertNormalizedRecord(record: NormalizedIntegrationRecord): NormalizedIntegrationRecord {
    this.normalizedRecords.set(record.raw_response_id, this.deepFreeze(this.clone(record)));
    return this.clone(record);
  }

  listRawResponses(tenantId: string, connectorId?: string): RawIntegrationResponseEntity[] {
    return [...this.rawResponses.values()]
      .filter((record) => record.tenant_id === tenantId)
      .filter((record) => !connectorId || record.connector_id === connectorId)
      .sort((a, b) => a.pulled_at.localeCompare(b.pulled_at))
      .map((record) => this.clone(record));
  }

  listNormalizedRecords(tenantId: string, connectorId?: string): NormalizedIntegrationRecord[] {
    return [...this.normalizedRecords.values()]
      .filter((record) => record.tenant_id === tenantId)
      .filter((record) => !connectorId || record.connector_id === connectorId)
      .sort((a, b) => a.occurred_at.localeCompare(b.occurred_at))
      .map((record) => this.clone(record));
  }

  markScheduleSlot(tenantId: string, connectorId: string, slotIso: string): boolean {
    const key = `${tenantId}::${connectorId}::${slotIso}`;
    if (this.scheduleSlots.has(key)) {
      return false;
    }

    this.scheduleSlots.add(key);
    return true;
  }

  getCheckpoint(tenantId: string, connectorId: string): PollCheckpoint | null {
    return this.clone(this.checkpoints.get(this.toCheckpointKey(tenantId, connectorId)) ?? null);
  }

  upsertCheckpoint(checkpoint: PollCheckpoint): PollCheckpoint {
    const key = this.toCheckpointKey(checkpoint.tenant_id, checkpoint.connector_id);
    this.checkpoints.set(key, this.deepFreeze(this.clone(checkpoint)));
    return this.clone(checkpoint);
  }

  private toDedupeKey(tenantId: string, connectorId: string, sourceObjectId: string, contentHash: string): string {
    return `${tenantId}::${connectorId}::${sourceObjectId}::${contentHash}`;
  }

  private toCheckpointKey(tenantId: string, connectorId: string): string {
    return `${tenantId}::${connectorId}`;
  }

  private clone<T>(value: T): T {
    return JSON.parse(JSON.stringify(value)) as T;
  }

  private deepFreeze<T>(value: T): T {
    if (value && typeof value === 'object' && !Object.isFrozen(value)) {
      Object.freeze(value);
      for (const nested of Object.values(value as Record<string, unknown>)) {
        this.deepFreeze(nested);
      }
    }

    return value;
  }
}
