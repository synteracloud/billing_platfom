import { Module } from '@nestjs/common';
import { InvoicesModule } from '../invoices/invoices.module';
import { LedgerModule } from '../ledger/ledger.module';
import { TaxController } from './tax.controller';
import { TaxReadOnlyGuard } from './tax-readonly.guard';
import { TaxService } from './tax.service';

@Module({
  imports: [InvoicesModule, LedgerModule],
  controllers: [TaxController],
  providers: [TaxService, TaxReadOnlyGuard]
})
export class TaxModule {}
