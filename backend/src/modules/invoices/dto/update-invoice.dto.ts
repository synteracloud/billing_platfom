export interface UpdateInvoiceDto {
  issue_date?: string | null;
  due_date?: string | null;
  metadata?: Record<string, unknown> | null;
}
