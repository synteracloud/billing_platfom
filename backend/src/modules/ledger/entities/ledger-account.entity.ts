export interface LedgerAccountEntity {
  id: string;
  tenant_id: string;
  code: string;
  name: string;
  account_type: string;
  currency: string;
  is_active: boolean;
  created_at: string;
  updated_at: string;
}
