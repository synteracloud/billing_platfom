import { JournalLineDirection } from '../entities/journal-line.entity';

export interface BatchPostingLineInput {
  account_code: string;
  direction: JournalLineDirection;
  amount_minor: number;
  description?: string | null;
}

export interface BatchPostingEntryInput {
  source_event_id: string;
  rule_version: string;
  currency: string;
  entry_date: string;
  metadata?: Record<string, unknown> | null;
  lines: BatchPostingLineInput[];
}

export interface PostJournalBatchInput {
  source_type: string;
  source_id: string;
  entries: BatchPostingEntryInput[];
  idempotency_key?: string;
  simulate_failure_at_entry?: number;
}
