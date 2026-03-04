export type InvoiceStatus = 'draft' | 'issued' | 'partially_paid' | 'paid' | 'void';

export interface InvoiceEntity {
  id: string;
  tenant_id: string;
  customer_id: string;
  subscription_id: string | null;
  invoice_number: string;
  status: InvoiceStatus;
  issue_date: string | null;
  due_date: string | null;
  currency: string;
  subtotal_minor: number;
  tax_minor: number;
  discount_minor: number;
  total_minor: number;
  amount_paid_minor: number;
  amount_due_minor: number;
  notes: string | null;
  issued_at: string | null;
  voided_at: string | null;
  metadata: Record<string, unknown> | null;
  created_at: string;
  updated_at: string;
}
