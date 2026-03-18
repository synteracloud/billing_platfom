const test = require('node:test');
const assert = require('node:assert/strict');
const { LedgerService } = require('../.tmp-test-dist/modules/ledger/ledger.service');
const { LedgerRepository } = require('../.tmp-test-dist/modules/ledger/ledger.repository');
const { EventBusService } = require('../.tmp-test-dist/modules/events/event-bus.service');
const { EventsService } = require('../.tmp-test-dist/modules/events/events.service');
const { EventsRepository } = require('../.tmp-test-dist/modules/events/events.repository');
const { EventConsumerIdempotencyService } = require('../.tmp-test-dist/modules/idempotency/event-consumer-idempotency.service');
const { IdempotencyRepository } = require('../.tmp-test-dist/modules/idempotency/idempotency.repository');
const { IdempotencyService } = require('../.tmp-test-dist/modules/idempotency/idempotency.service');
const { FinancialTransactionManager } = require('../.tmp-test-dist/common/transactions/financial-transaction.manager');

function createLedgerService() {
  const ledgerRepository = new LedgerRepository();
  const eventsRepository = new EventsRepository();
  const idempotencyRepository = new IdempotencyRepository();
  const idempotencyService = new IdempotencyService(idempotencyRepository);
  const eventConsumerIdempotencyService = new EventConsumerIdempotencyService(idempotencyService);
  const eventBusService = new EventBusService(eventsRepository, eventConsumerIdempotencyService);
  const eventsService = new EventsService(eventsRepository, eventConsumerIdempotencyService, eventBusService);
  const transactionManager = new FinancialTransactionManager();

  return {
    ledgerService: new LedgerService(ledgerRepository, eventsService, transactionManager),
    ledgerRepository,
    eventsRepository
  };
}

test('posts a balanced invoice journal with deterministic idempotent output', async () => {
  const { ledgerService, eventsRepository } = createLedgerService();
  const transaction = {
    tenant_id: 'tenant-1',
    source_type: 'invoice',
    source_id: 'invoice-1',
    source_event_id: 'event-invoice-1',
    event_name: 'billing.invoice.issued.v1',
    rule_version: '2025-01-01',
    entry_date: '2025-01-15',
    currency_code: 'usd',
    description: 'Invoice issuance',
    entries: [
      { account_code: '1100', account_name: 'Accounts Receivable', direction: 'debit', amount_minor: 1005, currency_code: 'USD' },
      { account_code: '4000', account_name: 'Revenue', direction: 'credit', amount_minor: 1000, currency_code: 'USD' },
      { account_code: '2100', account_name: 'Tax Liability', direction: 'credit', amount_minor: 5, currency_code: 'USD' }
    ]
  };

  const first = await ledgerService.post(transaction);
  const second = await ledgerService.post(transaction);

  assert.equal(first.id, second.id);
  assert.deepEqual(first, second);
  assert.equal(first.lines.length, 3);
  assert.equal(eventsRepository.listByTenant('tenant-1', {}).length, 1);
  assert.throws(() => { first.lines.push({}); }, /read only|object is not extensible|Cannot add property/);
});

test('posts a balanced payment settlement journal', async () => {
  const { ledgerService } = createLedgerService();

  const posted = await ledgerService.post({
    tenant_id: 'tenant-1',
    source_type: 'payment',
    source_id: 'payment-1',
    source_event_id: 'event-payment-1',
    event_name: 'billing.payment.settled.v1',
    rule_version: '2025-01-01',
    entry_date: '2025-01-16',
    currency_code: 'USD',
    entries: [
      { account_code: '1000', account_name: 'Cash/Bank', direction: 'debit', amount_minor: 1005, currency_code: 'USD' },
      { account_code: '1100', account_name: 'Accounts Receivable', direction: 'credit', amount_minor: 1005, currency_code: 'USD' }
    ]
  });

  assert.equal(posted.currency_code, 'USD');
  assert.deepEqual(posted.lines.map((line) => line.line_number), [1, 2]);
});

test('rejects rounding imbalances, zero-value postings, and mixed currencies without partial writes', async () => {
  const { ledgerService, ledgerRepository, eventsRepository } = createLedgerService();

  await assert.rejects(() => ledgerService.post({
    tenant_id: 'tenant-1',
    source_type: 'invoice',
    source_id: 'invoice-2',
    source_event_id: 'event-invoice-2',
    event_name: 'billing.invoice.issued.v1',
    rule_version: '2025-01-01',
    entry_date: '2025-01-17',
    currency_code: 'USD',
    entries: [
      { account_code: '1100', account_name: 'Accounts Receivable', direction: 'debit', amount_minor: 100, currency_code: 'USD' },
      { account_code: '4000', account_name: 'Revenue', direction: 'credit', amount_minor: 99, currency_code: 'USD' }
    ]
  }), /Unbalanced posting/);

  await assert.rejects(() => ledgerService.post({
    tenant_id: 'tenant-1',
    source_type: 'payment',
    source_id: 'payment-2',
    source_event_id: 'event-payment-2',
    event_name: 'billing.payment.settled.v1',
    rule_version: '2025-01-01',
    entry_date: '2025-01-17',
    currency_code: 'USD',
    entries: [
      { account_code: '1000', account_name: 'Cash/Bank', direction: 'debit', amount_minor: 0, currency_code: 'USD' },
      { account_code: '1100', account_name: 'Accounts Receivable', direction: 'credit', amount_minor: 0, currency_code: 'USD' }
    ]
  }), /greater than zero/);

  await assert.rejects(() => ledgerService.post({
    tenant_id: 'tenant-1',
    source_type: 'payment',
    source_id: 'payment-3',
    source_event_id: 'event-payment-3',
    event_name: 'billing.payment.settled.v1',
    rule_version: '2025-01-01',
    entry_date: '2025-01-17',
    currency_code: 'USD',
    entries: [
      { account_code: '1000', account_name: 'Cash/Bank', direction: 'debit', amount_minor: 100, currency_code: 'USD' },
      { account_code: '1100', account_name: 'Accounts Receivable', direction: 'credit', amount_minor: 100, currency_code: 'EUR' }
    ]
  }), /transaction currency_code/);

  assert.equal(ledgerRepository.findBySourceEvent('tenant-1', 'event-invoice-2', '2025-01-01'), undefined);
  assert.equal(eventsRepository.listByTenant('tenant-1', {}).length, 0);
});


