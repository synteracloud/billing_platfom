import { Module } from '@nestjs/common';
import { ApModule } from '../ap/ap.module';
import { ArModule } from '../ar/ar.module';
import { LedgerModule } from '../ledger/ledger.module';
import { CashflowController } from './cashflow.controller';
import { CashflowService } from './cashflow.service';

@Module({
  imports: [LedgerModule, ArModule, ApModule],
  controllers: [CashflowController],
  providers: [CashflowService]
})
export class CashflowModule {}
