export type JournalLineDirection = 'debit' | 'credit';

export interface JournalLineEntity {
  id: string;
  tenant_id: string;
  journal_entry_id: string;
  line_number: number;
  account_code: string;
  account_name: string;
  direction: JournalLineDirection;
  amount_minor: number;
  currency_code: string;
  created_at: string;
}
