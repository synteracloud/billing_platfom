import { AddLineDto } from './add-line.dto';

export interface CreateInvoiceDto {
  customer_id: string;
  invoice_number?: string;
  currency: string;
  issue_date?: string | null;
  due_date?: string | null;
  subscription_id?: string | null;
  metadata?: Record<string, unknown> | null;
  lines?: AddLineDto[];
}
