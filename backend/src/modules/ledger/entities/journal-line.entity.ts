export type JournalLineDirection = 'debit' | 'credit';

export interface JournalLineEntity {
  id: string;
  tenant_id: string;
  journal_entry_id: string;
  account_code: string;
  direction: JournalLineDirection;
  amount_minor: number;
  description: string | null;
  created_at: string;
  updated_at: string;
}
