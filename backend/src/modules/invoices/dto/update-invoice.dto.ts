export interface UpdateInvoiceDto {
  issue_date?: string | null;
  due_date?: string | null;
  notes?: string | null;
  discount_minor?: number;
  metadata?: Record<string, unknown> | null;
}
