const test = require('node:test');
const assert = require('node:assert/strict');

const { AnalyticsService } = require('../.tmp-test-dist/modules/analytics/analytics.service');
const { AnalyticsReadOnlyGuard } = require('../.tmp-test-dist/modules/analytics/analytics-readonly.guard');
const { LedgerRepository } = require('../.tmp-test-dist/modules/ledger/ledger.repository');
const { ArRepository } = require('../.tmp-test-dist/modules/ar/ar.repository');
const { ApRepository } = require('../.tmp-test-dist/modules/ap/ap.repository');

function buildExecutionContext(method) {
  return {
    switchToHttp: () => ({
      getRequest: () => ({ method })
    })
  };
}

function createLedgerEntry(ledgerRepository, entry) {
  ledgerRepository.create(
    {
      id: entry.id,
      tenant_id: entry.tenant_id,
      source_type: 'event',
      source_id: entry.id,
      source_event_id: `${entry.id}-evt`,
      event_name: 'billing.payment.settled.v1',
      rule_version: '1',
      entry_date: entry.entry_date,
      currency_code: 'USD',
      description: null,
      created_at: `${entry.entry_date}T00:00:00.000Z`
    },
    entry.lines.map((line, index) => ({
      id: `${entry.id}-line-${index + 1}`,
      tenant_id: entry.tenant_id,
      journal_entry_id: entry.id,
      line_number: index + 1,
      account_code: line.account_code,
      account_name: line.account_name,
      direction: line.direction,
      amount_minor: line.amount_minor,
      currency_code: 'USD',
      created_at: `${entry.entry_date}T00:00:00.000Z`
    }))
  );
}

test('analytics APIs match calculations from raw AR/AP and ledger data', () => {
  const tenantId = 'tenant-analytics';
  const ledgerRepository = new LedgerRepository();
  const arRepository = new ArRepository();
  const apRepository = new ApRepository();
  const analyticsService = new AnalyticsService(ledgerRepository, arRepository, apRepository);

  arRepository.upsertInvoice(tenantId, {
    invoice_id: 'inv-1',
    customer_id: 'cust-1',
    currency_code: 'USD',
    issue_date: '2026-02-01',
    due_date: '2026-02-15',
    total_minor: 5000,
    open_amount_minor: 4000,
    paid_amount_minor: 1000,
    status: 'open',
    updated_at: '2026-02-01T00:00:00.000Z'
  });
  arRepository.upsertInvoice(tenantId, {
    invoice_id: 'inv-2',
    customer_id: 'cust-2',
    currency_code: 'USD',
    issue_date: '2026-02-02',
    due_date: null,
    total_minor: 2000,
    open_amount_minor: 2000,
    paid_amount_minor: 0,
    status: 'open',
    updated_at: '2026-02-02T00:00:00.000Z'
  });

  apRepository.upsertBill(tenantId, {
    bill_id: 'bill-1',
    vendor_id: 'vendor-1',
    currency_code: 'USD',
    approved_at: '2026-02-01',
    due_date: '2026-02-10',
    total_minor: 2500,
    open_amount_minor: 2500,
    paid_amount_minor: 0,
    status: 'open',
    updated_at: '2026-02-01T00:00:00.000Z'
  });
  apRepository.upsertBill(tenantId, {
    bill_id: 'bill-2',
    vendor_id: 'vendor-2',
    currency_code: 'USD',
    approved_at: '2026-02-03',
    due_date: null,
    total_minor: 1500,
    open_amount_minor: 1000,
    paid_amount_minor: 500,
    status: 'open',
    updated_at: '2026-02-03T00:00:00.000Z'
  });

  createLedgerEntry(ledgerRepository, {
    id: 'je-1',
    tenant_id: tenantId,
    entry_date: '2026-02-01',
    lines: [
      { account_code: '1000', account_name: 'Cash', direction: 'debit', amount_minor: 4000 },
      { account_code: '1100', account_name: 'AR', direction: 'credit', amount_minor: 4000 }
    ]
  });
  createLedgerEntry(ledgerRepository, {
    id: 'je-2',
    tenant_id: tenantId,
    entry_date: '2026-02-05',
    lines: [
      { account_code: '2000', account_name: 'AP', direction: 'debit', amount_minor: 1800 },
      { account_code: '1000', account_name: 'Cash', direction: 'credit', amount_minor: 1800 }
    ]
  });
  createLedgerEntry(ledgerRepository, {
    id: 'je-3',
    tenant_id: tenantId,
    entry_date: '2026-02-06',
    lines: [
      { account_code: '1010', account_name: 'Operating Cash', direction: 'debit', amount_minor: 500 },
      { account_code: '1000', account_name: 'Cash', direction: 'credit', amount_minor: 500 }
    ]
  });

  const rawCashIn = 4000;
  const rawCashOut = 1800;
  const rawCashNet = rawCashIn - rawCashOut;

  const cashflow = analyticsService.getCashflow(tenantId);
  assert.equal(cashflow.totals.inflow_minor, rawCashIn);
  assert.equal(cashflow.totals.outflow_minor, rawCashOut);
  assert.equal(cashflow.totals.net_minor, rawCashNet);
  assert.deepEqual(cashflow.by_day, [
    { date: '2026-02-01', inflow_minor: 4000, outflow_minor: 0, net_minor: 4000 },
    { date: '2026-02-05', inflow_minor: 0, outflow_minor: 1800, net_minor: -1800 }
  ]);

  const inflow = analyticsService.getInflowProjection(tenantId);
  assert.equal(inflow.total_minor, 6000);
  assert.deepEqual(inflow.by_day, [
    { date: '2026-02-02', amount_minor: 2000 },
    { date: '2026-02-15', amount_minor: 4000 }
  ]);

  const outflow = analyticsService.getOutflowProjection(tenantId);
  assert.equal(outflow.total_minor, 3500);
  assert.deepEqual(outflow.by_day, [
    { date: '2026-02-03', amount_minor: 1000 },
    { date: '2026-02-10', amount_minor: 2500 }
  ]);

  const runway = analyticsService.getRunway(tenantId, 10);
  assert.equal(runway.cash_on_hand_minor, rawCashNet);
  assert.equal(runway.projected_daily_net_burn_minor, 0);
  assert.equal(runway.projected_runway_days, null);
});

