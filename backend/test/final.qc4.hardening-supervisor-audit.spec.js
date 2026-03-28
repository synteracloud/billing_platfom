const test = require('node:test');
const assert = require('node:assert/strict');
const fs = require('node:fs');

const { ConflictException, ForbiddenException } = require('@nestjs/common');
const { FinancialTransactionManager } = require('../.tmp-test-dist/common/transactions/financial-transaction.manager');
const { ApprovalRepository } = require('../.tmp-test-dist/modules/approval/approval.repository');
const { ApprovalService } = require('../.tmp-test-dist/modules/approval/approval.service');
const { EventBusService } = require('../.tmp-test-dist/modules/events/event-bus.service');
const { EventsRepository } = require('../.tmp-test-dist/modules/events/events.repository');
const { EventsService } = require('../.tmp-test-dist/modules/events/events.service');
const { ReplayRebuildToolingService } = require('../.tmp-test-dist/modules/events/replay-rebuild.tooling.service');
const { LedgerService } = require('../.tmp-test-dist/modules/ledger/ledger.service');
const { LedgerRepository } = require('../.tmp-test-dist/modules/ledger/ledger.repository');
const { AccountingPeriodRepository } = require('../.tmp-test-dist/modules/ledger/accounting-period.repository');
const { EventConsumerIdempotencyService } = require('../.tmp-test-dist/modules/idempotency/event-consumer-idempotency.service');
const { IdempotencyRepository } = require('../.tmp-test-dist/modules/idempotency/idempotency.repository');
const { IdempotencyService } = require('../.tmp-test-dist/modules/idempotency/idempotency.service');
const { ArRepository } = require('../.tmp-test-dist/modules/ar/ar.repository');
const { ApRepository } = require('../.tmp-test-dist/modules/ap/ap.repository');
const { AnalyticsService } = require('../.tmp-test-dist/modules/analytics/analytics.service');

function read(file) {
  return fs.readFileSync(file, 'utf8');
}

function createFixture() {
  const eventsRepository = new EventsRepository();
  const ledgerRepository = new LedgerRepository();
  const accountingPeriodRepository = new AccountingPeriodRepository();
  const idempotencyRepository = new IdempotencyRepository();
  const idempotencyService = new IdempotencyService(idempotencyRepository);
  const eventConsumerIdempotencyService = new EventConsumerIdempotencyService(idempotencyService);
  const eventBusService = new EventBusService(eventsRepository, eventConsumerIdempotencyService);
  const eventsService = new EventsService(eventsRepository, eventConsumerIdempotencyService, eventBusService);
  const approvalService = new ApprovalService(new ApprovalRepository(), eventsService);
  const transactionManager = new FinancialTransactionManager();
  const arRepository = new ArRepository();
  const apRepository = new ApRepository();
  const analyticsService = new AnalyticsService(ledgerRepository, arRepository, apRepository);

  return {
    eventsRepository,
    ledgerRepository,
    accountingPeriodRepository,
    approvalService,
    ledgerService: new LedgerService(ledgerRepository, eventsService, transactionManager, accountingPeriodRepository, approvalService),
    replayTooling: new ReplayRebuildToolingService(eventsRepository, ledgerRepository, arRepository, apRepository, analyticsService),
    arRepository,
    apRepository
  };
}

