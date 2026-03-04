import { Injectable } from '@nestjs/common';
import { createHash } from 'crypto';
import { promises as fs } from 'fs';
import { dirname, resolve } from 'path';
import { InvoiceLineEntity } from '../invoices/entities/invoice-line.entity';
import { InvoiceEntity } from '../invoices/entities/invoice.entity';
import { CustomerEntity } from '../customers/entities/customer.entity';
import { TenantEntity } from '../tenants/entity/tenant.entity';
import { DocumentsRepository } from './documents.repository';
import { DocumentEntity } from './entities/document.entity';

interface GenerateInvoicePdfInput {
  tenant: TenantEntity;
  customer: CustomerEntity;
  invoice: InvoiceEntity & { lines: InvoiceLineEntity[] };
}

@Injectable()
export class PdfService {
  constructor(private readonly documentsRepository: DocumentsRepository) {}

  async generateInvoicePdf(tenantId: string, input: GenerateInvoicePdfInput): Promise<DocumentEntity> {
    const existing = this.documentsRepository.findBySourceAndType(tenantId, input.invoice.id, 'invoice_pdf');
    if (existing) {
      return existing;
    }

    const filePath = resolve('/storage/documents', tenantId, `${input.invoice.id}.pdf`);
    await fs.mkdir(dirname(filePath), { recursive: true });

    const linesSection = input.invoice.lines
      .map(
        (line, index) =>
          `${index + 1}. ${line.description} | qty=${line.quantity} | unit=${line.unit_price_minor} | subtotal=${line.line_subtotal_minor} | tax=${line.line_tax_minor}`
      )
      .join('\n');

    const content = [
      'BILLING PLATFORM INVOICE',
      `Tenant: ${input.tenant.name} (${input.tenant.id})`,
      `Customer: ${input.customer.display_name} (${input.customer.id})`,
      `Customer Email: ${input.customer.email ?? 'N/A'}`,
      `Invoice Number: ${input.invoice.invoice_number}`,
      `Invoice ID: ${input.invoice.id}`,
      `Status: ${input.invoice.status}`,
      `Currency: ${input.invoice.currency}`,
      `Issue Date: ${input.invoice.issue_date ?? 'N/A'}`,
      `Due Date: ${input.invoice.due_date ?? 'N/A'}`,
      '',
      'LINE ITEMS',
      linesSection || 'No lines',
      '',
      `Subtotal: ${input.invoice.subtotal_minor}`,
      `Tax: ${input.invoice.tax_minor}`,
      `Total: ${input.invoice.total_minor}`,
      ''
    ].join('\n');

    await fs.writeFile(filePath, content, 'utf8');

    return this.documentsRepository.create({
      tenant_id: tenantId,
      document_type: 'invoice_pdf',
      source_entity_type: 'invoice',
      source_entity_id: input.invoice.id,
      template_reference: null,
      storage_uri: filePath,
      checksum: createHash('sha256').update(content).digest('hex'),
      generation_status: 'generated',
      generated_at: new Date().toISOString(),
      metadata: null
    });
  }
}
