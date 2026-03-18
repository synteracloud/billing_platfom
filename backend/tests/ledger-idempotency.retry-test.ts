import assert from 'assert';
import { FinancialTransactionManager } from '../src/common/transactions/financial-transaction.manager';
import { EventConsumerIdempotencyService } from '../src/modules/idempotency/event-consumer-idempotency.service';
import { IdempotencyRepository } from '../src/modules/idempotency/idempotency.repository';
import { IdempotencyService } from '../src/modules/idempotency/idempotency.service';
import { EventsRepository } from '../src/modules/events/events.repository';
import { EventsService } from '../src/modules/events/events.service';
import { LedgerRepository } from '../src/modules/ledger/ledger.repository';
import { LedgerService } from '../src/modules/ledger/ledger.service';

async function main() {
  const idempotencyRepository = new IdempotencyRepository();
  const idempotencyService = new IdempotencyService(idempotencyRepository);
  const eventConsumerIdempotencyService = new EventConsumerIdempotencyService(idempotencyService);
  const eventsRepository = new EventsRepository();
  const eventsService = new EventsService(eventsRepository, eventConsumerIdempotencyService);
  const ledgerRepository = new LedgerRepository();
  const transactionManager = new FinancialTransactionManager();
  const ledgerService = new LedgerService(ledgerRepository, eventsService, transactionManager);

  const invoiceIssued = eventsService.logEvent({
    tenant_id: 'tenant-1',
    type: 'billing.invoice.issued.v1',
    aggregate_type: 'invoice',
    aggregate_id: 'invoice-1',
    aggregate_version: 1,
    idempotency_key: 'invoice-issue-key',
    payload: {
      invoice_id: 'invoice-1',
      issue_date: '2024-01-01',
      due_date: '2024-02-01',
      total_minor: 1200,
      currency_code: 'USD'
    }
  });

  const first = await ledgerService.postEvent('tenant-1', invoiceIssued.id, 'post-key');
  const second = await ledgerService.postEvent('tenant-1', invoiceIssued.id, 'post-key');
  const third = await ledgerService.postEvent('tenant-1', invoiceIssued.id, 'different-retry-key');

  assert.equal(first.id, second.id);
  assert.equal(second.id, third.id);
  assert.equal(first.lines.length, 2);
  assert.equal(eventsService.listEvents('tenant-1', {}).filter((item: { type: string }) => item.type === 'accounting.journal.posted.v1').length, 1);
  assert.equal(ledgerRepository.findBySourceEvent('tenant-1', invoiceIssued.id, '1')?.id, first.id);

  let duplicateHandlerExecutions = 0;
  const duplicateRunOne = await eventsService.consumeEventOnce('tenant-1', 'duplicate-check', invoiceIssued.id, async () => {
    duplicateHandlerExecutions += 1;
    return { execution: duplicateHandlerExecutions, journal_entry_id: first.id };
  });
  const duplicateRunTwo = await eventsService.consumeEventOnce('tenant-1', 'duplicate-check', invoiceIssued.id, async () => {
    duplicateHandlerExecutions += 1;
    return { execution: duplicateHandlerExecutions, journal_entry_id: 'should-not-run' };
  });

  assert.equal(duplicateHandlerExecutions, 1);
  assert.deepEqual(duplicateRunOne, duplicateRunTwo);
  assert.equal(duplicateRunTwo?.journal_entry_id, first.id);

  const paymentSettled = eventsService.logEvent({
    tenant_id: 'tenant-1',
    type: 'billing.payment.settled.v1',
    aggregate_type: 'payment',
    aggregate_id: 'payment-1',
    aggregate_version: 2,
    idempotency_key: 'payment-settled-key',
    payload: {
      payment_id: 'payment-1',
      settled_at: '2024-01-02T00:00:00.000Z',
      amount_minor: 1200,
      currency_code: 'USD'
    }
  });

  const paymentEntry = await ledgerService.postEvent('tenant-1', paymentSettled.id, 'payment-post-key');
  const paymentEntryRetry = await ledgerService.postEvent('tenant-1', paymentSettled.id, 'payment-post-key-retry');

  assert.equal(paymentEntry.id, paymentEntryRetry.id);
  assert.equal(eventsService.listEvents('tenant-1', {}).filter((item: { type: string }) => item.type === 'accounting.journal.posted.v1').length, 2);

  const invoiceCreated = eventsService.logEvent({
    tenant_id: 'tenant-1',
    type: 'billing.invoice.created.v1',
    aggregate_type: 'invoice',
    aggregate_id: 'invoice-2',
    aggregate_version: 1,
    idempotency_key: 'invoice-2-created-key',
    payload: {
      invoice_id: 'invoice-2',
      customer_id: 'customer-1',
      invoice_number: 'INV-2',
      status: 'draft',
      total_minor: 500,
      currency_code: 'USD'
    }
  });
  const invoiceIssuedOutOfOrder = eventsService.logEvent({
    tenant_id: 'tenant-1',
    type: 'billing.invoice.issued.v1',
    aggregate_type: 'invoice',
    aggregate_id: 'invoice-2',
    aggregate_version: 2,
    idempotency_key: 'invoice-2-issued-key',
    payload: {
      invoice_id: 'invoice-2',
      issue_date: '2024-01-03',
      due_date: '2024-02-03',
      total_minor: 500,
      currency_code: 'USD'
    }
  });

  const outOfOrderPosted = await ledgerService.postEvent('tenant-1', invoiceIssuedOutOfOrder.id, 'invoice-2-out-of-order');
  let unsupportedEventMessage = '';
  try {
    await ledgerService.postEvent('tenant-1', invoiceCreated.id, 'invoice-2-created-attempt');
  } catch (error) {
    unsupportedEventMessage = (error as Error).message;
  }

  assert.match(unsupportedEventMessage, /Unsupported event_name/);
  const outOfOrderRetry = await ledgerService.postEvent('tenant-1', invoiceIssuedOutOfOrder.id, 'invoice-2-out-of-order-retry');
  assert.equal(outOfOrderPosted.id, outOfOrderRetry.id);
  assert.equal(eventsService.listEvents('tenant-1', {}).filter((item: { type: string }) => item.type === 'accounting.journal.posted.v1').length, 3);

  const otherEvent = eventsService.logEvent({
    tenant_id: 'tenant-1',
    type: 'billing.payment.settled.v1',
    aggregate_type: 'payment',
    aggregate_id: 'payment-2',
    aggregate_version: 1,
    idempotency_key: 'payment-settled-key-2',
    payload: {
      payment_id: 'payment-2',
      settled_at: '2024-01-04T00:00:00.000Z',
      amount_minor: 1200,
      currency_code: 'USD'
    }
  });

  let conflictMessage = '';
  try {
    await ledgerService.postEvent('tenant-1', otherEvent.id, 'post-key');
  } catch (error) {
    conflictMessage = (error as Error).message;
  }

  assert.match(conflictMessage, /request idempotency key is already bound/);
  console.log('ledger idempotency retry test passed');
}

main().catch((error) => {
  console.error(error);
  process.exitCode = 1;
});
