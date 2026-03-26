import { Module } from '@nestjs/common';
import { TransactionsModule } from '../../common/transactions/transactions.module';
import { EventsModule } from '../events/events.module';
import { EventQueueModule } from '../events/queue/event-queue.module';
import { LedgerInvoiceCreatedConsumer } from './ledger-invoice-created.consumer';
import { LedgerController } from './ledger.controller';
import { LedgerRepository } from './ledger.repository';
import { LedgerService } from './ledger.service';
import { PaymentReceivedLedgerConsumer } from './payment-received-ledger.consumer';

@Module({
  imports: [EventsModule, EventQueueModule, TransactionsModule],
  controllers: [LedgerController],
  providers: [
    LedgerRepository,
    AccountingPeriodRepository,
    LedgerService,
    LedgerInvoiceCreatedConsumer,
    PaymentReceivedLedgerConsumer
  ],
  exports: [LedgerService, LedgerRepository, AccountingPeriodRepository]
})
export class LedgerModule {}
