export interface JournalEntryEntity {
  id: string;
  tenant_id: string;
  source_type: string;
  source_id: string;
  source_event_id: string;
  event_name: string;
  rule_version: string;
  entry_date: string;
  currency_code: string;
  description: string | null;
  metadata?: Record<string, unknown> | null;
  created_at: string;
}
