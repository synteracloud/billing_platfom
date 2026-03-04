export interface CustomerEntity {
  id: string;
  tenant_id: string;
  legal_name: string;
  display_name: string;
  email: string | null;
  phone: string | null;
  tax_id: string | null;
  billing_address_line1: string | null;
  billing_address_line2: string | null;
  billing_city: string | null;
  billing_state: string | null;
  billing_postal_code: string | null;
  billing_country: string | null;
  metadata: Record<string, unknown> | null;
  created_at: string;
  updated_at: string;
  deleted_at: string | null;
}
