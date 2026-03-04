import { BadRequestException, Injectable, NotFoundException } from '@nestjs/common';
import { CustomersService } from '../customers/customers.service';
import { InvoicesService } from '../invoices/invoices.service';
import { TenantsService } from '../tenants/service';
import { SendInvoiceDto } from './dto/send-invoice.dto';
import { DocumentsRepository } from './documents.repository';
import { DocumentEntity } from './entities/document.entity';
import { EmailService } from './email.service';
import { PdfService } from './pdf.service';

@Injectable()
export class DocumentsService {
  constructor(
    private readonly documentsRepository: DocumentsRepository,
    private readonly invoicesService: InvoicesService,
    private readonly customersService: CustomersService,
    private readonly tenantsService: TenantsService,
    private readonly pdfService: PdfService,
    private readonly emailService: EmailService
  ) {}

  listDocuments(tenantId: string): DocumentEntity[] {
    return this.documentsRepository.listByTenant(tenantId);
  }

  getDocument(tenantId: string, documentId: string): DocumentEntity {
    const document = this.documentsRepository.findById(tenantId, documentId);
    if (!document) {
      throw new NotFoundException('Document not found');
    }

    return document;
  }

  async getInvoicePdf(tenantId: string, invoiceId: string): Promise<DocumentEntity> {
    const invoice = this.invoicesService.getInvoice(tenantId, invoiceId);
    const customer = this.customersService.getCustomer(tenantId, invoice.customer_id);
    const tenant = this.tenantsService.getTenant(tenantId);

    return this.pdfService.generateInvoicePdf(tenantId, {
      tenant,
      customer,
      invoice
    });
  }

  async sendInvoice(tenantId: string, invoiceId: string, data: SendInvoiceDto): Promise<{
    invoice_id: string;
    to: string;
    subject: string;
    summary: string;
    attachment_path: string;
    sent_at: string;
  }> {
    const invoice = this.invoicesService.getInvoice(tenantId, invoiceId);
    const customer = this.customersService.getCustomer(tenantId, invoice.customer_id);

    const targetEmail = data.customer_email?.trim() || customer.email;
    if (!targetEmail) {
      throw new BadRequestException('customer email must exist before sending');
    }

    this.validateEmail(targetEmail);

    const document = await this.getInvoicePdf(tenantId, invoiceId);

    return this.emailService.sendInvoiceEmail({
      invoiceId: invoice.id,
      customerEmail: targetEmail,
      invoiceNumber: invoice.invoice_number,
      totalMinor: invoice.total_minor,
      currency: invoice.currency,
      document
    });
  }

  private validateEmail(email: string): void {
    const emailRegex = /^[^\s@]+@[^\s@]+\.[^\s@]+$/;
    if (!emailRegex.test(email)) {
      throw new BadRequestException('customer_email must be a valid email address');
    }
  }
}
