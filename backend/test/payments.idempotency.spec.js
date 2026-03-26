const test = require('node:test');
const assert = require('node:assert/strict');

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
const { FinancialTransactionManager } = require('../.tmp-test-dist/common/transactions/financial-transaction.manager');
const { ApprovalRepository } = require('../.tmp-test-dist/modules/approval/approval.repository');
const { ApprovalService } = require('../.tmp-test-dist/modules/approval/approval.service');

function createPaymentsService() {
  const paymentsRepository = new PaymentsRepository();
  const invoicesRepository = new InvoicesRepository();
  const customersRepository = new CustomersRepository();
  const customersService = new CustomersService(customersRepository);
  const eventsRepository = new EventsRepository();
  const idempotencyRepository = new IdempotencyRepository();
  const idempotencyService = new IdempotencyService(idempotencyRepository);
  const eventConsumerIdempotencyService = new EventConsumerIdempotencyService(idempotencyService);
  const queueDriver = new InMemoryQueueDriver();
  const eventQueuePublisher = new EventQueuePublisher(queueDriver);
  const eventsService = new EventsService(eventsRepository, eventConsumerIdempotencyService, eventQueuePublisher);
  const transactionManager = new FinancialTransactionManager();
  const approvalService = new ApprovalService(new ApprovalRepository());
  approvalService.configureThreshold('tenant-1', 'large_payment_exception', { requires_approval_over_minor: 1_000_000_000 });

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
    paymentsService,
    paymentsRepository,
    invoicesRepository,
    customersRepository,
    eventsRepository
  };
}

function seedCustomer(customersRepository, tenantId = 'tenant-1') {
  return customersRepository.create({
    tenant_id: tenantId,
    legal_name: 'Acme Corporation',
    display_name: 'Acme',
    email: 'billing@acme.test',
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
    invoice_number: `INV-${Math.random().toString(36).slice(2, 9)}`,
    status: 'issued',
    issue_date: '2026-03-01',
    due_date: '2026-03-31',
    currency: 'USD',
    subtotal_minor: totalMinor,
    tax_minor: 0,
    discount_minor: 0,
    total_minor: totalMinor,
    amount_paid_minor: 0,
    amount_due_minor: totalMinor,
    notes: null,
    issued_at: '2026-03-01T00:00:00.000Z',
    voided_at: null,
    subscription_id: null,
    metadata: null
  });
}

test('requires idempotency keys for payment creation and allocation', async () => {
  const { paymentsService, customersRepository } = createPaymentsService();
  const customer = seedCustomer(customersRepository);

  await assert.rejects(() => paymentsService.createPayment('tenant-1', {
    customer_id: customer.id,
    payment_reference: 'PAY-001',
    payment_date: '2026-03-25',
    currency: 'USD',
    amount_received_minor: 1000,
    payment_method: 'card',
    allocations: []
  }), /idempotency_key is required to create payment/);

  await assert.rejects(() => paymentsService.allocatePayment('tenant-1', 'missing-payment', {
    allocations: [{ invoice_id: 'inv-1', allocated_minor: 100 }]
  }), /idempotency_key is required to allocate payment/);
});

test('duplicate create-payment retries return same result and do not create duplicates', async () => {
  const { paymentsService, customersRepository, paymentsRepository } = createPaymentsService();
  const customer = seedCustomer(customersRepository);

  const payload = {
    customer_id: customer.id,
    payment_reference: 'PAY-UNIQ-1',
    payment_date: '2026-03-25',
    currency: 'USD',
    amount_received_minor: 1400,
    payment_method: 'bank_transfer',
    allocations: []
  };

  const first = await paymentsService.createPayment('tenant-1', payload, 'idem-create-1');
  const second = await paymentsService.createPayment('tenant-1', payload, 'idem-create-1');

  assert.equal(first.id, second.id);
  assert.deepEqual(first, second);
  assert.equal(paymentsRepository.listByTenant('tenant-1').length, 1);
});

test('concurrent create-payment retries are safe and return one payment', async () => {
  const { paymentsService, customersRepository, paymentsRepository } = createPaymentsService();
  const customer = seedCustomer(customersRepository);

  const payload = {
    customer_id: customer.id,
    payment_reference: 'PAY-UNIQ-2',
    payment_date: '2026-03-25',
    currency: 'USD',
    amount_received_minor: 2500,
    payment_method: 'ach',
    allocations: []
  };

  const [a, b, c] = await Promise.all([
    paymentsService.createPayment('tenant-1', payload, 'idem-create-2'),
    paymentsService.createPayment('tenant-1', payload, 'idem-create-2'),
    paymentsService.createPayment('tenant-1', payload, 'idem-create-2')
  ]);

  assert.equal(a.id, b.id);
  assert.equal(b.id, c.id);
  assert.equal(paymentsRepository.listByTenant('tenant-1').length, 1);
});

test('duplicate allocation retries return same result without duplicate allocations', async () => {
  const { paymentsService, customersRepository, invoicesRepository, paymentsRepository } = createPaymentsService();
  const customer = seedCustomer(customersRepository);
  const invoice = seedIssuedInvoice(invoicesRepository, 'tenant-1', customer.id, 900);
  const payment = await paymentsService.createPayment('tenant-1', {
    customer_id: customer.id,
    payment_reference: 'PAY-UNIQ-3',
    payment_date: '2026-03-25',
    currency: 'USD',
    amount_received_minor: 900,
    payment_method: 'card',
    allocations: []
  }, 'idem-create-3');

  const allocationPayload = {
    allocations: [{ invoice_id: invoice.id, allocated_minor: 600, allocation_date: '2026-03-25' }]
  };

  const first = await paymentsService.allocatePayment('tenant-1', payment.id, allocationPayload, 'idem-alloc-1');
  const second = await paymentsService.allocatePayment('tenant-1', payment.id, allocationPayload, 'idem-alloc-1');

  assert.equal(first.id, second.id);
  assert.equal(paymentsRepository.listAllocationsByPayment('tenant-1', payment.id).length, 1);
  assert.equal(second.allocated_minor, 600);
  assert.equal(second.unallocated_minor, 300);
});

test('concurrent allocation retries are safe and do not duplicate allocations', async () => {
  const { paymentsService, customersRepository, invoicesRepository, paymentsRepository } = createPaymentsService();
  const customer = seedCustomer(customersRepository);
  const invoice = seedIssuedInvoice(invoicesRepository, 'tenant-1', customer.id, 700);
  const payment = await paymentsService.createPayment('tenant-1', {
    customer_id: customer.id,
    payment_reference: 'PAY-UNIQ-4',
    payment_date: '2026-03-25',
    currency: 'USD',
    amount_received_minor: 700,
    payment_method: 'card',
    allocations: []
  }, 'idem-create-4');

  const allocationPayload = {
    allocations: [{ invoice_id: invoice.id, allocated_minor: 700, allocation_date: '2026-03-25' }]
  };

  const [a, b] = await Promise.all([
    paymentsService.allocatePayment('tenant-1', payment.id, allocationPayload, 'idem-alloc-2'),
    paymentsService.allocatePayment('tenant-1', payment.id, allocationPayload, 'idem-alloc-2')
  ]);

  assert.equal(a.id, b.id);
  assert.equal(paymentsRepository.listAllocationsByPayment('tenant-1', payment.id).length, 1);
  assert.equal(paymentsService.getPayment('tenant-1', payment.id).allocated_minor, 700);
});
