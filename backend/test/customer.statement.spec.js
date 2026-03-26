const test = require('node:test');
const assert = require('node:assert/strict');

const { CustomersService } = require('../.tmp-test-dist/modules/customers/customers.service');
const { CustomersRepository } = require('../.tmp-test-dist/modules/customers/customers.repository');
const { EventsService } = require('../.tmp-test-dist/modules/events/events.service');
const { EventsRepository } = require('../.tmp-test-dist/modules/events/events.repository');
const { EventConsumerIdempotencyService } = require('../.tmp-test-dist/modules/idempotency/event-consumer-idempotency.service');
const { IdempotencyRepository } = require('../.tmp-test-dist/modules/idempotency/idempotency.repository');
const { IdempotencyService } = require('../.tmp-test-dist/modules/idempotency/idempotency.service');
const { EventQueuePublisher } = require('../.tmp-test-dist/modules/events/queue/event-queue.publisher');
const { InMemoryQueueDriver } = require('../.tmp-test-dist/modules/events/queue/in-memory-queue.driver');
const { InvoicesRepository } = require('../.tmp-test-dist/modules/invoices/invoices.repository');
const { InvoicesService } = require('../.tmp-test-dist/modules/invoices/invoices.service');
const { PaymentsRepository } = require('../.tmp-test-dist/modules/payments/payments.repository');
const { PaymentsService } = require('../.tmp-test-dist/modules/payments/payments.service');
const { StatementsService } = require('../.tmp-test-dist/modules/statements/statements.service');
const { FinancialTransactionManager } = require('../.tmp-test-dist/common/transactions/financial-transaction.manager');
const { ApprovalRepository } = require('../.tmp-test-dist/modules/approval/approval.repository');
const { ApprovalService } = require('../.tmp-test-dist/modules/approval/approval.service');

function createServices() {
  const customersRepository = new CustomersRepository();
  const customersService = new CustomersService(customersRepository);
  const idempotencyRepository = new IdempotencyRepository();
  const idempotencyService = new IdempotencyService(idempotencyRepository);
  const eventConsumerIdempotencyService = new EventConsumerIdempotencyService(idempotencyService);
  const queueDriver = new InMemoryQueueDriver();
  const eventQueuePublisher = new EventQueuePublisher(queueDriver);
  const eventsService = new EventsService(new EventsRepository(), eventConsumerIdempotencyService, eventQueuePublisher);
  const transactionManager = new FinancialTransactionManager();
  const approvalService = new ApprovalService(new ApprovalRepository());
  approvalService.configureThreshold('tenant-1', 'large_payment_exception', { requires_approval_over_minor: 1_000_000_000 });
  const invoicesRepository = new InvoicesRepository();
  const paymentsRepository = new PaymentsRepository();
  const invoicesService = new InvoicesService(invoicesRepository, customersService, eventsService, transactionManager);
  const paymentsService = new PaymentsService(
    paymentsRepository,
    invoicesRepository,
    customersService,
    eventsService,
    idempotencyService,
    approvalService,
    transactionManager
  );

  return {
    customersRepository,
    customersService,
    invoicesService,
    paymentsService,
    statementsService: new StatementsService(customersService, invoicesService, paymentsService)
  };
}

test('customer statement includes invoices, payments, and running AR balance in chronological order', async () => {
  const { customersRepository, invoicesService, paymentsService, statementsService } = createServices();
  const customer = customersRepository.create({
    tenant_id: 'tenant-1',
    legal_name: 'Statement Customer',
    display_name: 'Statement Customer',
    email: 'statement@example.com',
    phone: null,
    tax_id: null,
    billing_address_line1: null,
    billing_address_line2: null,
    billing_city: null,
    billing_state: null,
    billing_postal_code: null,
    billing_country: 'US',
    metadata: null
  });

  const invoiceA = await invoicesService.createInvoice('tenant-1', {
    customer_id: customer.id,
    currency: 'USD',
    issue_date: '2026-03-01',
    lines: [{ description: 'A', quantity: 1, unit_price_minor: 1000 }]
  }, 'st-invoice-a');
  await invoicesService.issueInvoice('tenant-1', invoiceA.id, 'st-invoice-a-issue');

  const invoiceB = await invoicesService.createInvoice('tenant-1', {
    customer_id: customer.id,
    currency: 'USD',
    issue_date: '2026-03-03',
    lines: [{ description: 'B', quantity: 1, unit_price_minor: 500 }]
  }, 'st-invoice-b');
  await invoicesService.issueInvoice('tenant-1', invoiceB.id, 'st-invoice-b-issue');

  const payment = await paymentsService.createPayment('tenant-1', {
    customer_id: customer.id,
    payment_date: '2026-03-04',
    currency: 'USD',
    amount_received_minor: 900,
    payment_method: 'ach',
    allocations: [
      { invoice_id: invoiceA.id, allocated_minor: 700, allocation_date: '2026-03-04' },
      { invoice_id: invoiceB.id, allocated_minor: 200, allocation_date: '2026-03-05' }
    ]
  }, 'st-payment');

  const statement = statementsService.getCustomerStatement('tenant-1', customer.id);
  assert.equal(statement.entries.length, 4);

  const effectiveDates = statement.entries.map((entry) => entry.effective_at);
  assert.deepEqual(effectiveDates, ['2026-03-01', '2026-03-03', '2026-03-04', '2026-03-05']);

  const runningBalances = statement.entries.map((entry) => entry.running_balance_minor);
  assert.deepEqual(runningBalances, [1000, 1500, 800, 600]);

  const paymentRows = statement.entries.filter((entry) => entry.trace.linked_payment_id === payment.id);
  assert.equal(paymentRows.length, 2);

  const expectedArFromTransactions = 1000 + 500 - 700 - 200;
  assert.equal(statement.closing_balance_minor, expectedArFromTransactions);
});
