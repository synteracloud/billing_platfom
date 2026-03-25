import assert from 'assert';
import { FinancialTransactionManager } from '../src/common/transactions/financial-transaction.manager';
import { CustomersRepository } from '../src/modules/customers/customers.repository';
import { CustomersService } from '../src/modules/customers/customers.service';
import { EventConsumerIdempotencyService } from '../src/modules/idempotency/event-consumer-idempotency.service';
import { IdempotencyRepository } from '../src/modules/idempotency/idempotency.repository';
import { IdempotencyService } from '../src/modules/idempotency/idempotency.service';
import { EventsRepository } from '../src/modules/events/events.repository';
import { EventsService } from '../src/modules/events/events.service';
import { EventQueuePublisher } from '../src/modules/events/queue/event-queue.publisher';
import { InMemoryQueueDriver } from '../src/modules/events/queue/in-memory-queue.driver';
import { InvoicesRepository } from '../src/modules/invoices/invoices.repository';
import { InvoicesService } from '../src/modules/invoices/invoices.service';
import { LedgerRepository } from '../src/modules/ledger/ledger.repository';
import { LedgerService } from '../src/modules/ledger/ledger.service';
import { PaymentsRepository } from '../src/modules/payments/payments.repository';
import { PaymentsService } from '../src/modules/payments/payments.service';

async function main() {
  const idempotencyRepository = new IdempotencyRepository();
  const idempotencyService = new IdempotencyService(idempotencyRepository);
  const eventConsumerIdempotencyService = new EventConsumerIdempotencyService(idempotencyService);
  const eventsRepository = new EventsRepository();
  const eventQueuePublisher = new EventQueuePublisher(new InMemoryQueueDriver());
  const eventsService = new EventsService(eventsRepository, eventConsumerIdempotencyService, eventQueuePublisher);
  const transactionManager = new FinancialTransactionManager();
  const customersService = new CustomersService(new CustomersRepository());
  const invoicesRepository = new InvoicesRepository();
  const paymentsRepository = new PaymentsRepository();
  const invoicesService = new InvoicesService(invoicesRepository, customersService, eventsService, transactionManager);
  const paymentsService = new PaymentsService(paymentsRepository, invoicesRepository, customersService, eventsService, transactionManager);
  const ledgerService = new LedgerService(new LedgerRepository(), eventsService, transactionManager);

  const tenantId = 'tenant-audit';
  const customer = customersService.createCustomer(tenantId, {
    legal_name: 'Traceable Customer LLC',
    email: 'trace@example.com',
    billing_country: 'US'
  });

  const invoice = await invoicesService.createInvoice(tenantId, {
    customer_id: customer.id,
    currency: 'USD',
    lines: [
      {
        description: 'Implementation services',
        quantity: 1,
        unit_price_minor: 5000
      }
    ]
  }, 'invoice-create');

  const issuedInvoice = await invoicesService.issueInvoice(tenantId, invoice.id, 'invoice-issue');
  const invoiceIssueEvent = eventsService.listEvents(tenantId, { event_type: 'billing.invoice.issued.v1', entity_id: invoice.id })[0];
  assert(invoiceIssueEvent, 'invoice issue event should exist');

  const invoiceJournal = await ledgerService.postEvent(tenantId, invoiceIssueEvent.id, 'ledger-post-invoice');
  assert.equal(invoiceJournal.source_id, issuedInvoice.id);

  const payment = await paymentsService.createPayment(tenantId, {
    customer_id: customer.id,
    payment_date: '2024-01-10',
    currency: 'USD',
    amount_received_minor: 5000,
    payment_method: 'bank_transfer'
  }, 'payment-create');

  const settledEvent = eventsService.logEvent({
    tenant_id: tenantId,
    type: 'billing.payment.settled.v1',
    aggregate_type: 'payment',
    aggregate_id: payment.id,
    aggregate_version: 2,
    correlation_id: payment.id,
    causation_id: eventsService.listEvents(tenantId, { event_type: 'billing.payment.recorded.v1', entity_id: payment.id })[0].id,
    idempotency_key: 'payment-settled',
    payload: {
      payment_id: payment.id,
      settled_at: '2024-01-10T00:00:00.000Z',
      amount_minor: payment.amount_received_minor,
      currency_code: payment.currency
    }
  });

  await paymentsService.allocatePayment(tenantId, payment.id, {
    allocations: [{ invoice_id: invoice.id, allocated_minor: 5000, allocation_date: '2024-01-10' }]
  }, 'payment-allocate');

  const paymentJournal = await ledgerService.postEvent(tenantId, settledEvent.id, 'ledger-post-payment');
  assert.equal(paymentJournal.source_id, payment.id);

  const allEvents = eventsService.listEvents(tenantId, {});
  const auditEvents = allEvents.filter((event) => event.event_category === 'audit');
  const invoiceEvents = allEvents.filter((event) => event.correlation_id === invoice.id || event.entity_id === invoice.id);
  const paymentEvents = allEvents.filter((event) => event.correlation_id === payment.id || event.entity_id === payment.id);

  assert(auditEvents.length >= 7, 'expected audit mutation coverage for invoice, payment, allocations, and ledger');
  assert(invoiceEvents.some((event) => event.event_type === 'audit.invoice.created.v1'));
  assert(invoiceEvents.some((event) => event.event_type === 'billing.invoice.issued.v1'));
  assert(invoiceEvents.some((event) => event.event_type === 'accounting.journal.posted.v1' && (event.payload as { source_id?: string }).source_id === invoice.id));
  assert(paymentEvents.some((event) => event.event_type === 'audit.payment.created.v1'));
  assert(paymentEvents.some((event) => event.event_type === 'audit.payment_allocation.created.v1'));
  assert(paymentEvents.some((event) => event.event_type === 'billing.payment.allocated.v1'));
  assert(paymentEvents.some((event) => event.event_type === 'accounting.journal.posted.v1' && (event.payload as { source_id?: string }).source_id === payment.id));

  const immutableAudit = auditEvents[0];
  assert(Object.isFrozen(eventsRepository.createSnapshot().events.get(immutableAudit.id)), 'stored audit events must be immutable');
  assert.equal(immutableAudit.actor_type, 'system');
  assert.equal((immutableAudit.payload as { actor: { type: string } }).actor.type, 'system');
  assert.equal((immutableAudit.payload as { entity: { id: string } }).entity.id, immutableAudit.entity_id);

  console.log('audit chain test passed');
}

main().catch((error) => {
  console.error(error);
  process.exitCode = 1;
});
