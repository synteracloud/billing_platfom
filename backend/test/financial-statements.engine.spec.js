const test = require('node:test');
const assert = require('node:assert/strict');

const { FinancialStatementsService } = require('../.tmp-test-dist/modules/statements/financial-statements.service');
const { LedgerService } = require('../.tmp-test-dist/modules/ledger/ledger.service');
const { LedgerRepository } = require('../.tmp-test-dist/modules/ledger/ledger.repository');
const { EventBusService } = require('../.tmp-test-dist/modules/events/event-bus.service');
const { EventsService } = require('../.tmp-test-dist/modules/events/events.service');
const { EventsRepository } = require('../.tmp-test-dist/modules/events/events.repository');
const { EventConsumerIdempotencyService } = require('../.tmp-test-dist/modules/idempotency/event-consumer-idempotency.service');
const { IdempotencyRepository } = require('../.tmp-test-dist/modules/idempotency/idempotency.repository');
const { IdempotencyService } = require('../.tmp-test-dist/modules/idempotency/idempotency.service');
const { FinancialTransactionManager } = require('../.tmp-test-dist/common/transactions/financial-transaction.manager');

function createFixture() {
  const ledgerRepository = new LedgerRepository();
  const eventsRepository = new EventsRepository();
  const idempotencyRepository = new IdempotencyRepository();
  const idempotencyService = new IdempotencyService(idempotencyRepository);
  const eventConsumerIdempotencyService = new EventConsumerIdempotencyService(idempotencyService);
  const eventBusService = new EventBusService(eventsRepository, eventConsumerIdempotencyService);
  const eventsService = new EventsService(eventsRepository, eventConsumerIdempotencyService, eventBusService);

  return {
    ledgerService: new LedgerService(ledgerRepository, eventsService, new FinancialTransactionManager()),
    financialStatementsService: new FinancialStatementsService(ledgerRepository)
  };
}

