export type BillingInterval = 'monthly' | 'yearly';

export type SubscriptionStatus = 'active' | 'paused' | 'cancelled';

export interface SubscriptionEntity {
  id: string;
  tenant_id: string;
  customer_id: string;
  product_id: string | null;
  name: string;
  billing_interval: BillingInterval;
  amount_minor: number;
  currency: string;
  start_date: string;
  end_date: string | null;
  next_billing_date: string;
  status: SubscriptionStatus;
  metadata: Record<string, unknown> | null;
  created_at: string;
  updated_at: string;
}
