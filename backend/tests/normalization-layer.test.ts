import assert from 'assert';
import { BadRequestException } from '@nestjs/common';
import { normalizeExternalToCanonicalBatch0, ExternalIntegrationRecord } from '../src/modules/events/normalization/normalization-layer';

function baseRecord(overrides: Partial<ExternalIntegrationRecord> = {}): ExternalIntegrationRecord {
  return {
    tenant_id: 'tenant-001',
    connector_id: 'connector-001',
    source_provider: 'Stripe',
    source_object_id: 'source-001',
    occurred_at: '2026-03-01T10:00:00.000Z',
    ingested_at: '2026-03-01T10:01:00.000Z',
    currency_code: 'usd',
    amount_minor: 1250,
    direction: 'credit',
    content_hash: 'abc123',
    raw_ref: 's3://bucket/raw/stripe/001.json',
    payload_version: 'v1',
    ...overrides
  };
}

async function main() {
  const stripe = normalizeExternalToCanonicalBatch0(baseRecord());
  assert.equal(stripe.canonical_entity, 'Payment');
  assert.equal(stripe.currency_code, 'USD');

  const bank = normalizeExternalToCanonicalBatch0(baseRecord({
    source_provider: ' Bank ',
    source_object_id: 'bank-txn-001',
    direction: 'debit'
  }));
  assert.equal(bank.canonical_entity, 'BankTransaction');
  assert.equal(bank.direction, 'debit');

  const shopify = normalizeExternalToCanonicalBatch0(baseRecord({
    source_provider: 'shopify',
    source_object_id: 'invoice-1001'
  }));
  assert.equal(shopify.canonical_entity, 'Invoice');

  assert.throws(
    () => normalizeExternalToCanonicalBatch0(baseRecord({ source_provider: 'PayPal' })),
    (error: unknown) => error instanceof BadRequestException
  );

  assert.throws(
    () => normalizeExternalToCanonicalBatch0(baseRecord({ source_object_id: '   ' })),
    (error: unknown) => error instanceof BadRequestException
  );

  assert.throws(
    () => normalizeExternalToCanonicalBatch0(baseRecord({ direction: 'sideways' as never })),
    (error: unknown) => error instanceof BadRequestException
  );

  console.log('normalization layer mapping test passed');
}

main().catch((error) => {
  console.error(error);
  process.exitCode = 1;
});
