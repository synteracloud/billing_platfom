import { Module } from '@nestjs/common';
import { LedgerModule } from '../ledger/ledger.module';
import { CustomersModule } from '../customers/customers.module';
import { InvoicesModule } from '../invoices/invoices.module';
import { PaymentsModule } from '../payments/payments.module';
import { FinancialStatementsController } from './financial-statements.controller';
import { FinancialStatementsService } from './financial-statements.service';
import { StatementsController } from './statements.controller';
import { StatementsService } from './statements.service';

@Module({
  imports: [CustomersModule, InvoicesModule, PaymentsModule, LedgerModule],
  controllers: [StatementsController, FinancialStatementsController],
  providers: [StatementsService, FinancialStatementsService],
  exports: [StatementsService, FinancialStatementsService]
})
export class StatementsModule {}
