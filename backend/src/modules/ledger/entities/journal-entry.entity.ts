export interface JournalEntryEntity {
  id: string;
  tenant_id: string;
  source_event_id: string;
  source_event_type: string;
  source_aggregate_id: string;
  rule_version: number;
  idempotency_key: string;
  currency_code: string;
  entry_date: string;
  line_count: number;
  created_at: string;
}

export interface JournalLineEntity {
  id: string;
  tenant_id: string;
  journal_entry_id: string;
  account_code: string;
  direction: 'debit' | 'credit';
  amount_minor: number;
  currency_code: string;
  created_at: string;
}

export type JournalEntryDetails = JournalEntryEntity & {
  lines: JournalLineEntity[];
};
