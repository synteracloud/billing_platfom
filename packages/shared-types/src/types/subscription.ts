export type SubscriptionStatus = 'draft' | 'active' | 'paused' | 'canceled' | 'expired';
export type BillingFrequency = 'monthly' | 'quarterly' | 'yearly' | 'custom';

export interface Subscription {
  id: string;
  tenant_id: string;
  customer_id: string;
  plan_reference: string;
  status: SubscriptionStatus;
  start_date: string;
  end_date?: string;
  billing_frequency: BillingFrequency;
  next_billing_date: string;
  auto_renew: boolean;
  pricing_terms: Record<string, unknown>;
  created_at: string;
  updated_at: string;
  canceled_at?: string;
}