test('financial statements engine is period-aware, ledger-derived, deterministic, and reconciled', async () => {
  const fixture = createFixture();
  const tenantId = 'tenant-statements';

  await fixture.ledgerService.post({
    tenant_id: tenantId,
    source_type: 'invoice',
    source_id: 'inv-prior',
    source_event_id: 'evt-inv-prior',
    event_name: 'billing.invoice.issued.v1',
    rule_version: '2025-01-01',
    entry_date: '2026-01-10',
    currency_code: 'USD',
    entries: [
      { account_code: '1100', account_name: 'AR', direction: 'debit', amount_minor: 300, currency_code: 'USD' },
      { account_code: '4000', account_name: 'Revenue', direction: 'credit', amount_minor: 300, currency_code: 'USD' }
    ]
  });

  await fixture.ledgerService.post({
    tenant_id: tenantId,
    source_type: 'payment',
    source_id: 'pay-prior',
    source_event_id: 'evt-pay-prior',
    event_name: 'billing.payment.settled.v1',
    rule_version: '2025-01-01',
    entry_date: '2026-02-01',
    currency_code: 'USD',
    entries: [
      { account_code: '1000', account_name: 'Cash', direction: 'debit', amount_minor: 300, currency_code: 'USD' },
      { account_code: '1100', account_name: 'AR', direction: 'credit', amount_minor: 300, currency_code: 'USD' }
    ]
  });

  await fixture.ledgerService.post({
    tenant_id: tenantId,
    source_type: 'invoice',
    source_id: 'inv-last-year',
    source_event_id: 'evt-inv-last-year',
    event_name: 'billing.invoice.issued.v1',
    rule_version: '2025-01-01',
    entry_date: '2025-03-01',
    currency_code: 'USD',
    entries: [
      { account_code: '1100', account_name: 'AR', direction: 'debit', amount_minor: 800, currency_code: 'USD' },
      { account_code: '4000', account_name: 'Revenue', direction: 'credit', amount_minor: 800, currency_code: 'USD' }
    ]
  });

  await fixture.ledgerService.post({
    tenant_id: tenantId,
    source_type: 'payment',
    source_id: 'pay-last-year',
    source_event_id: 'evt-pay-last-year',
    event_name: 'billing.payment.settled.v1',
    rule_version: '2025-01-01',
    entry_date: '2025-03-05',
    currency_code: 'USD',
    entries: [
      { account_code: '1000', account_name: 'Cash', direction: 'debit', amount_minor: 800, currency_code: 'USD' },
      { account_code: '1100', account_name: 'AR', direction: 'credit', amount_minor: 800, currency_code: 'USD' }
    ]
  });

  await fixture.ledgerService.post({
    tenant_id: tenantId,
    source_type: 'bill',
    source_id: 'bill-last-year',
    source_event_id: 'evt-bill-last-year',
    event_name: 'billing.bill.approved.v1',
    rule_version: '2025-01-01',
    entry_date: '2025-03-06',
    currency_code: 'USD',
    entries: [
      { account_code: '5000', account_name: 'Expense', direction: 'debit', amount_minor: 500, currency_code: 'USD' },
      { account_code: '2000', account_name: 'AP', direction: 'credit', amount_minor: 500, currency_code: 'USD' }
    ]
  });

  await fixture.ledgerService.post({
    tenant_id: tenantId,
    source_type: 'bill_payment',
    source_id: 'bill-pay-last-year',
    source_event_id: 'evt-bill-pay-last-year',
    event_name: 'billing.bill.paid.v1',
    rule_version: '2025-01-01',
    entry_date: '2025-03-07',
    currency_code: 'USD',
    entries: [
      { account_code: '2000', account_name: 'AP', direction: 'debit', amount_minor: 500, currency_code: 'USD' },
      { account_code: '1000', account_name: 'Cash', direction: 'credit', amount_minor: 500, currency_code: 'USD' }
    ]
  });

  await fixture.ledgerService.post({
    tenant_id: tenantId,
    source_type: 'invoice',
    source_id: 'inv-1',
    source_event_id: 'evt-inv-1',
    event_name: 'billing.invoice.issued.v1',
    rule_version: '2025-01-01',
    entry_date: '2026-03-01',
    currency_code: 'USD',
    entries: [
      { account_code: '1100', account_name: 'AR', direction: 'debit', amount_minor: 1000, currency_code: 'USD' },
      { account_code: '4000', account_name: 'Revenue', direction: 'credit', amount_minor: 1000, currency_code: 'USD' }
    ]
  });

  await fixture.ledgerService.post({
    tenant_id: tenantId,
    source_type: 'payment',
    source_id: 'pay-1',
    source_event_id: 'evt-pay-1',
    event_name: 'billing.payment.settled.v1',
    rule_version: '2025-01-01',
    entry_date: '2026-03-02',
    currency_code: 'USD',
    entries: [
      { account_code: '1000', account_name: 'Cash', direction: 'debit', amount_minor: 1000, currency_code: 'USD' },
      { account_code: '1100', account_name: 'AR', direction: 'credit', amount_minor: 1000, currency_code: 'USD' }
    ]
  });

  await fixture.ledgerService.post({
    tenant_id: tenantId,
    source_type: 'bill',
    source_id: 'bill-1',
    source_event_id: 'evt-bill-1',
    event_name: 'billing.bill.approved.v1',
    rule_version: '2025-01-01',
    entry_date: '2026-03-03',
    currency_code: 'USD',
    entries: [
      { account_code: '5000', account_name: 'Expense', direction: 'debit', amount_minor: 700, currency_code: 'USD' },
      { account_code: '2000', account_name: 'AP', direction: 'credit', amount_minor: 700, currency_code: 'USD' }
    ]
  });

  await fixture.ledgerService.post({
    tenant_id: tenantId,
    source_type: 'bill_payment',
    source_id: 'bill-pay-1',
    source_event_id: 'evt-bill-pay-1',
    event_name: 'billing.bill.paid.v1',
    rule_version: '2025-01-01',
    entry_date: '2026-03-04',
    currency_code: 'USD',
    entries: [
      { account_code: '2000', account_name: 'AP', direction: 'debit', amount_minor: 700, currency_code: 'USD' },
      { account_code: '1000', account_name: 'Cash', direction: 'credit', amount_minor: 700, currency_code: 'USD' }
    ]
  });

  await fixture.ledgerService.post({
    tenant_id: tenantId,
    source_type: 'refund',
    source_id: 'refund-1',
    source_event_id: 'evt-refund-1',
    event_name: 'billing.payment.refunded.v1',
    rule_version: '2025-01-01',
    entry_date: '2026-03-05',
    currency_code: 'USD',
    entries: [
      { account_code: '5010', account_name: 'Refund Expense', direction: 'debit', amount_minor: 200, currency_code: 'USD' },
      { account_code: '1000', account_name: 'Cash', direction: 'credit', amount_minor: 200, currency_code: 'USD' }
    ]
  });

  const first = fixture.financialStatementsService.generate(tenantId, '2026-03-01', '2026-03-31');
  const second = fixture.financialStatementsService.generate(tenantId, '2026-03-01', '2026-03-31');

  assert.deepEqual(first, second, 'statement output must be deterministic and reproducible');

  assert.equal(first.profit_and_loss.revenue_minor, 1000);
  assert.equal(first.profit_and_loss.expense_minor, 900);
  assert.equal(first.profit_and_loss.net_income_minor, 100);

  assert.equal(first.balance_sheet.assets_minor, 400);
  assert.equal(first.balance_sheet.liabilities_minor, 0);
  assert.equal(first.balance_sheet.equity_minor, 400);
  assert.equal(first.balance_sheet.equation_delta_minor, 0);

  assert.equal(first.cash_flow_statement.opening_cash_minor, 300);
  assert.equal(first.cash_flow_statement.closing_cash_minor, 400);
  assert.equal(first.cash_flow_statement.inflows_minor, 1000);
  assert.equal(first.cash_flow_statement.outflows_minor, 900);
  assert.equal(first.cash_flow_statement.net_cashflow_minor, 100);

  assert.deepEqual(first.cash_flow_statement.daily, [
    { date: '2026-03-02', inflows_minor: 1000, outflows_minor: 0, net_cashflow_minor: 1000 },
    { date: '2026-03-04', inflows_minor: 0, outflows_minor: 700, net_cashflow_minor: -700 },
    { date: '2026-03-05', inflows_minor: 0, outflows_minor: 200, net_cashflow_minor: -200 }
  ]);

  assert.equal(first.qc.statements_reconcile_to_ledger, true);
  assert.equal(first.qc.period_calculations_correct, true);
  assert.equal(first.qc.no_double_counting, true);
  assert.equal(first.qc.pnl_matches_revenue_expense_accounts, true);
  assert.equal(first.qc.balance_sheet_equation_valid, true);
  assert.equal(first.qc.cash_flow_matches_cash_movements, true);

  assert.equal(first.comparisons.mom.period_from, '2026-02-01');
  assert.equal(first.comparisons.mom.period_to, '2026-02-28');
  assert.equal(first.comparisons.mom.profit_and_loss.revenue_minor.current_minor, 1000);
  assert.equal(first.comparisons.mom.profit_and_loss.revenue_minor.comparison_minor, 0);
  assert.equal(first.comparisons.mom.profit_and_loss.revenue_minor.variance_minor, 1000);
  assert.equal(first.comparisons.mom.profit_and_loss.revenue_minor.variance_bps, null);

  assert.equal(first.comparisons.yoy.period_from, '2025-03-01');
  assert.equal(first.comparisons.yoy.period_to, '2025-03-31');
  assert.equal(first.comparisons.yoy.profit_and_loss.revenue_minor.current_minor, 1000);
  assert.equal(first.comparisons.yoy.profit_and_loss.revenue_minor.comparison_minor, 800);
  assert.equal(first.comparisons.yoy.profit_and_loss.revenue_minor.variance_minor, 200);
  assert.equal(first.comparisons.yoy.profit_and_loss.revenue_minor.variance_bps, 2500);
  assert.equal(first.comparisons.yoy.profit_and_loss.expense_minor.comparison_minor, 500);
  assert.equal(first.comparisons.yoy.profit_and_loss.net_income_minor.comparison_minor, 300);
});

