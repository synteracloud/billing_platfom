const test = require('node:test');
const assert = require('node:assert/strict');

const { FinancialTransactionManager } = require('../.tmp-test-dist/common/transactions/financial-transaction.manager');
const { IdempotencyRepository } = require('../.tmp-test-dist/modules/idempotency/idempotency.repository');
const { IdempotencyService } = require('../.tmp-test-dist/modules/idempotency/idempotency.service');
const { EventConsumerIdempotencyService } = require('../.tmp-test-dist/modules/idempotency/event-consumer-idempotency.service');
const { EventsRepository } = require('../.tmp-test-dist/modules/events/events.repository');
const { EventsService } = require('../.tmp-test-dist/modules/events/events.service');
const { EventQueuePublisher } = require('../.tmp-test-dist/modules/events/queue/event-queue.publisher');
const { InMemoryQueueDriver } = require('../.tmp-test-dist/modules/events/queue/in-memory-queue.driver');
const { EventProcessingRegistry } = require('../.tmp-test-dist/modules/events/queue/event-processing.registry');
const { EventProcessingWorker } = require('../.tmp-test-dist/modules/events/queue/event-processing.worker');
const { LedgerRepository } = require('../.tmp-test-dist/modules/ledger/ledger.repository');
const { LedgerService } = require('../.tmp-test-dist/modules/ledger/ledger.service');
const { AccountingPeriodRepository } = require('../.tmp-test-dist/modules/ledger/accounting-period.repository');
const { LedgerInvoiceCreatedConsumer } = require('../.tmp-test-dist/modules/ledger/ledger-invoice-created.consumer');
const { PaymentReceivedLedgerConsumer } = require('../.tmp-test-dist/modules/ledger/payment-received-ledger.consumer');
const { ReconciliationRepository } = require('../.tmp-test-dist/modules/reconciliation/reconciliation.repository');
const { ReconciliationService } = require('../.tmp-test-dist/modules/reconciliation/reconciliation.service');

const wait = (ms) => new Promise((resolve) => setTimeout(resolve, ms));

function createFixture() {
  const queueDriver = new InMemoryQueueDriver();
  const processingRegistry = new EventProcessingRegistry();
  const idempotencyService = new IdempotencyService(new IdempotencyRepository());
  const eventConsumerIdempotencyService = new EventConsumerIdempotencyService(idempotencyService);

  const eventsService = new EventsService(
    new EventsRepository(),
    eventConsumerIdempotencyService,
    new EventQueuePublisher(queueDriver),
    new FinancialTransactionManager()
  );

  const ledgerRepository = new LedgerRepository();
  const ledgerService = new LedgerService(
    ledgerRepository,
    eventsService,
    new FinancialTransactionManager(),
    new AccountingPeriodRepository()
  );

  new LedgerInvoiceCreatedConsumer(processingRegistry, ledgerService).onApplicationBootstrap();
  new PaymentReceivedLedgerConsumer(processingRegistry, ledgerService).onApplicationBootstrap();

  const reconciliationService = new ReconciliationService(new ReconciliationRepository(), ledgerRepository);
  const worker = new EventProcessingWorker(queueDriver, processingRegistry, eventConsumerIdempotencyService);

  return {
    queueDriver,
    processingRegistry,
    eventsService,
    ledgerRepository,
    ledgerService,
    worker,
    reconciliationService
  };
}

async function waitFor(condition, timeoutMs = 6000, intervalMs = 20) {
  const started = Date.now();
  while (!condition()) {
    if (Date.now() - started > timeoutMs) {
      throw new Error(`Timed out after ${timeoutMs}ms while waiting for condition`);
    }
    await wait(intervalMs);
  }
}

