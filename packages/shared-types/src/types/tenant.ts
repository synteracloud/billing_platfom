export type TenantStatus = 'active' | 'suspended' | 'deactivated';

export interface Tenant {
  id: string;
  name: string;
  status: TenantStatus;
  base_currency: string;
  locale: string;
  time_zone: string;
  billing_settings: Record<string, unknown>;
  tax_settings: Record<string, unknown>;
  feature_entitlements: string[];
  created_at: string;
  updated_at: string;
}
