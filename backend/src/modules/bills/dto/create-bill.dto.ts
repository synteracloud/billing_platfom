import { BillStatus } from '../entities/bill.entity';

export interface CreateBillDto {
  vendor_id: string;
  total_amount_minor: number;
  currency_code: string;
  status?: BillStatus;
  issued_at?: string | null;
  due_at?: string | null;
  metadata?: Record<string, unknown> | null;
}