test('projections include overdue invoices and future bills with deterministic ordering', () => {
  const tenantId = 'tenant-analytics-overdue';
  const ledgerRepository = new LedgerRepository();
  const arRepository = new ArRepository();
  const apRepository = new ApRepository();
  const analyticsService = new AnalyticsService(ledgerRepository, arRepository, apRepository);

  arRepository.upsertInvoice(tenantId, {
    invoice_id: 'inv-overdue',
    customer_id: 'cust-1',
    currency_code: 'USD',
    issue_date: '2026-01-10',
    due_date: '2026-01-20',
    total_minor: 7000,
    open_amount_minor: 4500,
    paid_amount_minor: 2500,
    status: 'open',
    updated_at: '2026-02-20T00:00:00.000Z'
  });
  arRepository.upsertInvoice(tenantId, {
    invoice_id: 'inv-future',
    customer_id: 'cust-2',
    currency_code: 'USD',
    issue_date: '2026-03-10',
    due_date: '2026-04-10',
    total_minor: 3200,
    open_amount_minor: 3200,
    paid_amount_minor: 0,
    status: 'open',
    updated_at: '2026-03-10T00:00:00.000Z'
  });

  apRepository.upsertBill(tenantId, {
    bill_id: 'bill-overdue',
    vendor_id: 'vendor-1',
    currency_code: 'USD',
    approved_at: '2026-01-15',
    due_date: '2026-02-01',
    total_minor: 2100,
    open_amount_minor: 900,
    paid_amount_minor: 1200,
    status: 'open',
    updated_at: '2026-02-01T00:00:00.000Z'
  });
  apRepository.upsertBill(tenantId, {
    bill_id: 'bill-future',
    vendor_id: 'vendor-2',
    currency_code: 'USD',
    approved_at: '2026-03-12',
    due_date: '2026-04-15',
    total_minor: 5000,
    open_amount_minor: 5000,
    paid_amount_minor: 0,
    status: 'open',
    updated_at: '2026-03-12T00:00:00.000Z'
  });

  const inflow = analyticsService.getInflowProjection(tenantId);
  assert.equal(inflow.total_minor, 7700);
  assert.deepEqual(inflow.by_day, [
    { date: '2026-01-20', amount_minor: 4500 },
    { date: '2026-04-10', amount_minor: 3200 }
  ]);

  const outflow = analyticsService.getOutflowProjection(tenantId);
  assert.equal(outflow.total_minor, 5900);
  assert.deepEqual(outflow.by_day, [
    { date: '2026-02-01', amount_minor: 900 },
    { date: '2026-04-15', amount_minor: 5000 }
  ]);
});

