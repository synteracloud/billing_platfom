import assert from 'assert';
import { ConflictException } from '@nestjs/common';
import { FinancialTransactionManager } from '../src/common/transactions/financial-transaction.manager';
import { CustomersRepository } from '../src/modules/customers/customers.repository';
import { CustomersService } from '../src/modules/customers/customers.service';
import { EventConsumerIdempotencyService } from '../src/modules/idempotency/event-consumer-idempotency.service';
import { IdempotencyRepository } from '../src/modules/idempotency/idempotency.repository';
import { IdempotencyService } from '../src/modules/idempotency/idempotency.service';
import { EventsRepository } from '../src/modules/events/events.repository';
import { EventsService } from '../src/modules/events/events.service';
import { InvoicesRepository } from '../src/modules/invoices/invoices.repository';
import { InvoicesService } from '../src/modules/invoices/invoices.service';
import { PaymentsRepository } from '../src/modules/payments/payments.repository';
import { PaymentsService } from '../src/modules/payments/payments.service';

async function main() {
  const idempotencyRepository = new IdempotencyRepository();
  const idempotencyService = new IdempotencyService(idempotencyRepository);
  const eventConsumerIdempotencyService = new EventConsumerIdempotencyService(idempotencyService);
  const eventsRepository = new EventsRepository();
  const eventsService = new EventsService(eventsRepository, eventConsumerIdempotencyService);
  const transactionManager = new FinancialTransactionManager();
  const customersService = new CustomersService(new CustomersRepository());
  const invoicesRepository = new InvoicesRepository();
  const paymentsRepository = new PaymentsRepository();
  const invoicesService = new InvoicesService(invoicesRepository, customersService, eventsService, transactionManager);
  const paymentsService = new PaymentsService(paymentsRepository, invoicesRepository, customersService, eventsService, transactionManager);

  const tenantId = 'tenant-lifecycle';
  const customer = customersService.createCustomer(tenantId, {
    legal_name: 'Lifecycle Customer',
    email: 'lifecycle@example.com',
    billing_country: 'US'
  });

  const invoice = await invoicesService.createInvoice(tenantId, {
    customer_id: customer.id,
    currency: 'USD',
    lines: [{ description: 'Lifecycle line', quantity: 1, unit_price_minor: 1200 }]
  }, 'invoice-create');

  const issued = await invoicesService.issueInvoice(tenantId, invoice.id, 'invoice-issue');
  assert.equal(issued.status, 'issued');

  await assert.rejects(
    async () => invoicesService.issueInvoice(tenantId, invoice.id, 'invoice-reissue'),
    (error: unknown) => error instanceof ConflictException
  );

  const voidCandidate = await invoicesService.createInvoice(tenantId, {
    customer_id: customer.id,
    currency: 'USD',
    lines: [{ description: 'Void lifecycle line', quantity: 1, unit_price_minor: 500 }]
  }, 'invoice-void-create');
  await invoicesService.issueInvoice(tenantId, voidCandidate.id, 'invoice-void-issue');
  const voided = await invoicesService.voidInvoice(tenantId, voidCandidate.id, 'invoice-void');
  assert.equal(voided.status, 'void');
  await assert.rejects(
    async () => invoicesService.issueInvoice(tenantId, voidCandidate.id, 'invoice-issue-after-void'),
    (error: unknown) => error instanceof ConflictException
  );

  const payment = await paymentsService.createPayment(tenantId, {
    customer_id: customer.id,
    payment_date: '2025-01-10',
    currency: 'USD',
    amount_received_minor: 1200,
    payment_method: 'bank_transfer'
  }, 'payment-create');

  await paymentsService.allocatePayment(tenantId, payment.id, {
    allocations: [{ invoice_id: invoice.id, allocated_minor: 1200, allocation_date: '2025-01-10' }]
  }, 'payment-allocate');

  const paidInvoice = invoicesService.getInvoice(tenantId, invoice.id);
  assert.equal(paidInvoice.status, 'paid');
  assert.equal(paidInvoice.amount_due_minor, 0);

  const paidEvent = eventsService.listEvents(tenantId, { event_type: 'billing.invoice.paid.v1', entity_id: invoice.id })[0];
  assert(paidEvent, 'invoice paid state must be driven by billing.invoice.paid.v1 event');
  assert.equal((paidEvent.payload as { payment_id: string }).payment_id, payment.id);

  console.log('invoice lifecycle test passed');
}

main().catch((error) => {
  console.error(error);
  process.exitCode = 1;
});
