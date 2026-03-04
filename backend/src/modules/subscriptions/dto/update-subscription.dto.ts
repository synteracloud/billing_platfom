import { BillingFrequency } from '../entities/subscription.entity';

export interface UpdateSubscriptionDto {
  plan_reference?: string | null;
  end_date?: string | null;
  billing_frequency?: BillingFrequency;
  next_billing_date?: string | null;
  auto_renew?: boolean;
  pricing_terms?: Record<string, unknown>;
  metadata?: Record<string, unknown> | null;
}