test('runway handles burn and edge cases with zero/negative horizon', () => {
  const tenantId = 'tenant-analytics-edge';
  const ledgerRepository = new LedgerRepository();
  const arRepository = new ArRepository();
  const apRepository = new ApRepository();
  const analyticsService = new AnalyticsService(ledgerRepository, arRepository, apRepository);

  apRepository.upsertBill(tenantId, {
    bill_id: 'bill-burn',
    vendor_id: 'vendor-1',
    currency_code: 'USD',
    approved_at: '2026-03-01',
    due_date: '2026-03-10',
    total_minor: 3000,
    open_amount_minor: 3000,
    paid_amount_minor: 0,
    status: 'open',
    updated_at: '2026-03-01T00:00:00.000Z'
  });

  createLedgerEntry(ledgerRepository, {
    id: 'je-edge',
    tenant_id: tenantId,
    entry_date: '2026-03-01',
    lines: [
      { account_code: '1010', account_name: 'Operating Cash', direction: 'debit', amount_minor: 900 },
      { account_code: '1100', account_name: 'AR', direction: 'credit', amount_minor: 900 }
    ]
  });

  const runway = analyticsService.getRunway(tenantId, -1);
  assert.equal(runway.based_on_horizon_days, 90);
  assert.equal(runway.projected_daily_net_burn_minor, 33);
  assert.equal(runway.projected_runway_days, 26);
});

test('analytics read-only guard blocks non-GET methods', () => {
  const guard = new AnalyticsReadOnlyGuard();
  assert.equal(guard.canActivate(buildExecutionContext('GET')), true);
  assert.throws(() => guard.canActivate(buildExecutionContext('PATCH')));
});

