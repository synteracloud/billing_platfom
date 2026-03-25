import { Module } from '@nestjs/common';
import { CustomersModule } from '../customers/customers.module';
import { InvoicesModule } from '../invoices/invoices.module';
import { SubscriptionsController } from './subscriptions.controller';
import { SubscriptionsSchedulerService } from './scheduler.service';
import { SubscriptionsRepository } from './subscriptions.repository';
import { SubscriptionsService } from './subscriptions.service';

@Module({
  imports: [CustomersModule, InvoicesModule],
  controllers: [SubscriptionsController],
  providers: [SubscriptionsService, SubscriptionsRepository, SubscriptionsSchedulerService],
  exports: [SubscriptionsService, SubscriptionsRepository, SubscriptionsSchedulerService]
})
export class SubscriptionsModule {}
