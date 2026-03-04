import { Injectable } from '@nestjs/common';
import { DocumentEntity } from './entities/document.entity';

interface SendInvoiceEmailInput {
  invoiceId: string;
  customerEmail: string;
  invoiceNumber: string;
  totalMinor: number;
  currency: string;
  document: DocumentEntity;
}

@Injectable()
export class EmailService {
  async sendInvoiceEmail(input: SendInvoiceEmailInput): Promise<{
    invoice_id: string;
    to: string;
    subject: string;
    summary: string;
    attachment_path: string;
    sent_at: string;
  }> {
    const subject = `Invoice ${input.invoiceNumber}`;
    const summary = `Invoice ${input.invoiceNumber} for ${input.totalMinor} ${input.currency}.`;

    return {
      invoice_id: input.invoiceId,
      to: input.customerEmail,
      subject,
      summary,
      attachment_path: input.document.file_path,
      sent_at: new Date().toISOString()
    };
  }
}
