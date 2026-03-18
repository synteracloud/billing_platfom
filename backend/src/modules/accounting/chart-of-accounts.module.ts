import { Module } from '@nestjs/common';
import { ChartOfAccountsRepository } from './chart-of-accounts.repository';
import { ChartOfAccountsService } from './chart-of-accounts.service';

@Module({
  providers: [ChartOfAccountsRepository, ChartOfAccountsService],
  exports: [ChartOfAccountsRepository, ChartOfAccountsService]
})
export class ChartOfAccountsModule {}
