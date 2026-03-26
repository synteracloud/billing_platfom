const test = require('node:test');
const assert = require('node:assert/strict');

const { createDomainEvent } = require('../.tmp-test-dist/modules/events/entities/event.entity');
const { EventsRepository } = require('../.tmp-test-dist/modules/events/events.repository');
const { LedgerRepository } = require('../.tmp-test-dist/modules/ledger/ledger.repository');
const { ArRepository } = require('../.tmp-test-dist/modules/ar/ar.repository');
const { ApRepository } = require('../.tmp-test-dist/modules/ap/ap.repository');
const { AnalyticsService } = require('../.tmp-test-dist/modules/analytics/analytics.service');
const { ReplayRebuildToolingService } = require('../.tmp-test-dist/modules/events/replay-rebuild.tooling.service');

function buildFixture() {
  const tenantId = 'tenant-replay';
  const eventsRepository = new EventsRepository();
  const ledgerRepository = new LedgerRepository();
  const arRepository = new ArRepository();
  const apRepository = new ApRepository();
  const analyticsService = new AnalyticsService(ledgerRepository, arRepository, apRepository);
  const tooling = new ReplayRebuildToolingService(eventsRepository, ledgerRepository, arRepository, apRepository, analyticsService);

  const emitted = [];
  function emit(type, aggregateType, aggregateId, payload, occurredAt, recordedAt) {
    const event = createDomainEvent({
      tenant_id: tenantId,
      type,
      aggregate_type: aggregateType,
      aggregate_id: aggregateId,
      aggregate_version: 1,
      payload,
      occurred_at: occurredAt,
      idempotency_key: `${type}:${aggregateId}:${occurredAt}`
    });

    event.recorded_at = recordedAt;
    event.created_at = recordedAt;
    event.updated_at = recordedAt;
    eventsRepository.create(event);
    emitted.push(event);
    return event;
  }

  function postLedgerForEvent(event, amountMinor, lines) {
    ledgerRepository.create(
      {
        id: `je-${event.id}`,
        tenant_id: tenantId,
        source_type: event.aggregate_type,
        source_id: event.aggregate_id,
        source_event_id: event.id,
        event_name: event.type,
        rule_version: '1',
        entry_date: event.occurred_at.slice(0, 10),
        currency_code: 'USD',
        description: event.type,
        created_at: event.recorded_at
      },
      lines.map((line, index) => ({
        id: `jl-${event.id}-${index + 1}`,
        tenant_id: tenantId,
        journal_entry_id: `je-${event.id}`,
        line_number: index + 1,
        account_code: line.account_code,
        account_name: line.account_name,
        direction: line.direction,
        amount_minor: line.amount_minor ?? amountMinor,
        currency_code: 'USD',
        created_at: event.recorded_at
      }))
    );
  }

  const invoiceCreated = emit(
    'billing.invoice.created.v1',
    'invoice',
    'inv-1',
    { invoice_id: 'inv-1', customer_id: 'cust-1', invoice_number: 'INV-1', status: 'issued', total_minor: 10000, currency_code: 'USD' },
    '2026-03-01T09:00:00.000Z',
    '2026-03-01T09:00:01.000Z'
  );

  const invoiceIssued = emit(
    'billing.invoice.issued.v1',
    'invoice',
    'inv-1',
    { invoice_id: 'inv-1', customer_id: 'cust-1', issue_date: '2026-03-01', due_date: '2026-03-10', total_minor: 10000, currency_code: 'USD' },
    '2026-03-01T09:00:00.000Z',
    '2026-03-01T09:00:05.000Z'
  );

  const billCreated = emit(
    'billing.bill.created.v1',
    'bill',
    'bill-1',
    { bill_id: 'bill-1', vendor_id: 'ven-1', created_at: '2026-03-02', due_date: '2026-03-12', total_minor: 4000, currency_code: 'USD', expense_classification: 'operating' },
    '2026-03-02T11:00:00.000Z',
    '2026-03-02T11:00:00.000Z'
  );

  const billPaid = emit(
    'billing.bill.paid.v1',
    'bill',
    'bill-1',
    { bill_id: 'bill-1', paid_at: '2026-03-06', amount_paid_minor: 1500, currency_code: 'USD' },
    '2026-03-06T11:00:00.000Z',
    '2026-03-06T11:00:00.000Z'
  );

  const paymentRecorded = emit(
    'billing.payment.recorded.v1',
    'payment',
    'pay-1',
    { payment_id: 'pay-1', customer_id: 'cust-1', amount_minor: 3000, currency_code: 'USD', status: 'recorded' },
    '2026-03-03T09:00:00.000Z',
    '2026-03-03T09:00:00.000Z'
  );

  const paymentAllocated = emit(
    'billing.payment.allocated.v1',
    'payment',
    'pay-1',
    { payment_id: 'pay-1', customer_id: 'cust-1', amount_minor: 3000, allocation_count: 1, total_allocated_minor: 3000, currency_code: 'USD', allocation_changes: [{ invoice_id: 'inv-1', allocated_delta_minor: 3000 }] },
    '2026-03-03T09:30:00.000Z',
    '2026-03-03T09:30:00.000Z'
  );

  arRepository.upsertInvoice(tenantId, {
    invoice_id: 'inv-1',
    customer_id: 'cust-1',
    currency_code: 'USD',
    issue_date: '2026-03-01',
    due_date: '2026-03-10',
    total_minor: 10000,
    open_amount_minor: 7000,
    paid_amount_minor: 3000,
    status: 'open',
    updated_at: '2026-03-03T09:30:00.000Z'
  });

  apRepository.markEventApplied(tenantId, 'bill-approved', billCreated.id);
  apRepository.markEventApplied(tenantId, 'bill-paid', billPaid.id);
  apRepository.upsertBill(tenantId, {
    bill_id: 'bill-1',
    vendor_id: 'ven-1',
    currency_code: 'USD',
    approved_at: '2026-03-02',
    due_date: '2026-03-12',
    total_minor: 4000,
    open_amount_minor: 2500,
    paid_amount_minor: 1500,
    status: 'open',
    updated_at: '2026-03-06T11:00:00.000Z'
  });

  postLedgerForEvent(invoiceCreated, 10000, [
    { account_code: '1100', account_name: 'Accounts Receivable', direction: 'debit' },
    { account_code: '4000', account_name: 'Revenue', direction: 'credit' }
  ]);
  postLedgerForEvent(paymentRecorded, 3000, [
    { account_code: '1000', account_name: 'Cash', direction: 'debit' },
    { account_code: '1100', account_name: 'Accounts Receivable', direction: 'credit' }
  ]);
  postLedgerForEvent(billCreated, 4000, [
    { account_code: '5000', account_name: 'Expense', direction: 'debit' },
    { account_code: '2000', account_name: 'Accounts Payable', direction: 'credit' }
  ]);

  return { tenantId, emitted, tooling, eventsRepository };
}

