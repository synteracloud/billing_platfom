import { Module } from '@nestjs/common';
import { CustomersModule } from '../customers/customers.module';
import { EventsModule } from '../events/events.module';
import { InvoicesModule } from '../invoices/invoices.module';
import { TenantsModule } from '../tenants/module';
import { DocumentsController } from './documents.controller';
import { DocumentsRepository } from './documents.repository';
import { DocumentsService } from './documents.service';
import { EmailService } from './email.service';
import { PdfService } from './pdf.service';

@Module({
  imports: [InvoicesModule, CustomersModule, TenantsModule, EventsModule],
  controllers: [DocumentsController],
  providers: [DocumentsService, DocumentsRepository, PdfService, EmailService],
  exports: [DocumentsService, DocumentsRepository]
})
export class DocumentsModule {}