test('financial copilot returns grounded cash position and summary answers', () => {
  const tenantId = 'tenant-financial-copilot';
  const ledgerRepository = new LedgerRepository();
  const arRepository = new ArRepository();
  const apRepository = new ApRepository();
  const analyticsService = new AnalyticsService(ledgerRepository, arRepository, apRepository);

  arRepository.upsertInvoice(tenantId, {
    invoice_id: 'inv-open-1',
    customer_id: 'cust-1',
    currency_code: 'USD',
    issue_date: '2026-03-01',
    due_date: '2026-03-20',
    total_minor: 3000,
    open_amount_minor: 3000,
    paid_amount_minor: 0,
    status: 'open',
    updated_at: '2026-03-01T00:00:00.000Z'
  });
  apRepository.upsertBill(tenantId, {
    bill_id: 'bill-open-1',
    vendor_id: 'vendor-1',
    currency_code: 'USD',
    approved_at: '2026-03-02',
    due_date: '2026-03-22',
    total_minor: 2200,
    open_amount_minor: 2200,
    paid_amount_minor: 0,
    status: 'open',
    updated_at: '2026-03-02T00:00:00.000Z'
  });

  createLedgerEntry(ledgerRepository, {
    id: 'je-copilot-1',
    tenant_id: tenantId,
    entry_date: '2026-03-05',
    lines: [
      { account_code: '1000', account_name: 'Cash', direction: 'debit', amount_minor: 5000 },
      { account_code: '1100', account_name: 'AR', direction: 'credit', amount_minor: 5000 }
    ]
  });
  createLedgerEntry(ledgerRepository, {
    id: 'je-copilot-2',
    tenant_id: tenantId,
    entry_date: '2026-03-07',
    lines: [
      { account_code: '2000', account_name: 'AP', direction: 'debit', amount_minor: 1200 },
      { account_code: '1000', account_name: 'Cash', direction: 'credit', amount_minor: 1200 }
    ]
  });

  const cashAnswer = analyticsService.answerFinancialQuery(tenantId, 'cash position?');
  assert.equal(cashAnswer.intent, 'cash_position');
  assert.equal(cashAnswer.qc.grounded_in_data, true);
  assert.equal(cashAnswer.qc.cross_check_passed, true);
  assert.match(cashAnswer.answer, /3800/);
  assert.deepEqual(
    cashAnswer.evidence.map((line) => line.metric),
    ['cash_on_hand_minor', 'cash_inflow_minor', 'cash_outflow_minor', 'open_ar_minor', 'open_ap_minor']
  );

  const summaryAnswer = analyticsService.answerFinancialQuery(tenantId, 'summarize financial state', '2026-03-25');
  assert.equal(summaryAnswer.intent, 'financial_summary');
  assert.equal(summaryAnswer.qc.grounded_in_data, true);
  assert.equal(summaryAnswer.qc.edge_query_covered, true);
  assert.match(summaryAnswer.answer, /overdue invoices 1/);
  assert.match(summaryAnswer.answer, /overdue bills 1/);
});

test('financial copilot late-payer response is deterministic and handles edge queries', () => {
  const tenantId = 'tenant-financial-copilot-late';
  const ledgerRepository = new LedgerRepository();
  const arRepository = new ArRepository();
  const apRepository = new ApRepository();
  const analyticsService = new AnalyticsService(ledgerRepository, arRepository, apRepository);

  arRepository.upsertInvoice(tenantId, {
    invoice_id: 'inv-1',
    customer_id: 'cust-z',
    currency_code: 'USD',
    issue_date: '2026-03-01',
    due_date: '2026-03-10',
    total_minor: 2500,
    open_amount_minor: 2500,
    paid_amount_minor: 0,
    status: 'open',
    updated_at: '2026-03-01T00:00:00.000Z'
  });
  arRepository.upsertInvoice(tenantId, {
    invoice_id: 'inv-2',
    customer_id: 'cust-a',
    currency_code: 'USD',
    issue_date: '2026-03-02',
    due_date: '2026-03-10',
    total_minor: 4000,
    open_amount_minor: 4000,
    paid_amount_minor: 0,
    status: 'open',
    updated_at: '2026-03-02T00:00:00.000Z'
  });
  arRepository.upsertInvoice(tenantId, {
    invoice_id: 'inv-open-future',
    customer_id: 'cust-future',
    currency_code: 'USD',
    issue_date: '2026-03-15',
    due_date: '2026-04-15',
    total_minor: 1000,
    open_amount_minor: 1000,
    paid_amount_minor: 0,
    status: 'open',
    updated_at: '2026-03-15T00:00:00.000Z'
  });

  const lateAnswer = analyticsService.answerFinancialQuery(tenantId, 'who will pay late?', '2026-03-25');
  assert.equal(lateAnswer.intent, 'late_payers');
  assert.equal(lateAnswer.qc.deterministic_ordering, true);
  assert.equal(lateAnswer.evidence.length, 2);
  assert.equal(lateAnswer.evidence[0].metric, 'overdue_invoice:inv-2');
  assert.equal(lateAnswer.evidence[1].metric, 'overdue_invoice:inv-1');

  const unsupported = analyticsService.answerFinancialQuery(tenantId, 'show me magic');
  assert.equal(unsupported.intent, 'unsupported');
  assert.equal(unsupported.evidence.length, 0);
});
