export interface AddLineDto {
  product_id?: string | null;
  description: string;
  quantity: number;
  unit_price_minor: number;
  line_tax_minor?: number;
}
