import { Module } from '@nestjs/common';
import { CustomersModule } from '../customers/customers.module';
import { EventsModule } from '../events/events.module';
import { IdempotencyModule } from '../idempotency/idempotency.module';
import { InvoicesModule } from '../invoices/invoices.module';
import { ApprovalModule } from '../approval/approval.module';
import { PaymentsController } from './payments.controller';
import { PaymentsRepository } from './payments.repository';
import { PaymentsService } from './payments.service';
import { StripeConnector } from './connectors/stripe/stripe.connector';

@Module({
  imports: [CustomersModule, InvoicesModule, EventsModule, IdempotencyModule, ApprovalModule],
  controllers: [PaymentsController],
  providers: [PaymentsService, PaymentsRepository, StripeConnector],
  exports: [PaymentsService, PaymentsRepository, StripeConnector]
})
export class PaymentsModule {}