test('comparative periods stay deterministic and aligned across multiple windows', async () => {
  const fixture = createFixture();
  const tenantId = 'tenant-comparisons';

  await fixture.ledgerService.post({
    tenant_id: tenantId,
    source_type: 'invoice',
    source_id: 'jan-invoice',
    source_event_id: 'evt-jan-invoice',
    event_name: 'billing.invoice.issued.v1',
    rule_version: '2025-01-01',
    entry_date: '2026-01-31',
    currency_code: 'USD',
    entries: [
      { account_code: '1100', account_name: 'AR', direction: 'debit', amount_minor: 200, currency_code: 'USD' },
      { account_code: '4000', account_name: 'Revenue', direction: 'credit', amount_minor: 200, currency_code: 'USD' }
    ]
  });

  await fixture.ledgerService.post({
    tenant_id: tenantId,
    source_type: 'payment',
    source_id: 'jan-payment',
    source_event_id: 'evt-jan-payment',
    event_name: 'billing.payment.settled.v1',
    rule_version: '2025-01-01',
    entry_date: '2026-01-31',
    currency_code: 'USD',
    entries: [
      { account_code: '1000', account_name: 'Cash', direction: 'debit', amount_minor: 200, currency_code: 'USD' },
      { account_code: '1100', account_name: 'AR', direction: 'credit', amount_minor: 200, currency_code: 'USD' }
    ]
  });

  await fixture.ledgerService.post({
    tenant_id: tenantId,
    source_type: 'invoice',
    source_id: 'feb-invoice',
    source_event_id: 'evt-feb-invoice',
    event_name: 'billing.invoice.issued.v1',
    rule_version: '2025-01-01',
    entry_date: '2026-02-28',
    currency_code: 'USD',
    entries: [
      { account_code: '1100', account_name: 'AR', direction: 'debit', amount_minor: 300, currency_code: 'USD' },
      { account_code: '4000', account_name: 'Revenue', direction: 'credit', amount_minor: 300, currency_code: 'USD' }
    ]
  });

  const marchWindow = fixture.financialStatementsService.generate(tenantId, '2026-03-31', '2026-03-31');
  assert.equal(marchWindow.comparisons.mom.period_from, '2026-02-28');
  assert.equal(marchWindow.comparisons.mom.period_to, '2026-02-28');

  const febWindow = fixture.financialStatementsService.generate(tenantId, '2026-02-28', '2026-02-28');
  assert.equal(febWindow.comparisons.mom.period_from, '2026-01-28');
  assert.equal(febWindow.comparisons.mom.period_to, '2026-01-28');
  assert.equal(febWindow.comparisons.mom.profit_and_loss.revenue_minor.current_minor, 300);
  assert.equal(febWindow.comparisons.mom.profit_and_loss.revenue_minor.comparison_minor, 0);
  assert.equal(febWindow.comparisons.mom.profit_and_loss.revenue_minor.variance_minor, 300);
});
