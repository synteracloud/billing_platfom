import { Injectable } from '@nestjs/common';
import { randomUUID } from 'crypto';
import { DocumentEntity, DocumentType } from './entities/document.entity';

@Injectable()
export class DocumentsRepository {
  private readonly documents = new Map<string, DocumentEntity>();

  listByTenant(tenantId: string): DocumentEntity[] {
    return [...this.documents.values()]
      .filter((document) => document.tenant_id === tenantId)
      .sort((a, b) => b.created_at.localeCompare(a.created_at));
  }

  findById(tenantId: string, documentId: string): DocumentEntity | undefined {
    const document = this.documents.get(documentId);
    if (!document || document.tenant_id !== tenantId) {
      return undefined;
    }

    return document;
  }

  findByInvoiceAndType(tenantId: string, invoiceId: string, type: DocumentType): DocumentEntity | undefined {
    return [...this.documents.values()].find(
      (document) =>
        document.tenant_id === tenantId &&
        document.invoice_id === invoiceId &&
        document.document_type === type
    );
  }

  create(data: Omit<DocumentEntity, 'id' | 'created_at'>): DocumentEntity {
    const created: DocumentEntity = {
      ...data,
      id: randomUUID(),
      created_at: new Date().toISOString()
    };

    this.documents.set(created.id, created);
    return created;
  }
}
