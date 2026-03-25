import { Module } from '@nestjs/common';
import { TransactionsModule } from '../../common/transactions/transactions.module';
import { EventsModule } from '../events/events.module';
import { EventQueueModule } from '../events/queue/event-queue.module';
import { BillCreatedLedgerConsumer } from './bill-created-ledger.consumer';
import { LedgerInvoiceCreatedConsumer } from './ledger-invoice-created.consumer';
import { LedgerRepository } from './ledger.repository';
import { LedgerService } from './ledger.service';
import { PaymentReceivedLedgerConsumer } from './payment-received-ledger.consumer';

@Module({
  imports: [EventsModule, EventQueueModule, TransactionsModule],
  providers: [
    LedgerRepository,
    LedgerService,
    LedgerInvoiceCreatedConsumer,
    PaymentReceivedLedgerConsumer,
    BillCreatedLedgerConsumer
  ],
  exports: [LedgerService]
})
export class LedgerModule {}
