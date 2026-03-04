export type InvoiceStatus = 'draft' | 'issued' | 'partially_paid' | 'paid' | 'void';

export interface InvoiceEntity {
  id: string;
  tenant_id: string;
  customer_id: string;
  invoice_number: string;
  status: InvoiceStatus;
  currency: string;
  subtotal_minor: number;
  tax_minor: number;
  total_minor: number;
  issue_date: string | null;
  due_date: string | null;
  subscription_id: string | null;
  metadata: Record<string, unknown> | null;
  created_at: string;
  updated_at: string;
}
