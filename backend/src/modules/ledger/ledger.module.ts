import { Module } from '@nestjs/common';
import { DatabaseModule } from '../../database/database.module';
import { LedgerRepository } from './ledger.repository';

@Module({
  imports: [DatabaseModule],
  providers: [LedgerRepository],
  exports: [LedgerRepository]
})
export class LedgerModule {}
