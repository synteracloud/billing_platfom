const test = require('node:test');
const assert = require('node:assert/strict');
const { LedgerService } = require('../.tmp-test-dist/modules/ledger/ledger.service');
const { LedgerRepository } = require('../.tmp-test-dist/modules/ledger/ledger.repository');
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
  const eventsService = new EventsService(eventsRepository, eventConsumerIdempotencyService);
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
