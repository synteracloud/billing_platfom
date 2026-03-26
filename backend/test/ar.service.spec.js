const test = require('node:test');
const assert = require('node:assert/strict');

const { ArService } = require('../.tmp-test-dist/modules/ar/ar.service');
const { ArRepository } = require('../.tmp-test-dist/modules/ar/ar.repository');
const { ArEventsHandler } = require('../.tmp-test-dist/modules/ar/ar.events.handler');
const { PaymentsService } = require('../.tmp-test-dist/modules/payments/payments.service');
const { PaymentsRepository } = require('../.tmp-test-dist/modules/payments/payments.repository');
const { InvoicesRepository } = require('../.tmp-test-dist/modules/invoices/invoices.repository');
const { CustomersService } = require('../.tmp-test-dist/modules/customers/customers.service');
const { CustomersRepository } = require('../.tmp-test-dist/modules/customers/customers.repository');
const { EventsService } = require('../.tmp-test-dist/modules/events/events.service');
const { EventsRepository } = require('../.tmp-test-dist/modules/events/events.repository');
const { EventConsumerIdempotencyService } = require('../.tmp-test-dist/modules/idempotency/event-consumer-idempotency.service');
const { IdempotencyRepository } = require('../.tmp-test-dist/modules/idempotency/idempotency.repository');
const { IdempotencyService } = require('../.tmp-test-dist/modules/idempotency/idempotency.service');
const { EventQueuePublisher } = require('../.tmp-test-dist/modules/events/queue/event-queue.publisher');
const { InMemoryQueueDriver } = require('../.tmp-test-dist/modules/events/queue/in-memory-queue.driver');
const { EventProcessingRegistry } = require('../.tmp-test-dist/modules/events/queue/event-processing.registry');
const { EventProcessingWorker } = require('../.tmp-test-dist/modules/events/queue/event-processing.worker');
const { FinancialTransactionManager } = require('../.tmp-test-dist/common/transactions/financial-transaction.manager');
const { ApprovalRepository } = require('../.tmp-test-dist/modules/approval/approval.repository');
const { ApprovalService } = require('../.tmp-test-dist/modules/approval/approval.service');

function seedCustomer(customersRepository, tenantId = 'tenant-ar') {
  return customersRepository.create({
    tenant_id: tenantId,
    legal_name: 'AR Customer Inc',
    display_name: 'AR Customer',
    email: 'ar@example.com',
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
}

function seedIssuedInvoice(invoicesRepository, tenantId, customerId, totalMinor = 1000) {
  return invoicesRepository.create({
    tenant_id: tenantId,
    customer_id: customerId,
    invoice_number: 'INV-AR-1',
    status: 'issued',
    issue_date: '2026-03-10',
    due_date: '2026-03-31',
    currency: 'USD',
    subtotal_minor: totalMinor,
    tax_minor: 0,
    discount_minor: 0,
    total_minor: totalMinor,
    amount_paid_minor: 0,
    amount_due_minor: totalMinor,
    notes: null,
    issued_at: '2026-03-10T00:00:00.000Z',
    voided_at: null,
    subscription_id: null,
    metadata: null
  });
}

test('AR projection stays event-driven and keeps customer balance consistent through invoice+payment flow', async () => {
  const queueDriver = new InMemoryQueueDriver();
  const processingRegistry = new EventProcessingRegistry();
  const idempotencyRepository = new IdempotencyRepository();
  const idempotencyService = new IdempotencyService(idempotencyRepository);
  const eventConsumerIdempotencyService = new EventConsumerIdempotencyService(idempotencyService);
  const eventQueuePublisher = new EventQueuePublisher(queueDriver);
  const eventsService = new EventsService(new EventsRepository(), eventConsumerIdempotencyService, eventQueuePublisher);
  const transactionManager = new FinancialTransactionManager();
  const approvalService = new ApprovalService(new ApprovalRepository());
  approvalService.configureThreshold('tenant-1', 'large_payment_exception', { requires_approval_over_minor: 1_000_000_000 });

  const customersRepository = new CustomersRepository();
  const customersService = new CustomersService(customersRepository);
  const invoicesRepository = new InvoicesRepository();
  const paymentsService = new PaymentsService(
    new PaymentsRepository(),
    invoicesRepository,
    customersService,
    eventsService,
    idempotencyService,
    approvalService,
    transactionManager
  );

  const arService = new ArService(new ArRepository(), eventsService);
  const arEventsHandler = new ArEventsHandler(processingRegistry, arService);
  arEventsHandler.onApplicationBootstrap();

  const worker = new EventProcessingWorker(queueDriver, processingRegistry, eventConsumerIdempotencyService);
  await worker.onApplicationBootstrap();

  const tenantId = 'tenant-ar';
  const customer = seedCustomer(customersRepository, tenantId);
  const invoice = seedIssuedInvoice(invoicesRepository, tenantId, customer.id, 1500);

  eventsService.logEvent({
    tenant_id: tenantId,
    type: 'billing.invoice.issued.v1',
    aggregate_type: 'invoice',
    aggregate_id: invoice.id,
    aggregate_version: 2,
    correlation_id: invoice.id,
    payload: {
      invoice_id: invoice.id,
      customer_id: customer.id,
      issue_date: invoice.issue_date,
      due_date: invoice.due_date,
      total_minor: invoice.total_minor,
      currency_code: invoice.currency
    }
  });

  await new Promise((resolve) => setTimeout(resolve, 20));

  const payment = await paymentsService.createPayment(
    tenantId,
    {
      customer_id: customer.id,
      payment_reference: 'PAY-AR-1',
      payment_date: '2026-03-11',
      currency: 'USD',
      amount_received_minor: 1500,
      payment_method: 'bank_transfer',
      allocations: []
    },
    'idem-ar-payment-create'
  );

  await paymentsService.allocatePayment(
    tenantId,
    payment.id,
    {
      allocations: [{ invoice_id: invoice.id, allocated_minor: 1500, allocation_date: '2026-03-11' }]
    },
    'idem-ar-payment-allocate'
  );

  await new Promise((resolve) => setTimeout(resolve, 20));

  const state = arService.getCustomerFinancialState(tenantId, customer.id);
  assert.equal(state.total_open_amount_minor, 0);
  assert.equal(state.total_paid_amount_minor, 1500);
  assert.equal(state.invoice_count_open, 0);
  assert.equal(state.invoice_count_total, 1);
  assert.equal(state.invoices[0].status, 'closed');

  const receivableUpdates = eventsService.listEvents(tenantId, { event_type: 'subledger.receivable.updated.v1' });
  assert.equal(receivableUpdates.length >= 2, true);

  await worker.onModuleDestroy();
});
