export type PaymentStatus = 'recorded' | 'pending_settlement' | 'settled' | 'failed' | 'refunded' | 'void';

export interface PaymentEntity {
  id: string;
  tenant_id: string;
  customer_id: string;
  payment_reference: string | null;
  payment_date: string;
  currency: string;
  amount_received_minor: number;
  allocated_minor: number;
  unallocated_minor: number;
  payment_method: string;
  status: PaymentStatus;
  metadata: Record<string, unknown> | null;
  created_at: string;
  updated_at: string;
}