test('FINAL QC4 hardening: no bypass paths for unauthorized role, closed period, or period-reopen approvals', async () => {
  const fixture = createFixture();
  const tenantId = 'tenant-qc4';

  assert.throws(
    () => fixture.ledgerService.closePeriod(tenantId, '2026-01', { actor_id: 'staff-1', role: 'staff' }),
    ForbiddenException
  );

  fixture.ledgerService.closePeriod(tenantId, '2026-01', { actor_id: 'admin-1', role: 'admin' });

  await assert.rejects(
    () => fixture.ledgerService.post({
      tenant_id: tenantId,
      source_type: 'invoice',
      source_id: 'inv-closed-1',
      source_event_id: 'evt-closed-1',
      event_name: 'billing.invoice.issued.v1',
      rule_version: '1',
      entry_date: '2026-01-10',
      currency_code: 'USD',
      entries: [
        { account_code: '1100', account_name: 'Accounts Receivable', direction: 'debit', amount_minor: 1000, currency_code: 'USD' },
        { account_code: '4000', account_name: 'Revenue', direction: 'credit', amount_minor: 1000, currency_code: 'USD' }
      ]
    }),
    ConflictException
  );

  assert.throws(
    () => fixture.ledgerService.reopenPeriod(tenantId, '2026-01', 'missing approval should block', { actor_id: 'admin-2', role: 'admin' }),
    ConflictException
  );

  const reopenApproval = fixture.approvalService.requestApproval(tenantId, 'period_reopen', {
    actor_id: 'requester-1',
    amount_minor: 0,
    context: { reason: 'year-end adjustment' }
  });
  fixture.approvalService.approve(tenantId, reopenApproval.id, 'approver-1', 'approved');

  const reopened = fixture.ledgerService.reopenPeriod(
    tenantId,
    '2026-01',
    'year-end adjustment',
    { actor_id: 'admin-3', role: 'admin' },
    reopenApproval.id
  );
  assert.equal(reopened.status, 'reopened');

  const auditTypes = fixture.eventsRepository
    .listByTenant(tenantId, {})
    .map((event) => event.type)
    .filter((type) => type.startsWith('audit.'));

  assert.ok(auditTypes.includes('audit.accounting_period.posting_blocked_closed_period.v1'));
  assert.ok(auditTypes.includes('audit.approval_request.execution_blocked.v1'));
  assert.ok(auditTypes.includes('audit.approval_request.consumed.v1'));
});

