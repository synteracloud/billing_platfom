import { BillingFrequency, SubscriptionStatus } from '../entities/subscription.entity';

export interface CreateSubscriptionDto {
  customer_id: string;
  plan_reference?: string | null;
  status?: SubscriptionStatus;
  start_date: string;
  end_date?: string | null;
  billing_frequency: BillingFrequency;
  next_billing_date?: string | null;
  auto_renew?: boolean;
  pricing_terms: Record<string, unknown>;
  metadata?: Record<string, unknown> | null;
}
