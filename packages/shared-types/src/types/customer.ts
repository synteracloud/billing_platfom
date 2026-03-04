export type CustomerStatus = 'active' | 'archived';

export interface Address {
  line_1: string;
  line_2?: string;
  city: string;
  state?: string;
  postal_code: string;
  country: string;
}

export interface Customer {
  id: string;
  tenant_id: string;
  external_reference?: string;
  legal_name: string;
  display_name: string;
  billing_email: string;
  billing_address: Address;
  shipping_address?: Address;
  tax_identifier?: string;
  currency_preference?: string;
  payment_terms_days: number;
  status: CustomerStatus;
  created_at: string;
  updated_at: string;
}
