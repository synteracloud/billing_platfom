import { JournalLineEntity } from './journal-line.entity';

export interface JournalEntryEntity {
  readonly id: string;
  readonly tenant_id: string;
  readonly source_event_id: string;
  readonly rule_version: string;
  readonly status: string;
  readonly currency: string;
  readonly entry_date: string;
  readonly posted_at: string | null;
  readonly metadata: Record<string, unknown>;
  readonly created_at: string;
  readonly updated_at: string;
  readonly lines: readonly JournalLineEntity[];
}

export interface CreateJournalEntryLineInput {
  readonly account_code: string;
  readonly direction: JournalLineEntity['direction'];
  readonly amount_minor: number;
  readonly description?: string | null;
}

export interface CreateJournalEntryInput {
  readonly tenant_id: string;
  readonly source_event_id: string;
  readonly rule_version: string;
  readonly status: string;
  readonly currency: string;
  readonly entry_date: string;
  readonly posted_at?: string | null;
  readonly metadata?: Record<string, unknown>;
  readonly lines: readonly CreateJournalEntryLineInput[];
}
