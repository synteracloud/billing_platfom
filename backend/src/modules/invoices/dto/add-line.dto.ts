export interface AddLineDto {
  product_id?: string | null;
  description: string;
  quantity: number;
  unit_price_minor: number;
  tax_rate_basis_points?: number | null;
  tax_code?: string | null;
  tax_inclusive?: boolean;
  line_tax_minor?: number;
  sort_order?: number;
  metadata?: Record<string, unknown> | null;
}
