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

test('collections prediction is assistive-only and ranks late-pattern customers higher', () => {
  const tenantId = 'tenant-collections';
  const ledgerRepository = new LedgerRepository();
  const arRepository = new ArRepository();
  const apRepository = new ApRepository();
  const analyticsService = new AnalyticsService(ledgerRepository, arRepository, apRepository);

  arRepository.upsertInvoice(tenantId, {
    invoice_id: 'cust-late-h1',
    customer_id: 'cust-late',
    currency_code: 'USD',
    issue_date: '2026-01-01',
    due_date: '2026-01-10',
    total_minor: 1000,
    open_amount_minor: 0,
    paid_amount_minor: 1000,
    status: 'closed',
    updated_at: '2026-01-25T00:00:00.000Z'
  });
  arRepository.upsertInvoice(tenantId, {
    invoice_id: 'cust-late-h2',
    customer_id: 'cust-late',
    currency_code: 'USD',
    issue_date: '2026-02-01',
    due_date: '2026-02-10',
    total_minor: 1200,
    open_amount_minor: 0,
    paid_amount_minor: 1200,
    status: 'closed',
    updated_at: '2026-02-22T00:00:00.000Z'
  });
  arRepository.upsertInvoice(tenantId, {
    invoice_id: 'cust-early-h1',
    customer_id: 'cust-early',
    currency_code: 'USD',
    issue_date: '2026-01-01',
    due_date: '2026-01-20',
    total_minor: 900,
    open_amount_minor: 0,
    paid_amount_minor: 900,
    status: 'closed',
    updated_at: '2026-01-18T00:00:00.000Z'
  });
  arRepository.upsertInvoice(tenantId, {
    invoice_id: 'cust-early-h2',
    customer_id: 'cust-early',
    currency_code: 'USD',
    issue_date: '2026-02-01',
    due_date: '2026-02-20',
    total_minor: 1100,
    open_amount_minor: 0,
    paid_amount_minor: 1100,
    status: 'closed',
    updated_at: '2026-02-19T00:00:00.000Z'
  });
  arRepository.upsertInvoice(tenantId, {
    invoice_id: 'inv-open-late',
    customer_id: 'cust-late',
    currency_code: 'USD',
    issue_date: '2026-03-01',
    due_date: '2026-03-10',
    total_minor: 5000,
    open_amount_minor: 5000,
    paid_amount_minor: 0,
    status: 'open',
    updated_at: '2026-03-01T00:00:00.000Z'
  });
  arRepository.upsertInvoice(tenantId, {
    invoice_id: 'inv-open-early',
    customer_id: 'cust-early',
    currency_code: 'USD',
    issue_date: '2026-03-01',
    due_date: '2026-03-30',
    total_minor: 5000,
    open_amount_minor: 5000,
    paid_amount_minor: 0,
    status: 'open',
    updated_at: '2026-03-01T00:00:00.000Z'
  });

  const predictionA = analyticsService.getCollectionsPrediction(tenantId);
  const predictionB = analyticsService.getCollectionsPrediction(tenantId);
  assert.equal(predictionA.assistive_only, true);
  assert.equal(predictionA.no_automatic_actions, true);
  assert.deepEqual(
    predictionA.predictions.map((row) => row.invoice_id),
    ['inv-open-late', 'inv-open-early']
  );

  const lateInvoice = predictionA.predictions.find((row) => row.invoice_id === 'inv-open-late');
  const earlyInvoice = predictionA.predictions.find((row) => row.invoice_id === 'inv-open-early');
  assert.ok(lateInvoice.probability_of_delay > earlyInvoice.probability_of_delay);
  assert.ok(lateInvoice.drivers.includes('customer_history_late_payments'));
  assert.ok(
    predictionA.predictions.every((row) => row.probability_of_delay >= 0.01 && row.probability_of_delay <= 0.99),
    'all probabilities should be normalized between 0.01 and 0.99'
  );
  assert.deepEqual(
    predictionA.predictions.map((row) => row.probability_of_delay),
    predictionB.predictions.map((row) => row.probability_of_delay),
    'prediction output should be deterministic (no random outputs)'
  );
});

