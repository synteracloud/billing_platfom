export interface AllocatePaymentItemDto {
  invoice_id: string;
  allocated_minor: number;
  allocation_date?: string;
}

export interface AllocatePaymentDto {
  allocations: AllocatePaymentItemDto[];
}
