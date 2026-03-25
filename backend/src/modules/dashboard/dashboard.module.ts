import { Module } from '@nestjs/common';
import { InvoicesModule } from '../invoices/invoices.module';
import { PaymentsModule } from '../payments/payments.module';
import { SubscriptionsModule } from '../subscriptions/subscriptions.module';
import { LedgerModule } from '../ledger/ledger.module';
import { DashboardController } from './dashboard.controller';
import { DashboardService } from './dashboard.service';

@Module({
  imports: [InvoicesModule, PaymentsModule, SubscriptionsModule, LedgerModule],
  controllers: [DashboardController],
  providers: [DashboardService],
})
export class DashboardModule {}
