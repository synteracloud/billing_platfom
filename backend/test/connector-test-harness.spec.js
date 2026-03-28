const test = require('node:test');
const assert = require('node:assert/strict');
const { createHmac } = require('crypto');

const { ConnectorTestHarness } = require('../.tmp-test-dist/modules/integrations/testing/connector-test-harness');

function sign(secret, timestamp, payloadRaw) {
  return createHmac('sha256', secret).update(`${timestamp}.${payloadRaw}`, 'utf8').digest('hex');
}

function stripePollingResponse() {
  return {
    records: [
      {
        source_object_type: 'charge',
        source_object_id: 'ch_1',
        occurred_at: '2026-03-26T10:00:00.000Z',
        raw_payload: { id: 'ch_1', object: 'charge', amount: 5000, currency: 'usd' },
        amount_minor: 5000,
        currency_code: 'usd'
      },
      {
        source_object_type: 'invoice',
        source_object_id: 'in_1',
        occurred_at: '2026-03-26T10:01:00.000Z',
        raw_payload: { id: 'in_1', object: 'invoice', total: 5000, currency: 'usd' },
        amount_minor: 5000,
        currency_code: 'USD'
      }
    ],
    next_cursor: 'cursor-2'
  };
}

test('connectors are testable independently in isolated harness instances', () => {
  const harnessA = ConnectorTestHarness.createIsolated();
  const harnessB = ConnectorTestHarness.createIsolated();

  const [stripeSummary] = harnessA.simulatePolling({
    tenant_id: 'tenant-a',
    connector_id: 'stripe',
    pulls: [
      {
        pulled_at: '2026-03-26T11:00:00.000Z',
        response: stripePollingResponse()
      }
    ]
  });

  const [bankSummary] = harnessB.simulatePolling({
    tenant_id: 'tenant-b',
    connector_id: 'bank-feed',
    pulls: [
      {
        pulled_at: '2026-03-26T11:00:00.000Z',
        response: {
          records: [
            {
              source_object_type: 'transaction',
              source_object_id: 'txn_1',
              occurred_at: '2026-03-26T11:00:00.000Z',
              raw_payload: { id: 'txn_1', object: 'transaction', amount: 7100, currency: 'usd' },
              amount_minor: 7100,
              currency_code: 'USD'
            }
          ]
        }
      }
    ]
  });

  assert.equal(stripeSummary.ingested_count, 2);
  assert.equal(bankSummary.ingested_count, 1);
  assert.equal(harnessA.snapshot('tenant-a').raw_responses_count, 2);
  assert.equal(harnessB.snapshot('tenant-b').raw_responses_count, 1);
  assert.equal(harnessA.snapshot('tenant-b').raw_responses_count, 0);
});

test('replays real webhook payloads safely with deduplication and no outbound side effects', () => {
  process.env.WEBHOOK_SECRET = 'test-secret';

  const harness = ConnectorTestHarness.createIsolated();
  const timestamp = '1740000002';
  const realStripePayload = JSON.stringify({
    id: 'evt_1N8xJ2LkdIwHu7ix12345678',
    object: 'event',
    api_version: '2025-09-30',
    type: 'invoice.paid',
    data: {
      object: {
        id: 'in_1',
        object: 'invoice',
        customer: 'cus_123',
        amount_paid: 5000,
        currency: 'usd',
        status: 'paid'
      }
    }
  });
  const signature = sign('test-secret', timestamp, realStripePayload);

  const results = harness.replayWebhookPayloads({
    provider: 'stripe',
    deliveries: [
      {
        delivery_id: 'wh_real_1',
        payload_raw: realStripePayload,
        signature,
        timestamp
      },
      {
        delivery_id: 'wh_real_1',
        payload_raw: realStripePayload,
        signature,
        timestamp
      }
    ]
  });

  assert.equal(results[0].status, 'stored');
  assert.equal(results[1].status, 'duplicate');
  assert.equal(results[0].ingestion.payload_raw, realStripePayload);
  assert.equal(harness.snapshot('tenant-webhooks').webhooks_count, 1);
});

test('simulates polling and validates canonical normalization output with zero mutation outside test harness', () => {
  const harness = ConnectorTestHarness.createIsolated();

  harness.simulatePolling({
    tenant_id: 'tenant-c',
    connector_id: 'stripe',
    pulls: [
      {
        pulled_at: '2026-03-26T12:00:00.000Z',
        response: stripePollingResponse()
      }
    ]
  });

  const validation = harness.validateNormalization({
    tenant_id: 'tenant-c',
    connector_id: 'stripe',
    expected_canonical_entities: ['payment', 'invoice']
  });

  assert.equal(validation.valid, true);
  assert.equal(validation.normalized_count, 2);

  const snapshot = harness.snapshot('tenant-c', 'stripe');
  assert.equal(snapshot.raw_responses_count, 2);
  assert.equal(snapshot.normalized_records_count, 2);
  assert.equal(snapshot.normalized_event_count, 2);
});
