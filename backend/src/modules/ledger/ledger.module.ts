import { Module } from '@nestjs/common';
import { TransactionsModule } from '../../common/transactions/transactions.module';
import { EventsModule } from '../events/events.module';
import { LedgerRepository } from './ledger.repository';
import { LedgerService } from './ledger.service';

@Module({
  imports: [EventsModule, TransactionsModule],
  providers: [LedgerRepository, LedgerService],
  exports: [LedgerService]
})
export class LedgerModule {}
