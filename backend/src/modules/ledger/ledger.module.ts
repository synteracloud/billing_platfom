import { Module } from '@nestjs/common';
import { TransactionsModule } from '../../common/transactions/transactions.module';
import { EventsModule } from '../events/events.module';
import { EventQueueModule } from '../events/queue/event-queue.module';
import { ApprovalModule } from '../approval/approval.module';
import { LedgerInvoiceCreatedConsumer } from './ledger-invoice-created.consumer';
import { LedgerRepository } from './ledger.repository';
import { LedgerService } from './ledger.service';
import { PaymentReceivedLedgerConsumer } from './payment-received-ledger.consumer';

@Module({
  imports: [EventsModule, EventQueueModule, TransactionsModule, ApprovalModule],
  providers: [
    LedgerRepository,
    LedgerService,
    LedgerInvoiceCreatedConsumer,
    PaymentReceivedLedgerConsumer
  ],
  exports: [LedgerService, LedgerRepository]
})
export class LedgerModule {}
