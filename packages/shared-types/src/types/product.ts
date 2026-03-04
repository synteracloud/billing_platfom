export type ProductBillingType = 'one_time' | 'recurring';

export interface Product {
  id: string;
  tenant_id: string;
  sku: string;
  name: string;
  description?: string;
  unit_price_minor: number;
  currency: string;
  tax_category?: string;
  billing_type: ProductBillingType;
  is_active: boolean;
  created_at: string;
  updated_at: string;
}
