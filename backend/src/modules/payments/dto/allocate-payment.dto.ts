export interface AllocatePaymentItemDto {
  invoice_id: string;
  allocated_amount_minor: number;
}

export interface AllocatePaymentDto {
  allocations: AllocatePaymentItemDto[];
}
