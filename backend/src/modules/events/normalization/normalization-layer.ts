import { BadRequestException } from '@nestjs/common';

export type CanonicalEntityBatch0 = 'Payment' | 'BankTransaction' | 'Invoice';
export type CanonicalDirection = 'debit' | 'credit';

export interface ExternalIntegrationRecord {
  tenant_id: string;
  connector_id: string;
  source_provider: string;
  source_object_id: string;
  occurred_at: string;
  ingested_at: string;
  currency_code: string;
  amount_minor: number;
  direction: CanonicalDirection;
  content_hash: string;
  raw_ref: string;
  payload_version: string;
}

export interface CanonicalNormalizedRecordBatch0 {
  tenant_id: string;
  connector_id: string;
  source_object_type: string;
  source_object_id: string;
  canonical_entity: CanonicalEntityBatch0;
  occurred_at: string;
  ingested_at: string;
  currency_code: string;
  amount_minor: number;
  direction: CanonicalDirection;
  content_hash: string;
  raw_ref: string;
  payload_version: string;
}

const PROVIDER_TO_CANONICAL_ENTITY: Record<string, CanonicalEntityBatch0> = {
  stripe: 'Payment',
  bank: 'BankTransaction',
  shopify: 'Invoice'
};

function requireNonEmptyString(value: unknown, fieldName: string): string {
  if (typeof value !== 'string') {
    throw new BadRequestException(`${fieldName} must be a string`);
  }

  const normalized = value.trim();
  if (!normalized) {
    throw new BadRequestException(`${fieldName} must be provided`);
  }

  return normalized;
}

function requireInteger(value: unknown, fieldName: string): number {
  if (typeof value !== 'number' || !Number.isInteger(value)) {
    throw new BadRequestException(`${fieldName} must be an integer`);
  }

  return value;
}

function requireDirection(value: unknown): CanonicalDirection {
  const normalized = requireNonEmptyString(value, 'direction').toLowerCase();
  if (normalized !== 'debit' && normalized !== 'credit') {
    throw new BadRequestException('direction must be either debit or credit');
  }

  return normalized;
}

function resolveCanonicalEntity(sourceProvider: string): CanonicalEntityBatch0 {
  const providerKey = sourceProvider.trim().toLowerCase();
  const canonicalEntity = PROVIDER_TO_CANONICAL_ENTITY[providerKey];

  if (!canonicalEntity) {
    throw new BadRequestException(`unsupported source provider: ${sourceProvider}`);
  }

  return canonicalEntity;
}

export function normalizeExternalToCanonicalBatch0(
  record: ExternalIntegrationRecord
): CanonicalNormalizedRecordBatch0 {
  const tenantId = requireNonEmptyString(record.tenant_id, 'tenant_id');
  const connectorId = requireNonEmptyString(record.connector_id, 'connector_id');
  const sourceProvider = requireNonEmptyString(record.source_provider, 'source_provider');
  const sourceObjectId = requireNonEmptyString(record.source_object_id, 'source_object_id');
  const occurredAt = requireNonEmptyString(record.occurred_at, 'occurred_at');
  const ingestedAt = requireNonEmptyString(record.ingested_at, 'ingested_at');
  const currencyCode = requireNonEmptyString(record.currency_code, 'currency_code').toUpperCase();
  const amountMinor = requireInteger(record.amount_minor, 'amount_minor');
  const direction = requireDirection(record.direction);
  const contentHash = requireNonEmptyString(record.content_hash, 'content_hash');
  const rawRef = requireNonEmptyString(record.raw_ref, 'raw_ref');
  const payloadVersion = requireNonEmptyString(record.payload_version, 'payload_version');

  const canonicalEntity = resolveCanonicalEntity(sourceProvider);

  return {
    tenant_id: tenantId,
    connector_id: connectorId,
    source_object_type: sourceProvider,
    source_object_id: sourceObjectId,
    canonical_entity: canonicalEntity,
    occurred_at: occurredAt,
    ingested_at: ingestedAt,
    currency_code: currencyCode,
    amount_minor: amountMinor,
    direction,
    content_hash: contentHash,
    raw_ref: rawRef,
    payload_version: payloadVersion
  };
}
