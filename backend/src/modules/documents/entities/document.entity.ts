export type DocumentType = 'invoice_pdf' | 'receipt_pdf';

export interface DocumentEntity {
  id: string;
  tenant_id: string;
  invoice_id: string;
  document_type: DocumentType;
  file_path: string;
  created_at: string;
}
