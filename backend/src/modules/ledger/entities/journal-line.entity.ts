export type JournalLineDirection = 'debit' | 'credit';

export interface JournalLineEntity {
  readonly id: string;
  readonly tenant_id: string;
  readonly journal_entry_id: string;
  readonly account_code: string;
  readonly direction: JournalLineDirection;
  readonly amount_minor: number;
  readonly description: string | null;
  readonly created_at: string;
  readonly updated_at: string;
}