test('FINAL QC4 supervisor audit traces: static chain coverage for all six trace families', () => {
  const invoicesService = read('backend/src/modules/invoices/invoices.service.ts');
  const paymentsService = read('backend/src/modules/payments/payments.service.ts');
  const statementsService = read('backend/src/modules/statements/statements.service.ts');
  const billsService = read('backend/src/modules/bills/bills.service.ts');
  const apService = read('backend/src/modules/ap/ap.service.ts');
  const bankConnector = read('backend/src/modules/bank-connector/bank-connector.service.ts');
  const reconciliationService = read('backend/src/modules/reconciliation/reconciliation.service.ts');
  const ledgerService = read('backend/src/modules/ledger/ledger.service.ts');
  const taxService = read('backend/src/modules/tax/tax.service.ts');

  // Trace 1: invoice → ledger → payment → AR → statement
  assert.match(invoicesService, /billing\.invoice\.issued\.v1/);
  assert.match(paymentsService, /billing\.payment\.allocated\.v1/);
  assert.match(statementsService, /Statement trace mismatch/);

  // Trace 2: bill → vendor → ledger → AP → report
  assert.match(billsService, /vendor_id/);
  assert.match(apService, /applyBillApprovedFromEvent/);
  assert.match(apService, /applyBillPaidFromEvent/);
  assert.match(apService, /reconcileOpenPayablesToLedger/);

  // Trace 3: bank txn → ingestion → normalization → reconciliation
  assert.match(bankConnector, /ingestTransactions/);
  assert.match(bankConnector, /mapToBankTransaction/);
  assert.match(reconciliationService, /suggestMatches/);

  // Trace 4: manual journal → reversal → financial statements
  assert.match(ledgerService, /createManualJournalEntry/);
  assert.match(ledgerService, /createReversalEntry/);
  assert.match(read('backend/src/modules/statements/financial-statements.service.ts'), /balance_sheet/);

  // Trace 5: tax calculation → report → ledger consistency
  assert.match(taxService, /calculateDocumentTaxes/);
  assert.match(taxService, /getPeriodTaxReportExportModel/);
  assert.match(taxService, /Tax summary mismatch against ledger liability account 2100/);

  // Trace 6: period close → blocked posting → audit log
  assert.match(ledgerService, /closePeriod/);
  assert.match(ledgerService, /posting_blocked_closed_period/);
  assert.match(ledgerService, /logMutation\(/);
});

test('FINAL QC4 replay/rebuild and ledger-reference integrity are auditable', async () => {
  const fixture = createFixture();
  const tenantId = 'tenant-replay-qc4';

  fixture.eventsRepository.create({
    id: 'evt-qc4-invoice-created',
    type: 'billing.invoice.created.v1',
    version: 1,
    tenant_id: tenantId,
    payload: { invoice_id: 'invoice-1', customer_id: 'customer-1', issue_date: '2026-02-01', due_date: '2026-03-01', total_minor: 1500, currency_code: 'USD' },
    occurred_at: '2026-02-01T00:00:00.000Z',
    recorded_at: '2026-02-01T00:00:00.000Z',
    aggregate_type: 'invoice',
    aggregate_id: 'invoice-1',
    aggregate_version: 1,
    causation_id: null,
    correlation_id: null,
    idempotency_key: 'invoice-1',
    producer: 'qc4'
  });
  fixture.eventsRepository.create({
    id: 'evt-qc4-invoice-issued',
    type: 'billing.invoice.issued.v1',
    version: 1,
    tenant_id: tenantId,
    payload: { invoice_id: 'invoice-1', customer_id: 'customer-1', issue_date: '2026-02-01', due_date: '2026-03-01', total_minor: 1500, currency_code: 'USD' },
    occurred_at: '2026-02-01T00:10:00.000Z',
    recorded_at: '2026-02-01T00:10:00.000Z',
    aggregate_type: 'invoice',
    aggregate_id: 'invoice-1',
    aggregate_version: 2,
    causation_id: null,
    correlation_id: null,
    idempotency_key: 'invoice-1-issued',
    producer: 'qc4'
  });

  fixture.eventsRepository.create({
    id: 'evt-qc4-bill-created',
    type: 'billing.bill.created.v1',
    version: 1,
    tenant_id: tenantId,
    payload: { bill_id: 'bill-1', vendor_id: 'vendor-1', created_at: '2026-02-02', total_minor: 700, currency_code: 'USD' },
    occurred_at: '2026-02-02T00:00:00.000Z',
    recorded_at: '2026-02-02T00:00:00.000Z',
    aggregate_type: 'bill',
    aggregate_id: 'bill-1',
    aggregate_version: 1,
    causation_id: null,
    correlation_id: null,
    idempotency_key: 'bill-1',
    producer: 'qc4'
  });

  await fixture.ledgerService.post({
    tenant_id: tenantId,
    source_type: 'invoice',
    source_id: 'invoice-1',
    source_event_id: 'evt-qc4-invoice-created',
    event_name: 'billing.invoice.created.v1',
    rule_version: '1',
    entry_date: '2026-02-01',
    currency_code: 'USD',
    entries: [
      { account_code: '1100', account_name: 'Accounts Receivable', direction: 'debit', amount_minor: 1500, currency_code: 'USD' },
      { account_code: '4000', account_name: 'Revenue', direction: 'credit', amount_minor: 1500, currency_code: 'USD' }
    ]
  });

  await fixture.ledgerService.post({
    tenant_id: tenantId,
    source_type: 'bill',
    source_id: 'bill-1',
    source_event_id: 'evt-qc4-bill-created',
    event_name: 'billing.bill.created.v1',
    rule_version: '1',
    entry_date: '2026-02-02',
    currency_code: 'USD',
    entries: [
      { account_code: '5000', account_name: 'Expense', direction: 'debit', amount_minor: 700, currency_code: 'USD' },
      { account_code: '2000', account_name: 'Accounts Payable', direction: 'credit', amount_minor: 700, currency_code: 'USD' }
    ]
  });

  fixture.arRepository.upsertInvoice(tenantId, {
    invoice_id: 'invoice-1',
    customer_id: 'customer-1',
    currency_code: 'USD',
    issue_date: '2026-02-01',
    due_date: '2026-03-01',
    total_minor: 1500,
    open_amount_minor: 1500,
    paid_amount_minor: 0,
    status: 'open',
    updated_at: '2026-02-01T00:00:00.000Z'
  });

  fixture.apRepository.upsertBill(tenantId, {
    bill_id: 'bill-1',
    vendor_id: 'vendor-1',
    currency_code: 'USD',
    approved_at: '2026-02-02',
    due_date: null,
    total_minor: 700,
    open_amount_minor: 700,
    paid_amount_minor: 0,
    status: 'open',
    updated_at: '2026-02-02T00:00:00.000Z'
  });

  const report = fixture.replayTooling.rebuildAndVerifyConsistency(tenantId);
  assert.equal(report.passed, true);
  assert.deepEqual(report.rebuilt.ledger_reference_integrity.missing_source_event_ids, []);
  assert.deepEqual(report.rebuilt.ledger_reference_integrity.duplicate_source_reference_keys, []);
});
