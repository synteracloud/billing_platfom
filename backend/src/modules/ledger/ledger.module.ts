import { Module } from '@nestjs/common';
import { TransactionsModule } from '../../common/transactions/transactions.module';
import { EventsModule } from '../events/events.module';
import { LedgerRepository } from './ledger.repository';
import { LedgerService } from './ledger.service';

@Module({
  imports: [TransactionsModule, EventsModule],
  providers: [LedgerRepository, LedgerService],
  exports: [LedgerRepository, LedgerService]
})
export class LedgerModule {}
