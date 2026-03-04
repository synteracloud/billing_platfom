export type ProductType = 'product' | 'service';

export interface ProductEntity {
  id: string;
  tenant_id: string;
  name: string;
  description: string | null;
  type: ProductType;
  unit_price_minor: number;
  currency: string;
  tax_category: string | null;
  active: boolean;
  metadata: Record<string, unknown> | null;
  created_at: string;
  updated_at: string;
  deleted_at: string | null;
}
