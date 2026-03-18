import { Module } from '@nestjs/common';
import { TransactionsModule } from '../../common/transactions/transactions.module';
import { EventsModule } from '../events/events.module';
import { LedgerController } from './ledger.controller';
import { LedgerRepository } from './ledger.repository';
import { LedgerService } from './ledger.service';

@Module({
  imports: [EventsModule, TransactionsModule],
  controllers: [LedgerController],
  providers: [LedgerRepository, LedgerService],
  exports: [LedgerService, LedgerRepository]
})
export class LedgerModule {}
