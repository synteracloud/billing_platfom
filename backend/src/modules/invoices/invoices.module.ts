import { Module } from '@nestjs/common';
import { CustomersModule } from '../customers/customers.module';
import { EventsModule } from '../events/events.module';
import { InvoicesController } from './invoices.controller';
import { InvoicesRepository } from './invoices.repository';
import { InvoicesService } from './invoices.service';

@Module({
  imports: [CustomersModule, EventsModule],
  controllers: [InvoicesController],
  providers: [InvoicesService, InvoicesRepository],
  exports: [InvoicesService, InvoicesRepository]
})
export class InvoicesModule {}
