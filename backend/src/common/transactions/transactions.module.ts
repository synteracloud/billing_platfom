import { Global, Module } from '@nestjs/common';
import { FinancialTransactionManager } from './financial-transaction.manager';

@Global()
@Module({
  providers: [FinancialTransactionManager],
  exports: [FinancialTransactionManager]
})
export class TransactionsModule {}
