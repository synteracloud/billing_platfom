export type BillingFrequency = 'monthly' | 'quarterly' | 'yearly' | 'custom';

export type SubscriptionStatus = 'draft' | 'active' | 'paused' | 'canceled' | 'expired';

export interface SubscriptionEntity {
  id: string;
  tenant_id: string;
  customer_id: string;
  plan_reference: string | null;
  status: SubscriptionStatus;
  start_date: string;
  end_date: string | null;
  billing_frequency: BillingFrequency;
  next_billing_date: string | null;
  auto_renew: boolean;
  pricing_terms: Record<string, unknown>;
  canceled_at: string | null;
  metadata: Record<string, unknown> | null;
  created_at: string;
  updated_at: string;
}
