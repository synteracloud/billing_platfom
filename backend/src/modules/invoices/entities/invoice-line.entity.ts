export interface InvoiceLineEntity {
  id: string;
  tenant_id: string;
  invoice_id: string;
  product_id: string | null;
  description: string;
  quantity: number;
  unit_price_minor: number;
  line_subtotal_minor: number;
  line_tax_minor: number;
  line_total_minor: number;
  created_at: string;
  updated_at: string;
}
