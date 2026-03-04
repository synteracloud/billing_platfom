import { ProductType } from '../entities/product.entity';

export interface CreateProductDto {
  name: string;
  description?: string | null;
  type: ProductType;
  unit_price_minor: number;
  currency: string;
  tax_category?: string | null;
  active?: boolean;
  metadata?: Record<string, unknown> | null;
}
