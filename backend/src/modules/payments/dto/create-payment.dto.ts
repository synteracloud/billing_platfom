export interface CreatePaymentDto {
  customer_id: string;
  amount_minor: number;
  currency: string;
  payment_method: string;
  reference?: string | null;
  metadata?: Record<string, unknown> | null;
}
