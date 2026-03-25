import { Module } from '@nestjs/common';
import { BankConnectorService } from './bank-connector.service';
import { BankTransactionsRepository } from './bank-transactions.repository';

@Module({
  providers: [BankConnectorService, BankTransactionsRepository],
  exports: [BankConnectorService, BankTransactionsRepository]
})
export class BankConnectorModule {}
