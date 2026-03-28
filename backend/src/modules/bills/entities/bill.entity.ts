export type BillStatus = 'draft' | 'approved' | 'due' | 'partially_paid' | 'paid' | 'void';

export interface BillEntity {
  id: string;
  tenant_id: string;
  vendor_id: string;
  total_amount_minor: number;
  currency_code: string;
  status: BillStatus;
  issued_at: string | null;
  due_at: string | null;
  metadata: Record<string, unknown> | null;
  created_at: string;
  updated_at: string;
  deleted_at: string | null;
}
