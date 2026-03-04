export interface AddLineDto {
  product_id?: string | null;
  description: string;
  quantity: number;
  unit_price_minor: number;
  tax_rate_basis_points?: number | null;
  line_tax_minor?: number;
  sort_order?: number;
  metadata?: Record<string, unknown> | null;
}
