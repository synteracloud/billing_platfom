export type DocumentType = 'invoice_pdf' | 'receipt_pdf';

export interface DocumentEntity {
  id: string;
  tenant_id: string;
  document_type: DocumentType;
  source_entity_type: 'invoice' | 'payment' | 'subscription';
  source_entity_id: string;
  template_reference: string | null;
  storage_uri: string;
  checksum: string | null;
  generation_status: 'requested' | 'generated' | 'failed';
  generated_at: string | null;
  metadata: Record<string, unknown> | null;
  created_at: string;
  updated_at: string;
}
