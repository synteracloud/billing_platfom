const test = require('node:test');
const assert = require('node:assert/strict');

const { CustomersRepository } = require('../.tmp-test-dist/modules/customers/customers.repository');
const { CustomersService } = require('../.tmp-test-dist/modules/customers/customers.service');
const { CustomerBalanceRepository } = require('../.tmp-test-dist/modules/customers/customer-balance.repository');
const { CustomerBalanceService } = require('../.tmp-test-dist/modules/customers/customer-balance.service');
const { CustomerBalanceEventsConsumer } = require('../.tmp-test-dist/modules/customers/customer-balance-events.consumer');
const { InvoicesRepository } = require('../.tmp-test-dist/modules/invoices/invoices.repository');
const { PaymentsRepository } = require('../.tmp-test-dist/modules/payments/payments.repository');
const { IdempotencyRepository } = require('../.tmp-test-dist/modules/idempotency/idempotency.repository');
const { IdempotencyService } = require('../.tmp-test-dist/modules/idempotency/idempotency.service');
const { EventConsumerIdempotencyService } = require('../.tmp-test-dist/modules/idempotency/event-consumer-idempotency.service');
const { EventsRepository } = require('../.tmp-test-dist/modules/events/events.repository');
const { EventsService } = require('../.tmp-test-dist/modules/events/events.service');
const { EventProcessingRegistry } = require('../.tmp-test-dist/modules/events/queue/event-processing.registry');
const { EventProcessingWorker } = require('../.tmp-test-dist/modules/events/queue/event-processing.worker');
const { EventQueuePublisher } = require('../.tmp-test-dist/modules/events/queue/event-queue.publisher');
const { InMemoryQueueDriver } = require('../.tmp-test-dist/modules/events/queue/in-memory-queue.driver');
const { FinancialTransactionManager } = require('../.tmp-test-dist/common/transactions/financial-transaction.manager');
const { LedgerRepository } = require('../.tmp-test-dist/modules/ledger/ledger.repository');
const { LedgerService } = require('../.tmp-test-dist/modules/ledger/ledger.service');
const { LedgerInvoiceCreatedConsumer } = require('../.tmp-test-dist/modules/ledger/ledger-invoice-created.consumer');
const { PaymentReceivedLedgerConsumer } = require('../.tmp-test-dist/modules/ledger/payment-received-ledger.consumer');

function createFixture() {
  const queueDriver = new InMemoryQueueDriver();
  const processingRegistry = new EventProcessingRegistry();
  const idempotencyService = new IdempotencyService(new IdempotencyRepository());
  const eventConsumerIdempotencyService = new EventConsumerIdempotencyService(idempotencyService);
  const eventsService = new EventsService(new EventsRepository(), eventConsumerIdempotencyService, new EventQueuePublisher(queueDriver));

  const customersService = new CustomersService(new CustomersRepository());
  const invoicesRepository = new InvoicesRepository();
  const paymentsRepository = new PaymentsRepository();

  const ledgerRepository = new LedgerRepository();
  const ledgerService = new LedgerService(ledgerRepository, eventsService, new FinancialTransactionManager());
  new LedgerInvoiceCreatedConsumer(processingRegistry, ledgerService).onApplicationBootstrap();
  new PaymentReceivedLedgerConsumer(processingRegistry, ledgerService).onApplicationBootstrap();

  const balanceService = new CustomerBalanceService(new CustomerBalanceRepository());
  new CustomerBalanceEventsConsumer(processingRegistry, balanceService).onApplicationBootstrap();

  const worker = new EventProcessingWorker(queueDriver, processingRegistry, eventConsumerIdempotencyService);

  return {
    customersService,
    invoicesRepository,
    paymentsRepository,
    eventsService,
    balanceService,
    ledgerRepository,
    worker,
    processingRegistry
  };
}

function computeLedgerArForCustomer(tenantId, customerId, ledgerRepository, invoicesRepository, paymentsRepository) {
  const entries = ledgerRepository.listEntries(tenantId);
  return entries.reduce((sum, entry) => {
    const relatedCustomer = entry.source_type === 'invoice'
      ? invoicesRepository.findById(tenantId, entry.source_id)?.customer_id
      : paymentsRepository.findById(tenantId, entry.source_id)?.customer_id;

    if (relatedCustomer !== customerId) {
      return sum;
    }

    return sum + entry.lines.reduce((lineSum, line) => {
      if (line.account_code !== '1100') {
        return lineSum;
      }

      return lineSum + (line.direction === 'debit' ? line.amount_minor : -line.amount_minor);
    }, 0);
  }, 0);
}