function seedLedgerForPerformance(ledgerRepository, tenantId, invoices, payments) {
  const createdAtBase = Date.parse('2026-03-01T00:00:00.000Z');

  for (let i = 0; i < invoices; i += 1) {
    const entryId = `je-invoice-${i}`;
    const total = 10_000 + i;
    ledgerRepository.create(
      {
        id: entryId,
        tenant_id: tenantId,
        source_type: 'invoice',
        source_id: `inv-${i}`,
        source_event_id: `evt-invoice-${i}`,
        event_name: 'billing.invoice.created.v1',
        rule_version: '1',
        entry_date: `2026-03-${String((i % 27) + 1).padStart(2, '0')}`,
        currency_code: 'USD',
        description: `Invoice ${i}`,
        metadata: null,
        created_at: new Date(createdAtBase + (i * 1000)).toISOString()
      },
      [
        {
          id: `jl-invoice-${i}-1`,
          tenant_id: tenantId,
          journal_entry_id: entryId,
          line_number: 1,
          account_code: '1100',
          account_name: 'Accounts Receivable',
          direction: 'debit',
          amount_minor: total,
          currency_code: 'USD',
          created_at: new Date(createdAtBase + (i * 1000)).toISOString()
        },
        {
          id: `jl-invoice-${i}-2`,
          tenant_id: tenantId,
          journal_entry_id: entryId,
          line_number: 2,
          account_code: '4000',
          account_name: 'Revenue',
          direction: 'credit',
          amount_minor: total,
          currency_code: 'USD',
          created_at: new Date(createdAtBase + (i * 1000)).toISOString()
        }
      ]
    );
  }

  for (let i = 0; i < payments; i += 1) {
    const entryId = `je-payment-${i}`;
    const total = 7_000 + i;
    ledgerRepository.create(
      {
        id: entryId,
        tenant_id: tenantId,
        source_type: 'payment',
        source_id: `pay-${i}`,
        source_event_id: `evt-payment-${i}`,
        event_name: 'billing.payment.recorded.v1',
        rule_version: '1',
        entry_date: `2026-03-${String((i % 27) + 1).padStart(2, '0')}`,
        currency_code: 'USD',
        description: `Payment ${i}`,
        metadata: null,
        created_at: new Date(createdAtBase + ((invoices + i) * 1000)).toISOString()
      },
      [
        {
          id: `jl-payment-${i}-1`,
          tenant_id: tenantId,
          journal_entry_id: entryId,
          line_number: 1,
          account_code: '1000',
          account_name: 'Cash',
          direction: 'debit',
          amount_minor: total,
          currency_code: 'USD',
          created_at: new Date(createdAtBase + ((invoices + i) * 1000)).toISOString()
        },
        {
          id: `jl-payment-${i}-2`,
          tenant_id: tenantId,
          journal_entry_id: entryId,
          line_number: 2,
          account_code: '2200',
          account_name: 'Unallocated Cash',
          direction: 'credit',
          amount_minor: total,
          currency_code: 'USD',
          created_at: new Date(createdAtBase + ((invoices + i) * 1000)).toISOString()
        }
      ]
    );
  }
}

