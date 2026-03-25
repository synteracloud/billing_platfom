import { Module } from '@nestjs/common';
import { CustomersModule } from '../customers/customers.module';
import { EventsModule } from '../events/events.module';
import { EventQueueModule } from '../events/queue/event-queue.module';
import { InvoicePaymentEventsHandler } from './invoice-payment-events.handler';
import { InvoicesController } from './invoices.controller';
import { InvoicesRepository } from './invoices.repository';
import { InvoicesService } from './invoices.service';

@Module({
  imports: [CustomersModule, EventsModule, EventQueueModule],
  controllers: [InvoicesController],
  providers: [InvoicesService, InvoicesRepository, InvoicePaymentEventsHandler],
  exports: [InvoicesService, InvoicesRepository]
})
export class InvoicesModule {}
