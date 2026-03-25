const test = require('node:test');
const assert = require('node:assert/strict');
const { createHmac } = require('crypto');
const { WebhooksRepository } = require('../.tmp-test-dist/modules/webhooks/webhooks.repository');
const { WebhooksService } = require('../.tmp-test-dist/modules/webhooks/webhooks.service');

function sign(secret, timestamp, payloadRaw) {
  return createHmac('sha256', secret).update(`${timestamp}.${payloadRaw}`, 'utf8').digest('hex');
}

test('stores webhook payload when signature is valid and does not trigger side effects', () => {
  process.env.WEBHOOK_SECRET = 'test-secret';
  const repository = new WebhooksRepository();
  const service = new WebhooksService(repository);
  const payloadRaw = JSON.stringify({ event: 'invoice.paid', invoice_id: 'inv_1' });
  const timestamp = '1740000000';
  const signature = sign('test-secret', timestamp, payloadRaw);

  const result = service.ingest({
    provider: 'stripe',
    delivery_id: 'wh_1',
    payload_raw: payloadRaw,
    signature,
    timestamp
  });

  assert.equal(result.status, 'stored');
  assert.equal(result.ingestion.delivery_id, 'wh_1');
  assert.equal(result.ingestion.provider, 'stripe');
  assert.equal(result.ingestion.payload_raw, payloadRaw);
  assert.equal(repository.list().length, 1);
});

test('rejects invalid webhook signature and does not store payload', () => {
  process.env.WEBHOOK_SECRET = 'test-secret';
  const repository = new WebhooksRepository();
  const service = new WebhooksService(repository);
  const payloadRaw = JSON.stringify({ event: 'invoice.paid', invoice_id: 'inv_1' });

  assert.throws(() => service.ingest({
    provider: 'stripe',
    delivery_id: 'wh_bad',
    payload_raw: payloadRaw,
    signature: 'sha256=deadbeefdeadbeefdeadbeefdeadbeefdeadbeefdeadbeefdeadbeefdeadbeef',
    timestamp: '1740000000'
  }), /invalid webhook signature/);

  assert.equal(repository.list().length, 0);
});

test('deduplicates duplicate webhook deliveries and preserves single stored raw payload', () => {
  process.env.WEBHOOK_SECRET = 'test-secret';
  const repository = new WebhooksRepository();
  const service = new WebhooksService(repository);
  const payloadRaw = JSON.stringify({ event: 'invoice.paid', invoice_id: 'inv_2' });
  const timestamp = '1740000001';
  const signature = sign('test-secret', timestamp, payloadRaw);

  const first = service.ingest({
    provider: 'stripe',
    delivery_id: 'wh_dup',
    payload_raw: payloadRaw,
    signature,
    timestamp
  });

  const duplicate = service.ingest({
    provider: 'stripe',
    delivery_id: 'wh_dup',
    payload_raw: payloadRaw,
    signature,
    timestamp
  });

  assert.equal(first.status, 'stored');
  assert.equal(duplicate.status, 'duplicate');
  assert.equal(duplicate.ingestion.id, first.ingestion.id);
  assert.equal(repository.list().length, 1);
});