test('batch 6 qc: AR/customer balance remains event-derived, idempotent, and reconciles to ledger AR', async () => {
  const fixture = createFixture();
  await fixture.worker.onApplicationBootstrap();

  const tenantId = 'tenant-b6';
  const customer = fixture.customersService.createCustomer(tenantId, {
    legal_name: 'Batch Six Customer',
    email: 'batch6@example.com',
    billing_country: 'US'
  });

  const invoice = fixture.invoicesRepository.create({
    tenant_id: tenantId,
    customer_id: customer.id,
    subscription_id: null,
    invoice_number: 'INV-B6-1',
    status: 'issued',
    issue_date: '2026-03-01',
    due_date: '2026-03-15',
    currency: 'USD',
    subtotal_minor: 1000,
    tax_minor: 0,
    discount_minor: 0,
    total_minor: 1000,
    amount_paid_minor: 0,
    amount_due_minor: 1000,
    notes: null,
    issued_at: '2026-03-01T00:00:00.000Z',
    voided_at: null,
    metadata: null
  });

  fixture.eventsService.logEvent({
    tenant_id: tenantId,
    type: 'billing.invoice.created.v1',
    aggregate_type: 'invoice',
    aggregate_id: invoice.id,
    aggregate_version: 1,
    idempotency_key: 'b6-invoice-created',
    payload: {
      invoice_id: invoice.id,
      customer_id: customer.id,
      invoice_number: invoice.invoice_number,
      status: invoice.status,
      total_minor: invoice.total_minor,
      currency_code: invoice.currency
    }
  });

  await new Promise((resolve) => setTimeout(resolve, 20));
  assert.equal(fixture.balanceService.getBalance(tenantId, customer.id), 1000);

  const payment = fixture.paymentsRepository.create({
    tenant_id: tenantId,
    customer_id: customer.id,
    payment_reference: 'PAY-B6-1',
    payment_date: '2026-03-02',
    currency: 'USD',
    amount_received_minor: 400,
    allocated_minor: 0,
    unallocated_minor: 400,
    payment_method: 'ach',
    status: 'recorded',
    metadata: null
  });

  fixture.eventsService.logEvent({
    tenant_id: tenantId,
    type: 'billing.payment.recorded.v1',
    aggregate_type: 'payment',
    aggregate_id: payment.id,
    aggregate_version: 1,
    idempotency_key: 'b6-payment-recorded',
    payload: {
      payment_id: payment.id,
      customer_id: customer.id,
      amount_minor: 400,
      currency_code: 'USD',
      status: 'recorded'
    }
  });

  await new Promise((resolve) => setTimeout(resolve, 20));
  assert.equal(fixture.balanceService.getBalance(tenantId, customer.id), 1000);

  const duplicateEvent = {
    event_id: 'evt-b6-dupe',
    event_name: 'billing.payment.recorded.v1',
    event_version: 1,
    occurred_at: '2026-03-02T00:00:00.000Z',
    recorded_at: '2026-03-02T00:00:00.000Z',
    tenant_id: tenantId,
    aggregate_type: 'payment',
    aggregate_id: payment.id,
    aggregate_version: 1,
    causation_id: null,
    correlation_id: null,
    idempotency_key: 'dup-key',
    producer: 'test-suite',
    payload: { customer_id: customer.id, amount_minor: 400 }
  };

  for (const handler of fixture.processingRegistry.getHandlers('billing.payment.recorded.v1')) {
    if (handler.name !== 'ar-customer-balance') {
      continue;
    }

    await handler.handle(duplicateEvent);
    await handler.handle(duplicateEvent);
  }

  assert.equal(fixture.balanceService.getBalance(tenantId, customer.id), 1000);

  const ledgerAr = computeLedgerArForCustomer(
    tenantId,
    customer.id,
    fixture.ledgerRepository,
    fixture.invoicesRepository,
    fixture.paymentsRepository
  );

  assert.equal(ledgerAr, fixture.balanceService.getBalance(tenantId, customer.id));

  await fixture.worker.onModuleDestroy();
});
