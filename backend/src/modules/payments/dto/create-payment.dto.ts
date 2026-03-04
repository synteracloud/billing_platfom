export interface CreatePaymentDto {
  customer_id: string;
  payment_reference?: string | null;
  payment_date: string;
  currency: string;
  amount_received_minor: number;
  payment_method: string;
  allocations?: AllocatePaymentItemDto[];
  metadata?: Record<string, unknown> | null;
}

export interface AllocatePaymentItemDto {
  invoice_id: string;
  allocated_minor: number;
  allocation_date?: string;
}
