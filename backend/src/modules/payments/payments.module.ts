import { Module } from '@nestjs/common';
import { CustomersModule } from '../customers/customers.module';
import { EventsModule } from '../events/events.module';
import { InvoicesModule } from '../invoices/invoices.module';
import { PaymentsController } from './payments.controller';
import { PaymentsRepository } from './payments.repository';
import { PaymentsService } from './payments.service';

@Module({
  imports: [CustomersModule, InvoicesModule, EventsModule],
  controllers: [PaymentsController],
  providers: [PaymentsService, PaymentsRepository],
  exports: [PaymentsService, PaymentsRepository]
})
export class PaymentsModule {}
