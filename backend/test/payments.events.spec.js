const test = require('node:test');
const assert = require('node:assert/strict');
const { FinancialTransactionManager } = require('../.tmp-test-dist/common/transactions/financial-transaction.manager');
const { ApprovalRepository } = require('../.tmp-test-dist/modules/approval/approval.repository');
const { ApprovalService } = require('../.tmp-test-dist/modules/approval/approval.service');
const { CustomersRepository } = require('../.tmp-test-dist/modules/customers/customers.repository');
const { CustomersService } = require('../.tmp-test-dist/modules/customers/customers.service');
const { EventBusService } = require('../.tmp-test-dist/modules/events/event-bus.service');
const { EventsRepository } = require('../.tmp-test-dist/modules/events/events.repository');
const { EventsService } = require('../.tmp-test-dist/modules/events/events.service');
const { InvoicesRepository } = require('../.tmp-test-dist/modules/invoices/invoices.repository');
const { PaymentsRepository } = require('../.tmp-test-dist/modules/payments/payments.repository');
const { PaymentsService } = require('../.tmp-test-dist/modules/payments/payments.service');
const { EventConsumerIdempotencyService } = require('../.tmp-test-dist/modules/idempotency/event-consumer-idempotency.service');
const { IdempotencyRepository } = require('../.tmp-test-dist/modules/idempotency/idempotency.repository');
const { IdempotencyService } = require('../.tmp-test-dist/modules/idempotency/idempotency.service');

function createPaymentsFixture() {
  const paymentsRepository = new PaymentsRepository();
  const invoicesRepository = new InvoicesRepository();
  const customersRepository = new CustomersRepository();
  const customersService = new CustomersService(customersRepository);
  const eventsRepository = new EventsRepository();
  const idempotencyRepository = new IdempotencyRepository();
  const idempotencyService = new IdempotencyService(idempotencyRepository);
  const eventConsumerIdempotencyService = new EventConsumerIdempotencyService(idempotencyService);
  const eventBusService = new EventBusService(eventsRepository, eventConsumerIdempotencyService);
  const eventsService = new EventsService(eventsRepository, eventConsumerIdempotencyService, eventBusService);
  const transactionManager = new FinancialTransactionManager();
  const approvalService = new ApprovalService(new ApprovalRepository());
  approvalService.configureThreshold('tenant-1', 'large_payment_exception', { requires_approval_over_minor: 1_000_000_000 });

  return {
    invoicesRepository,
    eventsRepository,
    customersService,
    paymentsService: new PaymentsService(
      paymentsRepository,
      invoicesRepository,
      customersService,
      eventsService,
      transactionManager
    )
  };
}

function seedCustomerAndIssuedInvoice(fixture, tenantId, currency = 'USD') {
  const customer = fixture.customersService.createCustomer(tenantId, {
    legal_name: 'Acme Corp',
    display_name: 'Acme',
    email: 'billing@acme.test',
    billing_country: 'US'
  });

  const invoice = fixture.invoicesRepository.create({
    tenant_id: tenantId,
    customer_id: customer.id,
    invoice_number: 'INV-1000',
    status: 'issued',
    issue_date: '2026-03-25',
    due_date: '2026-04-25',
    currency,
    subtotal_minor: 2000,
    tax_minor: 0,
    discount_minor: 0,
    total_minor: 2000,
    amount_paid_minor: 0,
    amount_due_minor: 2000,
    notes: null,
    issued_at: '2026-03-25T00:00:00.000Z',
    voided_at: null,
    subscription_id: null,
    metadata: null
  });

  return { customer, invoice };
}

test('emits payment received and allocation events after commit with normalized payloads', async () => {
  const tenantId = 'tenant-1';
  const fixture = createPaymentsFixture();
  const { customer, invoice } = seedCustomerAndIssuedInvoice(fixture, tenantId);

  const created = await fixture.paymentsService.createPayment(
    tenantId,
    {
      customer_id: customer.id,
      payment_reference: 'PAY-1000',
      payment_date: '2026-03-25',
      currency: 'USD',
      amount_received_minor: 1200,
      payment_method: 'bank_transfer',
      allocations: [{ invoice_id: invoice.id, allocated_minor: 1200, allocation_date: '2026-03-25' }]
    },
    'idem-payment-create'
  );

  const financialEvents = fixture.eventsRepository
    .listByTenant(tenantId, {})
    .filter((event) => event.event_category === 'financial')
    .sort((left, right) => left.recorded_at.localeCompare(right.recorded_at));

  assert.equal(created.allocations.length, 1);
  assert.deepEqual(
    financialEvents.map((event) => [event.type, event.action]),
    [
      ['billing.payment.recorded.v1', 'received'],
      ['billing.payment.allocated.v1', 'allocated']
    ]
  );

  const recordedPayload = financialEvents[0].payload;
  assert.equal(recordedPayload.payment_id, created.id);
  assert.equal(recordedPayload.customer_id, customer.id);
  assert.equal(recordedPayload.amount_minor, 1200);
  assert.equal(recordedPayload.currency_code, 'USD');

  const allocatedPayload = financialEvents[1].payload;
  assert.equal(allocatedPayload.payment_id, created.id);
  assert.equal(allocatedPayload.customer_id, customer.id);
  assert.equal(allocatedPayload.amount_minor, 1200);
  assert.equal(allocatedPayload.allocation_count, 1);
  assert.equal(allocatedPayload.total_allocated_minor, 1200);
  assert.equal(allocatedPayload.currency_code, 'USD');
});

test('does not emit payment received event when create payment transaction rolls back', async () => {
  const tenantId = 'tenant-2';
  const fixture = createPaymentsFixture();
  const { customer } = seedCustomerAndIssuedInvoice(fixture, tenantId);

  await assert.rejects(
    () =>
      fixture.paymentsService.createPayment(tenantId, {
        customer_id: customer.id,
        payment_reference: 'PAY-ROLLBACK',
        payment_date: '2026-03-25',
        currency: 'USD',
        amount_received_minor: 1000,
        payment_method: 'bank_transfer',
        allocations: [{ invoice_id: 'missing-invoice-id', allocated_minor: 500, allocation_date: '2026-03-25' }]
      }),
    /Invoice not found/
  );

  const financialEvents = fixture.eventsRepository.listByTenant(tenantId, {}).filter((event) => event.event_category === 'financial');
  assert.equal(financialEvents.length, 0);
});
