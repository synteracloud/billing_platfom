import { Module } from '@nestjs/common';
import { TransactionsModule } from '../../common/transactions/transactions.module';
import { EventsModule } from '../events/events.module';
import { EventQueueModule } from '../events/queue/event-queue.module';
import { LedgerInvoiceCreatedConsumer } from './ledger-invoice-created.consumer';
import { LedgerRepository } from './ledger.repository';
import { LedgerService } from './ledger.service';

@Module({
  imports: [EventsModule, EventQueueModule, TransactionsModule],
  providers: [LedgerRepository, LedgerService, LedgerInvoiceCreatedConsumer],
  exports: [LedgerService]
})
export class LedgerModule {}