test('FINAL QC 3: performance + resilience + chaos scenarios keep financial state correct', async () => {
  const fixture = createFixture();

  const tenantId = 'tenant-final-qc3';
  const invoiceCount = 1000;
  const paymentCount = 1000;

  // PERFORMANCE (high-volume invoices/payments + query workload)
  const seedStart = Date.now();
  seedLedgerForPerformance(fixture.ledgerRepository, tenantId, invoiceCount, paymentCount);
  const seedElapsed = Date.now() - seedStart;

  const allEntries = fixture.ledgerRepository.listEntries(tenantId);
  assert.equal(allEntries.length, invoiceCount + paymentCount, 'high-volume seeding must create all entries');
  assert.ok(seedElapsed < 3000, `high-volume inserts should remain fast, took ${seedElapsed}ms`);

  const uniqueSourceEventIds = new Set(allEntries.map((entry) => entry.source_event_id));
  assert.equal(uniqueSourceEventIds.size, allEntries.length, 'no duplicate ledger posting by source_event_id');

  const accountRead = fixture.ledgerRepository.readEntries(tenantId, { account_code: '1100' }, { limit: 100 });
  assert.equal(accountRead.plan.index, 'tenant_account', 'account queries must use tenant_account index');
  assert.ok(accountRead.plan.candidate_count < allEntries.length, 'tenant_account index should narrow candidate set');

  const referenceRead = fixture.ledgerRepository.readEntries(tenantId, { reference: 'evt-payment-700' }, { limit: 10 });
  assert.equal(referenceRead.plan.index, 'tenant_reference', 'reference queries must use tenant_reference index');
  assert.equal(referenceRead.data.length, 1, 'reference lookup should return single journal entry');

  const dashboardReadStart = Date.now();
  for (let i = 0; i < 200; i += 1) {
    fixture.ledgerRepository.readEntries(tenantId, { account_code: i % 2 === 0 ? '1000' : '1100' }, { limit: 50 });
  }
  const dashboardReadElapsedMs = Date.now() - dashboardReadStart;
  assert.ok(dashboardReadElapsedMs < 1000, `dashboard/API read model must stay responsive, took ${dashboardReadElapsedMs}ms`);

  const reconciliationStart = Date.now();
  fixture.reconciliationService.suggestMatches({
    tenant_id: tenantId,
    unmatched_transactions: [
      {
        id: 'txn-1',
        tenant_id: tenantId,
        amount_minor: 5000,
        currency_code: 'USD',
        booked_at: '2026-03-25',
        reference: 'evt-payment-700',
        counterparty_name: 'Customer 1'
      }
    ],
    matching_candidates: [
      {
        id: 'cand-1',
        tenant_id: tenantId,
        amount_minor: 5000,
        currency_code: 'USD',
        booked_at: '2026-03-25',
        reference: 'evt-payment-700',
        counterparty_name: 'Customer 1'
      }
    ]
  });
  const reconciliationElapsedMs = Date.now() - reconciliationStart;
  assert.ok(reconciliationElapsedMs < 1000, `reconciliation workload should remain performant, took ${reconciliationElapsedMs}ms`);

  // RESILIENCE + CHAOS (duplicates, retries, out-of-order, rollback)
  await fixture.worker.onApplicationBootstrap();

  fixture.eventsService.logEvent({
    tenant_id: tenantId,
    type: 'billing.invoice.created.v1',
    aggregate_type: 'invoice',
    aggregate_id: 'inv-dupe',
    aggregate_version: 1,
    idempotency_key: 'invoice-dupe-idempotency',
    payload: {
      invoice_id: 'inv-dupe',
      customer_id: 'cust-dupe',
      invoice_number: 'INV-DUPE',
      status: 'issued',
      total_minor: 9999,
      tax_minor: 0,
      currency_code: 'USD'
    }
  });
  fixture.eventsService.logEvent({
    tenant_id: tenantId,
    type: 'billing.invoice.created.v1',
    aggregate_type: 'invoice',
    aggregate_id: 'inv-dupe',
    aggregate_version: 1,
    idempotency_key: 'invoice-dupe-idempotency',
    payload: {
      invoice_id: 'inv-dupe',
      customer_id: 'cust-dupe',
      invoice_number: 'INV-DUPE',
      status: 'issued',
      total_minor: 9999,
      tax_minor: 0,
      currency_code: 'USD'
    }
  });

  await waitFor(() => fixture.ledgerRepository.listEntries(tenantId).length === invoiceCount + paymentCount + 1);

  let transientHandlerAttempts = 0;
  fixture.processingRegistry.register('billing.invoice.created.v1', 'qc3-transient-failure', async (event) => {
    if (event.aggregate_id !== 'inv-retry') {
      return;
    }

    transientHandlerAttempts += 1;
    if (transientHandlerAttempts < 2) {
      throw new Error('simulated worker crash');
    }
  });

  fixture.eventsService.logEvent({
    tenant_id: tenantId,
    type: 'billing.invoice.created.v1',
    aggregate_type: 'invoice',
    aggregate_id: 'inv-retry',
    aggregate_version: 1,
    idempotency_key: 'invoice-retry-idempotency',
    payload: {
      invoice_id: 'inv-retry',
      customer_id: 'cust-retry',
      invoice_number: 'INV-RETRY',
      status: 'issued',
      total_minor: 3100,
      tax_minor: 0,
      currency_code: 'USD'
    }
  });

  await waitFor(() => transientHandlerAttempts === 2);

  fixture.eventsService.logEvent({
    tenant_id: tenantId,
    type: 'billing.payment.recorded.v1',
    aggregate_type: 'payment',
    aggregate_id: 'oo-pay-1',
    aggregate_version: 1,
    idempotency_key: 'out-of-order-payment',
    payload: {
      payment_id: 'oo-pay-1',
      customer_id: 'cust-oo',
      status: 'recorded',
      amount_minor: 5000,
      currency_code: 'USD'
    }
  });
  fixture.eventsService.logEvent({
    tenant_id: tenantId,
    type: 'billing.invoice.created.v1',
    aggregate_type: 'invoice',
    aggregate_id: 'oo-inv-1',
    aggregate_version: 1,
    idempotency_key: 'out-of-order-invoice',
    payload: {
      invoice_id: 'oo-inv-1',
      customer_id: 'cust-oo',
      invoice_number: 'INV-OO-1',
      status: 'issued',
      total_minor: 5000,
      tax_minor: 0,
      currency_code: 'USD'
    }
  });

  await waitFor(() => fixture.ledgerRepository.listEntries(tenantId).length >= invoiceCount + paymentCount + 4);

  const failingEvent = fixture.eventsService.logEvent({
    tenant_id: tenantId,
    type: 'billing.invoice.created.v1',
    aggregate_type: 'invoice',
    aggregate_id: 'inv-db-failure',
    aggregate_version: 1,
    idempotency_key: 'invoice-db-failure',
    payload: {
      invoice_id: 'inv-db-failure',
      customer_id: 'cust-failure',
      invoice_number: 'INV-DB-FAIL',
      status: 'issued',
      total_minor: 8800,
      tax_minor: 0,
      currency_code: 'USD'
    }
  });

  const originalCreate = fixture.ledgerRepository.create.bind(fixture.ledgerRepository);
  let forcedFailure = true;
  fixture.ledgerRepository.create = (...args) => {
    if (forcedFailure) {
      forcedFailure = false;
      throw new Error('simulated db failure');
    }

    return originalCreate(...args);
  };

  await assert.rejects(
    () => fixture.ledgerService.postEvent(tenantId, failingEvent.id, 'manual-db-failure-test', '1'),
    /simulated db failure/
  );

  assert.equal(
    fixture.ledgerRepository.findBySourceEvent(tenantId, failingEvent.id, '1'),
    undefined,
    'failed transaction must not leave partial ledger rows'
  );

  await fixture.ledgerService.postEvent(tenantId, failingEvent.id, 'manual-db-failure-test', '1');
  assert.ok(
    fixture.ledgerRepository.findBySourceEvent(tenantId, failingEvent.id, '1'),
    'retry after rollback should succeed exactly once'
  );

  const deadLetters = fixture.queueDriver.getDeadLetterJobs();
  assert.equal(deadLetters.length, 0, 'no events should dead-letter in this success-path chaos run');

  await fixture.worker.onModuleDestroy();
});
