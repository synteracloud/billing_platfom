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
  assert.equal(eventsRepository.listByTenant('tenant-1', {}).length, 2);
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

test('posts payment settlement against allocated amount and remains idempotent on retries', async () => {
  const { ledgerService, eventsRepository, ledgerRepository } = createLedgerService();

  const paymentEvent = eventsRepository.create({
    id: 'evt-payment-partial-1',
    type: 'billing.payment.settled.v1',
    version: 1,
    tenant_id: 'tenant-1',
    payload: {
      payment_id: 'payment-partial-1',
      settled_at: '2025-01-19T00:00:00.000Z',
      amount_minor: 2500,
      allocated_minor: 1400,
      allocation_id: 'alloc-1',
      currency_code: 'USD'
    },
    occurred_at: '2025-01-19T00:00:00.000Z',
    recorded_at: '2025-01-19T00:00:00.000Z',
    aggregate_type: 'payment',
    aggregate_id: 'payment-partial-1',
    aggregate_version: 1,
    causation_id: null,
    correlation_id: null,
    idempotency_key: 'payment-partial-1',
    producer: 'test'
  });

  const first = await ledgerService.postEvent('tenant-1', paymentEvent.id, 'partial-retry-1', '2025-01-01');
  const second = await ledgerService.postEvent('tenant-1', paymentEvent.id, 'partial-retry-2', '2025-01-01');

  assert.equal(first.id, second.id, 'retries should resolve to the same journal entry');
  assert.equal(first.source_id, 'payment-partial-1:alloc-1');

  const debitCash = first.lines.find((line) => line.account_code === '1000' && line.direction === 'debit');
  const creditAr = first.lines.find((line) => line.account_code === '1100' && line.direction === 'credit');
  assert.equal(debitCash?.amount_minor, 1400, 'cash should be debited for the allocated amount');
  assert.equal(creditAr?.amount_minor, 1400, 'AR should be reduced by the allocated amount');

  const debitTotal = first.lines.filter((line) => line.direction === 'debit').reduce((sum, line) => sum + line.amount_minor, 0);
  const creditTotal = first.lines.filter((line) => line.direction === 'credit').reduce((sum, line) => sum + line.amount_minor, 0);
  assert.equal(debitTotal, creditTotal, 'journal should remain balanced');

  assert.equal(ledgerRepository.findBySourceEvent('tenant-1', paymentEvent.id, '2025-01-01')?.id, first.id);
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

test('posts bill.created to expense and accounts payable idempotently', async () => {
  const { ledgerService, eventsRepository } = createLedgerService();

  const billCreatedEvent = eventsRepository.create({
    id: 'evt-bill-1',
    type: 'billing.bill.created.v1',
    version: 1,
    tenant_id: 'tenant-1',
    payload: {
      bill_id: 'bill-evt-1',
      created_at: '2025-01-21T00:00:00.000Z',
      total_minor: 3100,
      currency_code: 'USD',
      expense_classification: 'operating'
    },
    occurred_at: '2025-01-21T00:00:00.000Z',
    recorded_at: '2025-01-21T00:00:00.000Z',
    aggregate_type: 'bill',
    aggregate_id: 'bill-evt-1',
    aggregate_version: 1,
    causation_id: null,
    correlation_id: null,
    idempotency_key: 'bill-evt-1',
    producer: 'test'
  });

  const first = await ledgerService.postEvent('tenant-1', billCreatedEvent.id, 'bill-retry-1', '2025-01-01');
  const duplicate = await ledgerService.postEvent('tenant-1', billCreatedEvent.id, 'bill-retry-2', '2025-01-01');

  assert.equal(first.id, duplicate.id);
  assert.equal(first.lines.length, 2);
  assert.deepEqual(
    first.lines.map((line) => [line.account_code, line.direction, line.amount_minor]),
    [
      ['5000', 'debit', 3100],
      ['2000', 'credit', 3100]
    ]
  );
});

test('posts bill.paid to accounts payable and cash idempotently', async () => {
  const { ledgerService, eventsRepository } = createLedgerService();

  const billPaidEvent = eventsRepository.create({
    id: 'evt-bill-paid-1',
    type: 'billing.bill.paid.v1',
    version: 1,
    tenant_id: 'tenant-1',
    payload: {
      bill_id: 'bill-evt-1',
      paid_at: '2025-01-24T00:00:00.000Z',
      amount_paid_minor: 3100,
      currency_code: 'USD'
    },
    occurred_at: '2025-01-24T00:00:00.000Z',
    recorded_at: '2025-01-24T00:00:00.000Z',
    aggregate_type: 'bill',
    aggregate_id: 'bill-evt-1',
    aggregate_version: 2,
    causation_id: null,
    correlation_id: null,
    idempotency_key: 'bill-paid-evt-1',
    producer: 'test'
  });

  const first = await ledgerService.postEvent('tenant-1', billPaidEvent.id, 'bill-paid-retry-1', '2025-01-01');
  const duplicate = await ledgerService.postEvent('tenant-1', billPaidEvent.id, 'bill-paid-retry-2', '2025-01-01');

  assert.equal(first.id, duplicate.id);
  assert.equal(first.lines.length, 2);
  assert.deepEqual(
    first.lines.map((line) => [line.account_code, line.direction, line.amount_minor]),
    [
      ['2000', 'debit', 3100],
      ['1000', 'credit', 3100]
    ]
  );
});

test('posts payment.received (recorded) to cash and unallocated cash idempotently', async () => {
  const { ledgerService, eventsRepository } = createLedgerService();

  const paymentRecordedEvent = eventsRepository.create({
    id: 'evt-payment-recorded-1',
    type: 'billing.payment.recorded.v1',
    version: 1,
    tenant_id: 'tenant-1',
    payload: {
      payment_id: 'payment-recorded-1',
      customer_id: 'customer-1',
      amount_minor: 1800,
      currency_code: 'USD',
      status: 'recorded'
    },
    occurred_at: '2025-01-22T00:00:00.000Z',
    recorded_at: '2025-01-22T00:00:00.000Z',
    aggregate_type: 'payment',
    aggregate_id: 'payment-recorded-1',
    aggregate_version: 1,
    causation_id: null,
    correlation_id: null,
    idempotency_key: 'payment-recorded-1',
    producer: 'test'
  });

  const first = await ledgerService.postEvent('tenant-1', paymentRecordedEvent.id, 'payment-recorded-retry-1', '2025-01-01');
  const retry = await ledgerService.postEvent('tenant-1', paymentRecordedEvent.id, 'payment-recorded-retry-2', '2025-01-01');

  assert.equal(first.id, retry.id);
  assert.deepEqual(
    first.lines.map((line) => [line.account_code, line.direction, line.amount_minor]),
    [
      ['1000', 'debit', 1800],
      ['2200', 'credit', 1800]
    ]
  );
});

const { TaxService } = require('../.tmp-test-dist/modules/tax/tax.service');
const { TaxRepository } = require('../.tmp-test-dist/modules/tax/tax.repository');

test('tax engine computes inclusive and exclusive taxes deterministically', () => {
  const taxService = new TaxService(new TaxRepository());

  const exclusive = taxService.calculateDocumentTaxes({
    tenant_id: 'tenant-tax',
    jurisdiction: 'US-CA',
    currency_code: 'USD',
    effective_at: '2026-03-01',
    lines: [{ amount_minor: 1000, quantity: 1, tax_rate_basis_points: 750, tax_inclusive: false, tax_code: 'CA_STD' }]
  });

  const inclusive = taxService.calculateDocumentTaxes({
    tenant_id: 'tenant-tax',
    jurisdiction: 'US-CA',
    currency_code: 'USD',
    effective_at: '2026-03-01',
    lines: [{ amount_minor: 1075, quantity: 1, tax_rate_basis_points: 750, tax_inclusive: true, tax_code: 'CA_STD' }]
  });

  assert.equal(exclusive.subtotal_minor, 1000);
  assert.equal(exclusive.tax_minor, 75);
  assert.equal(exclusive.total_minor, 1075);
  assert.equal(inclusive.subtotal_minor, 1000);
  assert.equal(inclusive.tax_minor, 75);
  assert.equal(inclusive.total_minor, 1075);
});

test('ledger postings split tax liability for invoice and bill events', async () => {
  const { ledgerService, eventsRepository } = createLedgerService();

  const invoiceEvent = eventsRepository.create({
    id: 'evt-tax-invoice',
    type: 'billing.invoice.issued.v1',
    version: 1,
    tenant_id: 'tenant-tax',
    payload: { invoice_id: 'inv-tax-1', customer_id: 'cust-1', issue_date: '2026-03-15', due_date: null, subtotal_minor: 1000, tax_minor: 75, total_minor: 1075, currency_code: 'USD' },
    occurred_at: '2026-03-15T00:00:00.000Z',
    recorded_at: '2026-03-15T00:00:00.000Z',
    aggregate_type: 'invoice',
    aggregate_id: 'inv-tax-1',
    aggregate_version: 1,
    causation_id: null,
    correlation_id: null,
    idempotency_key: 'evt-tax-invoice',
    producer: 'test'
  });

  const billEvent = eventsRepository.create({
    id: 'evt-tax-bill',
    type: 'billing.bill.created.v1',
    version: 1,
    tenant_id: 'tenant-tax',
    payload: {
      bill_id: 'bill-tax-1',
      vendor_id: 'vendor-1',
      created_at: '2026-03-16T00:00:00.000Z',
      subtotal_minor: 500,
      tax_minor: 25,
      total_minor: 525,
      currency_code: 'USD',
      expense_classification: 'operating'
    },
    occurred_at: '2026-03-16T00:00:00.000Z',
    recorded_at: '2026-03-16T00:00:00.000Z',
    aggregate_type: 'bill',
    aggregate_id: 'bill-tax-1',
    aggregate_version: 1,
    causation_id: null,
    correlation_id: null,
    idempotency_key: 'evt-tax-bill',
    producer: 'test'
  });

  const invoicePosting = await ledgerService.postEvent('tenant-tax', invoiceEvent.id, 'tax-invoice-key', '2026-03-26');
  const billPosting = await ledgerService.postEvent('tenant-tax', billEvent.id, 'tax-bill-key', '2026-03-26');

  const taxCredits = invoicePosting.lines.filter((line) => line.account_code === '2100' && line.direction === 'credit').reduce((sum, line) => sum + line.amount_minor, 0);
  const taxDebits = billPosting.lines.filter((line) => line.account_code === '2100' && line.direction === 'debit').reduce((sum, line) => sum + line.amount_minor, 0);
  assert.equal(taxCredits, 75);
  assert.equal(taxDebits, 25);

  const taxService = new TaxService(new TaxRepository());
  const summary = taxService.buildTaxSummary({
    salesTaxDocuments: [{ jurisdiction: 'US-CA', tax_minor: 75 }],
    purchaseTaxDocuments: [{ jurisdiction: 'US-CA', tax_minor: 25 }],
    ledgerEntries: [invoicePosting, billPosting]
  });

  assert.equal(summary.net_tax_liability_minor, 50);
});
