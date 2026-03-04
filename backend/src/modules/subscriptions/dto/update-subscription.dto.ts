import { BillingInterval } from '../entities/subscription.entity';

export interface UpdateSubscriptionDto {
  product_id?: string | null;
  name?: string;
  billing_interval?: BillingInterval;
  amount_minor?: number;
  currency?: string;
  start_date?: string;
  end_date?: string | null;
  next_billing_date?: string;
  metadata?: Record<string, unknown> | null;
}
