export type VendorStatus = 'active' | 'inactive';

export interface VendorEntity {
  id: string;
  tenant_id: string;
  name: string;
  contact_name: string | null;
  contact_email: string | null;
  contact_phone: string | null;
  currency_code: string;
  status: VendorStatus;
  metadata: Record<string, unknown> | null;
  created_at: string;
  updated_at: string;
  deleted_at: string | null;
}
