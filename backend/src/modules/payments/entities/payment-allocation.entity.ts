export interface PaymentAllocationEntity {
  id: string;
  tenant_id: string;
  payment_id: string;
  invoice_id: string;
  allocated_amount_minor: number;
  created_at: string;
}
