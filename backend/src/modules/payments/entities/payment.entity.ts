export type PaymentStatus = 'recorded' | 'void';

export interface PaymentEntity {
  id: string;
  tenant_id: string;
  customer_id: string;
  amount_minor: number;
  currency: string;
  payment_method: string;
  reference: string | null;
  status: PaymentStatus;
  metadata: Record<string, unknown> | null;
  created_at: string;
  updated_at: string;
}
