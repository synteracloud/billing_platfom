import assert from 'assert';
import { FinancialTransactionManager } from '../src/common/transactions/financial-transaction.manager';
import { CustomersRepository } from '../src/modules/customers/customers.repository';
import { CustomersService } from '../src/modules/customers/customers.service';
import { DocumentsRepository } from '../src/modules/documents/documents.repository';
import { DocumentsService } from '../src/modules/documents/documents.service';
import { EmailService } from '../src/modules/documents/email.service';
import { PdfService } from '../src/modules/documents/pdf.service';
import { EventConsumerIdempotencyService } from '../src/modules/idempotency/event-consumer-idempotency.service';
import { IdempotencyRepository } from '../src/modules/idempotency/idempotency.repository';
import { IdempotencyService } from '../src/modules/idempotency/idempotency.service';
import { EventsRepository } from '../src/modules/events/events.repository';
import { EventsService } from '../src/modules/events/events.service';
import { InvoicesRepository } from '../src/modules/invoices/invoices.repository';
import { InvoicesService } from '../src/modules/invoices/invoices.service';
import { PaymentsRepository } from '../src/modules/payments/payments.repository';
import { PaymentsService } from '../src/modules/payments/payments.service';
import { TenantEntity } from '../src/modules/tenants/entity/tenant.entity';

async function main() {
  const idempotencyRepository = new IdempotencyRepository();
  const idempotencyService = new IdempotencyService(idempotencyRepository);
  const eventConsumerIdempotencyService = new EventConsumerIdempotencyService(idempotencyService);
  const eventsService = new EventsService(new EventsRepository(), eventConsumerIdempotencyService);
  const transactionManager = new FinancialTransactionManager();
  const customersService = new CustomersService(new CustomersRepository());
  const invoicesRepository = new InvoicesRepository();
  const invoicesService = new InvoicesService(invoicesRepository, customersService, eventsService, transactionManager);
  const paymentsService = new PaymentsService(new PaymentsRepository(), invoicesRepository, customersService, eventsService, transactionManager);
  const documentsRepository = new DocumentsRepository();
  const tenantRecord: TenantEntity = {
    id: 'tenant-invoice-events',
    name: 'Invoice Events Tenant',
    created_at: new Date().toISOString(),
    updated_at: new Date().toISOString()
  };
  const tenantsService = {
    getTenant: () => tenantRecord
  };
  const documentsService = new DocumentsService(
    documentsRepository,
    invoicesService,
    customersService,
    tenantsService as never,
    eventsService,
    new PdfService(documentsRepository),
    new EmailService()
  );

  const tenantId = tenantRecord.id;
  const customer = customersService.createCustomer(tenantId, {
    legal_name: 'Invoice Event Customer LLC',
    email: 'invoice-events@example.com',
    billing_country: 'US'
  });

  const invoice = await invoicesService.createInvoice(tenantId, {
    customer_id: customer.id,
    currency: 'USD',
    lines: [{ description: 'Implementation', quantity: 1, unit_price_minor: 2200 }]
  }, 'create-invoice-event');

  const invoiceCreatedEvents = eventsService.listEvents(tenantId, { event_type: 'billing.invoice.created.v1', entity_id: invoice.id });
  assert.equal(invoiceCreatedEvents.length, 1, 'create should emit exactly one billing.invoice.created.v1 event');
  assert.equal((invoiceCreatedEvents[0].payload as { invoice_id: string }).invoice_id, invoice.id);

  await documentsService.sendInvoice(tenantId, invoice.id, {});
  const invoiceSentEvents = eventsService.listEvents(tenantId, { event_type: 'billing.invoice.sent.v1', entity_id: invoice.id });
  assert.equal(invoiceSentEvents.length, 1, 'send should emit exactly one billing.invoice.sent.v1 event');
  assert.equal((invoiceSentEvents[0].payload as { invoice_id: string }).invoice_id, invoice.id);
  assert.equal((invoiceSentEvents[0].payload as { customer_id: string }).customer_id, customer.id);
  assert.equal((invoiceSentEvents[0].payload as { currency_code: string }).currency_code, invoice.currency);

  await invoicesService.issueInvoice(tenantId, invoice.id, 'issue-before-pay');
  const payment = await paymentsService.createPayment(tenantId, {
    customer_id: customer.id,
    payment_date: '2026-02-01',
    currency: 'USD',
    amount_received_minor: invoice.total_minor,
    payment_method: 'bank_transfer'
  }, 'create-payment-for-paid-event');

  await paymentsService.allocatePayment(tenantId, payment.id, {
    allocations: [{ invoice_id: invoice.id, allocated_minor: invoice.total_minor }]
  }, 'allocate-payment-to-full');

  const invoicePaidEvents = eventsService.listEvents(tenantId, { event_type: 'billing.invoice.paid.v1', entity_id: invoice.id });
  assert.equal(invoicePaidEvents.length, 1, 'pay should emit exactly one billing.invoice.paid.v1 event');
  assert.equal((invoicePaidEvents[0].payload as { amount_due_minor: number }).amount_due_minor, 0);
  assert.equal((invoicePaidEvents[0].payload as { payment_status: string }).payment_status, 'paid');
  assert.equal((invoicePaidEvents[0].payload as { currency_code: string }).currency_code, 'USD');

  console.log('invoice events lifecycle test passed');
}

main().catch((error) => {
  console.error(error);
  process.exitCode = 1;
});