test('rebuild tooling replays streams deterministically and verifies consistency', () => {
  const fixture = buildFixture();
  const first = fixture.tooling.rebuildAndVerifyConsistency(fixture.tenantId);
  const second = fixture.tooling.rebuildAndVerifyConsistency(fixture.tenantId);

  assert.equal(first.passed, true);
  assert.deepEqual(second, first, 'rerun must be idempotent');
  const replayedTypes = first.rebuilt.replayed_event_ids.map((id) => fixture.eventsRepository.findById(fixture.tenantId, id).type);
  assert.deepEqual(replayedTypes, [
    'billing.invoice.created.v1',
    'billing.invoice.issued.v1',
    'billing.bill.created.v1',
    'billing.payment.recorded.v1',
    'billing.payment.allocated.v1',
    'billing.bill.paid.v1'
  ]);
  assert.equal(first.rebuilt.analytics.inflow_total_minor, first.live.analytics_inflow_total_minor);
  assert.equal(first.rebuilt.analytics.outflow_total_minor, first.live.analytics_outflow_total_minor);
  assert.equal(first.rebuilt.analytics.cashflow_net_minor, first.live.analytics_cashflow_net_minor);
});

test('wipe-and-rebuild and missed-event recovery are safe and drift-free', () => {
  const fixture = buildFixture();
  const ordered = fixture.tooling.replayProjectionStreams(fixture.tenantId);

  const missedEventId = ordered.replayed_event_ids.find((id) => {
    const event = fixture.eventsRepository.findById(fixture.tenantId, id);
    return event && event.type === 'billing.payment.allocated.v1';
  });
  assert.ok(missedEventId, 'test setup should produce payment allocation event');

  const recovery = fixture.tooling.simulateMissedEventRecovery(fixture.tenantId, missedEventId);

  assert.equal(recovery.drift_detected, true, 'missing event should create drift');
  assert.equal(recovery.recovered, true, 'full replay should recover drift');

  const comparison = fixture.tooling.rebuildAndVerifyConsistency(fixture.tenantId);
  assert.equal(comparison.passed, true, `expected no projection drift, got ${comparison.diffs.join('; ')}`);
});
