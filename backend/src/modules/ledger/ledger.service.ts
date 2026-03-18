import { BadRequestException, Injectable } from '@nestjs/common';
import { createHash } from 'crypto';
import { FinancialTransactionManager, TransactionParticipant } from '../../common/transactions/financial-transaction.manager';
import { EventsService } from '../events/events.service';
import { JournalEntryEntity } from './entities/journal-entry.entity';
import { JournalLineDirection, JournalLineEntity } from './entities/journal-line.entity';
import { LedgerRepository } from './ledger.repository';

const SUPPORTED_EVENT_NAMES = new Set([
  'billing.invoice.issued.v1',
  'billing.payment.settled.v1',
  'billing.payment.refunded.v1',
  'billing.bill.approved.v1',
  'billing.bill.paid.v1'
]);

export interface PostingLineInput {
  account_code: string;
  account_name: string;
  direction: JournalLineDirection;
  amount_minor: number;
  currency_code: string;
}

export interface PostingTransactionInput {
  tenant_id: string;
  source_type: string;
  source_id: string;
  source_event_id: string;
  event_name: string;
  rule_version: string;
  entry_date: string;
  currency_code: string;
  description?: string | null;
  entries: PostingLineInput[];
}

@Injectable()
export class LedgerService {
  constructor(
    private readonly ledgerRepository: LedgerRepository,
    private readonly eventsService: EventsService,
    private readonly transactionManager: FinancialTransactionManager
  ) {}

  post(transaction: PostingTransactionInput): Promise<JournalEntryEntity & { lines: JournalLineEntity[] }> {
    return this.transactionManager.wrapper(() => {
      const normalized = this.validateAndNormalize(transaction);
      const existing = this.ledgerRepository.findBySourceEvent(
        normalized.tenant_id,
        normalized.source_event_id,
        normalized.rule_version
      );
      if (existing) {
        return existing;
      }

      const journalEntryId = this.createDeterministicId('journal-entry', normalized.tenant_id, normalized.source_event_id, normalized.rule_version);
      const lines = normalized.entries.map((line, index) => ({
        id: this.createDeterministicId('journal-line', journalEntryId, String(index + 1)),
        tenant_id: normalized.tenant_id,
        journal_entry_id: journalEntryId,
        line_number: index + 1,
        account_code: line.account_code,
        account_name: line.account_name,
        direction: line.direction,
        amount_minor: line.amount_minor,
        currency_code: line.currency_code,
        created_at: normalized.created_at
      }));

      const entry: JournalEntryEntity = {
        id: journalEntryId,
        tenant_id: normalized.tenant_id,
        source_type: normalized.source_type,
        source_id: normalized.source_id,
        source_event_id: normalized.source_event_id,
        event_name: normalized.event_name,
        rule_version: normalized.rule_version,
        entry_date: normalized.entry_date,
        currency_code: normalized.currency_code,
        description: normalized.description,
        created_at: normalized.created_at
      };

      const created = this.ledgerRepository.create(entry, lines);
      this.eventsService.logEvent({
        tenant_id: normalized.tenant_id,
        type: 'accounting.journal.posted.v1',
        aggregate_type: 'journal_entry',
        aggregate_id: created.id,
        aggregate_version: 1,
        idempotency_key: `accounting.journal.posted.v1:${normalized.source_event_id}:${normalized.rule_version}`,
        payload: {
          journal_entry_id: created.id,
          source_type: created.source_type,
          source_id: created.source_id,
          source_event_id: created.source_event_id,
          currency_code: created.currency_code,
          line_count: created.lines.length
        }
      });

      return created;
    }, this.transactionParticipants());
  }

  getJournalEntry(tenantId: string, journalEntryId: string): (JournalEntryEntity & { lines: JournalLineEntity[] }) | undefined {
    return this.ledgerRepository.findById(tenantId, journalEntryId);
  }

