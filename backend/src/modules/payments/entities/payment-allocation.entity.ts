export interface PaymentAllocationEntity {
  id: string;
  tenant_id: string;
  payment_id: string;
  invoice_id: string;
  allocated_minor: number;
  allocation_date: string;
  metadata: Record<string, unknown> | null;
  created_at: string;
  updated_at: string;
}
