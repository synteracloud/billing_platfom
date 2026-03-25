import { randomUUID } from 'crypto';

export interface RawIntegrationResponseInput {
  tenant_id: string;
  connector_id: string;
  source_object_type: string;
  source_object_id: string;
  occurred_at: string;
  pulled_at?: string;
  content_hash: string;
  raw_payload: Record<string, unknown>;
}

export interface RawIntegrationResponseEntity {
  id: string;
  tenant_id: string;
  connector_id: string;
  source_object_type: string;
  source_object_id: string;
  occurred_at: string;
  pulled_at: string;
  content_hash: string;
  raw_payload: Record<string, unknown>;
}

export function createRawIntegrationResponse(input: RawIntegrationResponseInput): RawIntegrationResponseEntity {
  return {
    id: randomUUID(),
    tenant_id: input.tenant_id,
    connector_id: input.connector_id,
    source_object_type: input.source_object_type,
    source_object_id: input.source_object_id,
    occurred_at: input.occurred_at,
    pulled_at: input.pulled_at ?? new Date().toISOString(),
    content_hash: input.content_hash,
    raw_payload: input.raw_payload
  };
}
