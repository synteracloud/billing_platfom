export type PaymentStatus =
  | 'recorded'
  | 'pending_settlement'
  | 'settled'
  | 'failed'
  | 'refunded';

export interface PaymentAllocation {
  id: string;
  tenant_id: string;
  payment_id: string;
  invoice_id: string;
  allocated_minor: number;
  allocation_date: string;
  created_by_user_id?: string;
  metadata?: Record<string, unknown>;
  created_at: string;
  updated_at: string;
}

export interface Payment {
  id: string;
  tenant_id: string;
  customer_id: string;
  payment_reference: string;
  payment_method: string;
  payment_date: string;
  currency: string;
  amount_received_minor: number;
  status: PaymentStatus;
  unallocated_minor: number;
  allocated_minor: number;
  metadata?: Record<string, unknown>;
  allocations?: PaymentAllocation[];
  created_at: string;
  updated_at: string;
}
