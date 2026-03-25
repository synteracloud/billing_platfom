export type InvoiceStatus = 'draft' | 'issued' | 'paid' | 'void';

export interface InvoiceLine {
  id: string;
  tenant_id: string;
  invoice_id: string;
  product_id?: string;
  description: string;
  quantity: number;
  unit_price_minor: number;
  tax_rate?: number;
  tax_code?: string;
  line_subtotal_minor: number;
  line_tax_minor: number;
  line_total_minor: number;
  sort_order: number;
}

export interface Invoice {
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
  lines: InvoiceLine[];
  metadata: Record<string, unknown> | null;
  created_at: string;
  updated_at: string;
  issued_at: string | null;
  voided_at: string | null;
}