test('collections prediction responds to simulated late/early shifts', () => {
  const tenantId = 'tenant-collections-sim';
  const ledgerRepository = new LedgerRepository();
  const arRepository = new ArRepository();
  const apRepository = new ApRepository();
  const analyticsService = new AnalyticsService(ledgerRepository, arRepository, apRepository);

  for (let index = 0; index < 4; index += 1) {
    arRepository.upsertInvoice(tenantId, {
      invoice_id: `hist-${index + 1}`,
      customer_id: 'cust-a',
      currency_code: 'USD',
      issue_date: `2026-01-0${index + 1}`,
      due_date: `2026-01-1${index + 1}`,
      total_minor: 1000,
      open_amount_minor: 0,
      paid_amount_minor: 1000,
      status: 'closed',
      updated_at: `2026-01-1${index + 1}T00:00:00.000Z`
    });
  }

  arRepository.upsertInvoice(tenantId, {
    invoice_id: 'open-baseline',
    customer_id: 'cust-a',
    currency_code: 'USD',
    issue_date: '2026-03-01',
    due_date: '2026-03-20',
    total_minor: 2000,
    open_amount_minor: 2000,
    paid_amount_minor: 0,
    status: 'open',
    updated_at: '2026-03-01T00:00:00.000Z'
  });

  const baseline = analyticsService.getCollectionsPrediction(tenantId).predictions[0].probability_of_delay;

  arRepository.upsertInvoice(tenantId, {
    invoice_id: 'hist-late-sim',
    customer_id: 'cust-a',
    currency_code: 'USD',
    issue_date: '2026-02-01',
    due_date: '2026-02-10',
    total_minor: 1000,
    open_amount_minor: 0,
    paid_amount_minor: 1000,
    status: 'closed',
    updated_at: '2026-03-05T00:00:00.000Z'
  });

  const simulatedLate = analyticsService.getCollectionsPrediction(tenantId).predictions[0].probability_of_delay;
  assert.ok(simulatedLate > baseline, 'late payment simulation should increase delay probability');
});

test('analytics read-only guard blocks non-GET methods', () => {
  const guard = new AnalyticsReadOnlyGuard();
  assert.equal(guard.canActivate(buildExecutionContext('GET')), true);
  assert.throws(() => guard.canActivate(buildExecutionContext('PATCH')));
});

test('anomaly detection flags unusual expenses, abnormal cashflow changes, and outliers in read-only mode', () => {
  const tenantId = 'tenant-analytics-anomalies';
  const ledgerRepository = new LedgerRepository();
  const arRepository = new ArRepository();
  const apRepository = new ApRepository();
  const analyticsService = new AnalyticsService(ledgerRepository, arRepository, apRepository);

  const dailyNet = [1100, 980, 1020, -1200, -900, 1050, -950, -880, -6200];

  dailyNet.forEach((net, index) => {
    const date = `2026-03-${String(index + 1).padStart(2, '0')}`;
    if (net >= 0) {
      createLedgerEntry(ledgerRepository, {
        id: `je-in-${index + 1}`,
        tenant_id: tenantId,
        entry_date: date,
        lines: [
          { account_code: '1000', account_name: 'Cash', direction: 'debit', amount_minor: net },
          { account_code: '1100', account_name: 'AR', direction: 'credit', amount_minor: net }
        ]
      });
      return;
    }

    createLedgerEntry(ledgerRepository, {
      id: `je-out-${index + 1}`,
      tenant_id: tenantId,
      entry_date: date,
      lines: [
        { account_code: '2000', account_name: 'AP', direction: 'debit', amount_minor: Math.abs(net) },
        { account_code: '1000', account_name: 'Cash', direction: 'credit', amount_minor: Math.abs(net) }
      ]
    });
  });

  const anomalies = analyticsService.getAnomalies(tenantId);
  assert.equal(anomalies.analysis_mode, 'read_only');
  assert.equal(anomalies.automated_actions_enabled, false);
  assert.equal(anomalies.thresholds.robust_z_score, 3.2);
  assert.deepEqual(
    anomalies.anomalies
      .filter((item) => item.date === '2026-03-09')
      .map((item) => item.type)
      .sort(),
    ['abnormal_cashflow_change', 'outlier', 'unusual_expense']
  );
});

test('anomaly detection avoids false positives for stable activity and uses consistent thresholds', () => {
  const tenantId = 'tenant-analytics-noise';
  const ledgerRepository = new LedgerRepository();
  const arRepository = new ArRepository();
  const apRepository = new ApRepository();
  const analyticsService = new AnalyticsService(ledgerRepository, arRepository, apRepository);

  [950, 1040, 980, 1010, 990, 1020, 1000, 970, 1030].forEach((net, index) => {
    const date = `2026-04-${String(index + 1).padStart(2, '0')}`;
    createLedgerEntry(ledgerRepository, {
      id: `je-stable-${index + 1}`,
      tenant_id: tenantId,
      entry_date: date,
      lines: [
        { account_code: '1000', account_name: 'Cash', direction: 'debit', amount_minor: net },
        { account_code: '1100', account_name: 'AR', direction: 'credit', amount_minor: net }
      ]
    });
  });

  const anomalies = analyticsService.getAnomalies(tenantId);
  assert.equal(anomalies.anomalies.length, 0);
  assert.deepEqual(anomalies.thresholds, {
    robust_z_score: 3.2,
    min_samples: 6,
    minimum_absolute_minor: 1000
  });
});