  private validateAndNormalize(transaction: PostingTransactionInput): PostingTransactionInput & { created_at: string; description: string | null } {
    if (!transaction.tenant_id?.trim()) {
      throw new BadRequestException('tenant_id is required');
    }

    if (!transaction.source_type?.trim() || !transaction.source_id?.trim() || !transaction.source_event_id?.trim()) {
      throw new BadRequestException('source_type, source_id, and source_event_id are required');
    }

    if (!SUPPORTED_EVENT_NAMES.has(transaction.event_name)) {
      throw new BadRequestException(`Unsupported event_name: ${transaction.event_name}`);
    }

    if (!transaction.rule_version?.trim()) {
      throw new BadRequestException('rule_version is required');
    }

    if (!/^\d{4}-\d{2}-\d{2}$/.test(transaction.entry_date)) {
      throw new BadRequestException('entry_date must be in YYYY-MM-DD format');
    }

    if (!transaction.currency_code?.trim()) {
      throw new BadRequestException('currency_code is required');
    }

    if (!Array.isArray(transaction.entries) || transaction.entries.length < 2) {
      throw new BadRequestException('entries must contain at least two lines');
    }

    const entries = transaction.entries.map((entry) => {
      if (!entry.account_code?.trim() || !entry.account_name?.trim()) {
        throw new BadRequestException('Each entry must include account_code and account_name');
      }

      if (!Number.isInteger(entry.amount_minor) || entry.amount_minor < 0) {
        throw new BadRequestException('Each entry amount_minor must be an integer greater than or equal to 0');
      }

      if (!entry.currency_code?.trim()) {
        throw new BadRequestException('Each entry currency_code is required');
      }

      return {
        account_code: entry.account_code.trim(),
        account_name: entry.account_name.trim(),
        direction: entry.direction,
        amount_minor: entry.amount_minor,
        currency_code: entry.currency_code.trim().toUpperCase()
      };
    });

    const currencyCode = transaction.currency_code.trim().toUpperCase();
    if (entries.some((entry) => entry.currency_code !== currencyCode)) {
      throw new BadRequestException('All entries must use the transaction currency_code');
    }

    const debitTotal = entries.filter((entry) => entry.direction === 'debit').reduce((sum, entry) => sum + entry.amount_minor, 0);
    const creditTotal = entries.filter((entry) => entry.direction === 'credit').reduce((sum, entry) => sum + entry.amount_minor, 0);

    if (debitTotal !== creditTotal) {
      throw new BadRequestException('Unbalanced posting: debit total must equal credit total');
    }

    if (debitTotal === 0) {
      throw new BadRequestException('Posting total must be greater than zero');
    }

    return {
      ...transaction,
      tenant_id: transaction.tenant_id.trim(),
      source_type: transaction.source_type.trim(),
      source_id: transaction.source_id.trim(),
      source_event_id: transaction.source_event_id.trim(),
      event_name: transaction.event_name.trim(),
      rule_version: transaction.rule_version.trim(),
      entry_date: transaction.entry_date,
      currency_code: currencyCode,
      description: transaction.description?.trim() || null,
      entries,
      created_at: new Date().toISOString()
    };
  }

  private createDeterministicId(...parts: string[]): string {
    const digest = createHash('sha256').update(parts.join('::')).digest('hex');
    return `${digest.slice(0, 8)}-${digest.slice(8, 12)}-${digest.slice(12, 16)}-${digest.slice(16, 20)}-${digest.slice(20, 32)}`;
  }

  private transactionParticipants(): TransactionParticipant[] {
    return [
      {
        key: 'ledger.repository',
        snapshot: () => this.ledgerRepository.createSnapshot(),
        restore: (snapshot) => this.ledgerRepository.restoreSnapshot(snapshot as ReturnType<LedgerRepository['createSnapshot']>)
      },
      {
        key: 'events.service',
        snapshot: () => this.eventsService.createSnapshot(),
        restore: (snapshot) => this.eventsService.restoreSnapshot(snapshot as ReturnType<EventsService['createSnapshot']>)
      }
    ];
  }
}