test('posts invoice and payment events idempotently and rejects conflicting retry keys', async () => {
  const { ledgerService, eventsRepository } = createLedgerService();

  const invoiceEvent = eventsRepository.create({
    id: 'evt-invoice-1',
    type: 'billing.invoice.issued.v1',
    version: 1,
    tenant_id: 'tenant-1',
    payload: { invoice_id: 'invoice-evt-1', issue_date: '2025-01-18', due_date: '2025-02-18', total_minor: 2500, currency_code: 'USD' },
    occurred_at: '2025-01-18T00:00:00.000Z',
    recorded_at: '2025-01-18T00:00:00.000Z',
    aggregate_type: 'invoice',
    aggregate_id: 'invoice-evt-1',
    aggregate_version: 1,
    causation_id: null,
    correlation_id: null,
    idempotency_key: 'invoice-evt-1',
    producer: 'test'
  });

  const paymentEvent = eventsRepository.create({
    id: 'evt-payment-1',
    type: 'billing.payment.settled.v1',
    version: 1,
    tenant_id: 'tenant-1',
    payload: { payment_id: 'payment-evt-1', settled_at: '2025-01-19T00:00:00.000Z', amount_minor: 2500, currency_code: 'USD' },
    occurred_at: '2025-01-19T00:00:00.000Z',
    recorded_at: '2025-01-19T00:00:00.000Z',
    aggregate_type: 'payment',
    aggregate_id: 'payment-evt-1',
    aggregate_version: 1,
    causation_id: null,
    correlation_id: null,
    idempotency_key: 'payment-evt-1',
    producer: 'test'
  });

  const first = await ledgerService.postEvent('tenant-1', invoiceEvent.id, 'retry-1', '2025-01-01');
  const second = await ledgerService.postEvent('tenant-1', invoiceEvent.id, 'retry-1', '2025-01-01');
  const third = await ledgerService.postEvent('tenant-1', invoiceEvent.id, 'retry-2', '2025-01-01');
  const payment = await ledgerService.postEvent('tenant-1', paymentEvent.id, 'retry-3', '2025-01-01');

  assert.equal(first.id, second.id);
  assert.equal(second.id, third.id);
  assert.equal(payment.lines.length, 2);

  await assert.rejects(() => ledgerService.postEvent('tenant-1', paymentEvent.id, 'retry-1', '2025-01-01'), /already bound/);
});

test('blocks postings with unknown accounts or missing required event accounts', async () => {
  const { ledgerService, ledgerRepository, eventsRepository } = createLedgerService();

  await assert.rejects(() => ledgerService.post({
    tenant_id: 'tenant-1',
    source_type: 'invoice',
    source_id: 'invoice-3',
    source_event_id: 'event-invoice-3',
    event_name: 'billing.invoice.issued.v1',
    rule_version: '2025-01-01',
    entry_date: '2025-01-20',
    currency_code: 'USD',
    entries: [
      { account_code: '9999', account_name: 'Mystery', direction: 'debit', amount_minor: 100, currency_code: 'USD' },
      { account_code: '4000', account_name: 'Revenue', direction: 'credit', amount_minor: 100, currency_code: 'USD' }
    ]
  }), /Unknown ledger account_code/);

  await assert.rejects(() => ledgerService.post({
    tenant_id: 'tenant-1',
    source_type: 'invoice',
    source_id: 'invoice-4',
    source_event_id: 'event-invoice-4',
    event_name: 'billing.invoice.issued.v1',
    rule_version: '2025-01-01',
    entry_date: '2025-01-20',
    currency_code: 'USD',
    entries: [
      { account_code: '1000', account_name: 'Cash', direction: 'debit', amount_minor: 100, currency_code: 'USD' },
      { account_code: '4000', account_name: 'Revenue', direction: 'credit', amount_minor: 100, currency_code: 'USD' }
    ]
  }), /required accounts/);

  assert.equal(ledgerRepository.findBySourceEvent('tenant-1', 'event-invoice-3', '2025-01-01'), undefined);
  assert.equal(eventsRepository.listByTenant('tenant-1', {}).length, 0);
});
