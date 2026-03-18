export type JournalEntryStatus = 'posted';

export interface JournalEntryEntity {
  id: string;
  tenant_id: string;
  batch_id: string;
  source_event_id: string;
  rule_version: string;
  status: JournalEntryStatus;
  currency: string;
  entry_date: string;
  posted_at: string;
  metadata: Record<string, unknown>;
  created_at: string;
  updated_at: string;
}
