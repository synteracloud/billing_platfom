import { JournalLineDirection } from '../entities/journal-line.entity';

export class ManualJournalEntryLineDto {
  account_code!: string;
  account_name!: string;
  direction!: JournalLineDirection;
  amount_minor!: number;
}

export class CreateManualJournalEntryDto {
  source_id!: string;
  entry_date!: string;
  currency_code!: string;
  description?: string;
  lines!: ManualJournalEntryLineDto[];
}

export class CreateAdjustmentEntryDto extends CreateManualJournalEntryDto {
  adjusts_journal_entry_id?: string;
}
