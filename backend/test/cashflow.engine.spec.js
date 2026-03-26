const test = require('node:test');
const assert = require('node:assert/strict');

const { CashflowService } = require('../dist/modules/cashflow/cashflow.service');
const { LedgerService } = require('../dist/modules/ledger/ledger.service');
const { LedgerRepository } = require('../dist/modules/ledger/ledger.repository');
const { AccountingPeriodRepository } = require('../dist/modules/ledger/accounting-period.repository');
const { ArService } = require('../dist/modules/ar/ar.service');
const { ArRepository } = require('../dist/modules/ar/ar.repository');
const { ApService } = require('../dist/modules/ap/ap.service');
const { ApRepository } = require('../dist/modules/ap/ap.repository');
const { EventBusService } = require('../dist/modules/events/event-bus.service');
const { EventsService } = require('../dist/modules/events/events.service');
const { EventsRepository } = require('../dist/modules/events/events.repository');
const { EventConsumerIdempotencyService } = require('../dist/modules/idempotency/event-consumer-idempotency.service');
const { IdempotencyRepository } = require('../dist/modules/idempotency/idempotency.repository');
const { IdempotencyService } = require('../dist/modules/idempotency/idempotency.service');
const { FinancialTransactionManager } = require('../dist/common/transactions/financial-transaction.manager');

function createFixture() {
  const ledgerRepository = new LedgerRepository();
  const arRepository = new ArRepository();
  const apRepository = new ApRepository();
  const eventsRepository = new EventsRepository();
  const idempotencyRepository = new IdempotencyRepository();
  const idempotencyService = new IdempotencyService(idempotencyRepository);
  const eventConsumerIdempotencyService = new EventConsumerIdempotencyService(idempotencyService);
  const eventBusService = new EventBusService(eventsRepository, eventConsumerIdempotencyService);
  const eventsService = new EventsService(eventsRepository, eventConsumerIdempotencyService, eventBusService);

  return {
    ledgerService: new LedgerService(ledgerRepository, eventsService, new FinancialTransactionManager(), new AccountingPeriodRepository()),
    arService: new ArService(arRepository, eventsService),
    apService: new ApService(apRepository, eventsService, ledgerRepository),
    cashflowService: new CashflowService(ledgerRepository, arRepository, apRepository)
  };
}

test('cashflow engine is deterministic, reconciles to ledger, and avoids double counting', async () => {
  const fixture = createFixture();
  const tenantId = 'tenant-cashflow';

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

  fixture.arService.applyInvoiceIssued(tenantId, {
    invoice_id: 'inv-1',
    customer_id: 'cust-1',
    currency_code: 'USD',
    issue_date: '2026-03-01',
    due_date: '2026-03-31',
    total_minor: 1000
  }, 'corr-1');

  fixture.arService.applyPaymentAllocated(tenantId, {
    payment_id: 'pay-1',
    allocation_changes: [{ invoice_id: 'inv-1', allocated_delta_minor: 1000 }]
  }, 'corr-2');

  fixture.apService.applyBillApproved(tenantId, {
    bill_id: 'bill-1',
    vendor_id: 'ven-1',
    approved_at: '2026-03-03',
    due_date: '2026-03-31',
    total_minor: 700,
    currency_code: 'USD'
  }, 'corr-3');

  fixture.apService.applyBillPaid(tenantId, {
    bill_id: 'bill-1',
    paid_at: '2026-03-04',
    amount_paid_minor: 700
  }, 'corr-4');

  const first = fixture.cashflowService.generate(tenantId, '2026-03-01', '2026-03-31');
  const second = fixture.cashflowService.generate(tenantId, '2026-03-01', '2026-03-31');

  assert.deepEqual(first, second, 'cashflow output must be deterministic');
  assert.equal(first.inflows_minor, 1000);
  assert.equal(first.outflows_minor, 700);
  assert.equal(first.ar_inflow_minor, 1000);
  assert.equal(first.ap_outflow_minor, 700);
  assert.equal(first.reconciliation.inflow_variance_minor, 0);
  assert.equal(first.reconciliation.outflow_variance_minor, 0);
  assert.equal(first.ledger_totals.ar_control_delta_minor, 0);
  assert.equal(first.ledger_totals.ap_control_delta_minor, 0);

  assert.deepEqual(first.daily, [
    { date: '2026-03-02', inflows_minor: 1000, outflows_minor: 0, net_cashflow_minor: 1000 },
    { date: '2026-03-04', inflows_minor: 0, outflows_minor: 700, net_cashflow_minor: -700 }
  ]);
});
