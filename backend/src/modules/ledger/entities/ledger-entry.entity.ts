export interface LedgerEntryEntity {
  id: string;
  tenant_id: string;
  account_id: string;
  debit: number | null;
  credit: number | null;
  currency: string;
  reference_type: string;
  reference_id: string;
  created_at: string;
}
