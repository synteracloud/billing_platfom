const test = require('node:test');
const assert = require('node:assert/strict');

const { EventProcessingRegistry } = require('../.tmp-test-dist/modules/events/queue/event-processing.registry');
const { CustomerBalanceRepository } = require('../.tmp-test-dist/modules/customers/customer-balance.repository');
const { CustomerBalanceService } = require('../.tmp-test-dist/modules/customers/customer-balance.service');
const { CustomerBalanceEventsConsumer } = require('../.tmp-test-dist/modules/customers/customer-balance-events.consumer');

function envelope(overrides) {
  return {
    event_id: 'evt-1',
    event_name: 'billing.invoice.created.v1',
    event_version: 1,
    occurred_at: '2026-03-25T00:00:00.000Z',
    recorded_at: '2026-03-25T00:00:00.000Z',
    tenant_id: 'tenant-1',
    aggregate_type: 'invoice',
    aggregate_id: 'invoice-1',
    aggregate_version: 1,
    causation_id: null,
    correlation_id: null,
    idempotency_key: 'idem-evt-1',
    producer: 'test-suite',
    payload: {},
    ...overrides
  };
}

function setup() {
  const registry = new EventProcessingRegistry();
  const balanceRepository = new CustomerBalanceRepository();
  const balanceService = new CustomerBalanceService(balanceRepository);
  const consumer = new CustomerBalanceEventsConsumer(registry, balanceService);
  consumer.onApplicationBootstrap();

  return { registry, balanceService };
}

test('applies invoice.created and payment.received deltas to customer_balance', async () => {
  const { registry, balanceService } = setup();

  const invoiceEvent = envelope({
    event_name: 'invoice.created',
    event_id: 'evt-inv-1',
    payload: {
      customer_id: 'cust-1',
      total_minor: 1000
    }
  });

  const paymentEvent = envelope({
    event_name: 'payment.received',
    event_id: 'evt-pay-1',
    aggregate_type: 'payment',
    aggregate_id: 'payment-1',
    payload: {
      customer_id: 'cust-1',
      amount_minor: 400
    }
  });

  for (const handler of registry.getHandlers('invoice.created')) {
    await handler.handle(invoiceEvent);
  }

  for (const handler of registry.getHandlers('payment.received')) {
    await handler.handle(paymentEvent);
  }

  assert.equal(balanceService.getBalance('tenant-1', 'cust-1'), 600);
});

test('duplicate events do not double-apply customer balance changes', async () => {
  const { registry, balanceService } = setup();

  const invoiceEvent = envelope({
    event_name: 'billing.invoice.created.v1',
    event_id: 'evt-dup-inv',
    payload: {
      customer_id: 'cust-dup',
      total_minor: 750
    }
  });

  const paymentEvent = envelope({
    event_name: 'billing.payment.recorded.v1',
    event_id: 'evt-dup-pay',
    aggregate_type: 'payment',
    aggregate_id: 'payment-dup',
    payload: {
      customer_id: 'cust-dup',
      amount_minor: 250
    }
  });

  for (const handler of registry.getHandlers('billing.invoice.created.v1')) {
    await handler.handle(invoiceEvent);
    await handler.handle(invoiceEvent);
  }

  for (const handler of registry.getHandlers('billing.payment.recorded.v1')) {
    await handler.handle(paymentEvent);
    await handler.handle(paymentEvent);
  }

  assert.equal(balanceService.getBalance('tenant-1', 'cust-dup'), 500);
});
