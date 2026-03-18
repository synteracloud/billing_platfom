import { BadRequestException, Injectable } from '@nestjs/common';
import { randomUUID } from 'crypto';
import { FinancialTransactionManager, TransactionParticipant } from '../../common/transactions/financial-transaction.manager';
import { EventsService } from '../events/events.service';
import { PostJournalBatchInput } from './dto/posting-batch.dto';
import { JournalEntryEntity } from './entities/journal-entry.entity';
import { LedgerRepository } from './ledger.repository';

@Injectable()
export class LedgerService {
  constructor(
    private readonly ledgerRepository: LedgerRepository,
    private readonly eventsService: EventsService,
    private readonly transactionManager: FinancialTransactionManager
  ) {}

  postBatch(tenantId: string, input: PostJournalBatchInput): { batch_id: string; entries: JournalEntryEntity[] } {
    return this.transactionManager.wrapper(() => {
      if (!Array.isArray(input.entries) || input.entries.length === 0) {
        throw new BadRequestException('entries must be a non-empty array');
      }

      const batchId = randomUUID();
      const createdEntries: JournalEntryEntity[] = [];

      input.entries.forEach((entryInput, index) => {
        this.validateEntry(entryInput);
        const existing = this.ledgerRepository.findBySourceEvent(tenantId, entryInput.source_event_id, entryInput.rule_version);
        if (existing) {
          createdEntries.push(existing);
          return;
        }

        const entry = this.ledgerRepository.createEntry({
          tenant_id: tenantId,
          batch_id: batchId,
          source_event_id: entryInput.source_event_id,
          rule_version: entryInput.rule_version,
          status: 'posted',
          currency: entryInput.currency.trim().toUpperCase(),
          entry_date: entryInput.entry_date,
          posted_at: new Date().toISOString(),
          metadata: {
            ...(entryInput.metadata ?? {}),
            batch_id: batchId,
            source_type: input.source_type,
            source_id: input.source_id
          }
        });

        entryInput.lines.forEach((line) => {
          this.ledgerRepository.createLine({
            tenant_id: tenantId,
            journal_entry_id: entry.id,
            account_code: line.account_code.trim(),
            direction: line.direction,
            amount_minor: line.amount_minor,
            description: line.description ?? null
          });
        });

        if (input.simulate_failure_at_entry === index + 1) {
          throw new BadRequestException(`Simulated failure while posting batch at entry ${index + 1}`);
        }

        this.eventsService.logEvent({
          tenant_id: tenantId,
          type: 'accounting.journal.posted.v1',
          aggregate_type: 'journal_entry',
          aggregate_id: entry.id,
          aggregate_version: 1,
          idempotency_key: input.idempotency_key ? `${input.idempotency_key}:${index + 1}` : undefined,
          payload: {
            journal_entry_id: entry.id,
            source_type: input.source_type,
            source_id: input.source_id,
            source_event_id: entry.source_event_id,
            currency_code: entry.currency,
            line_count: entryInput.lines.length,
            batch_id: batchId
          }
        });

        createdEntries.push(entry);
      });

      return { batch_id: batchId, entries: createdEntries };
    }, this.transactionParticipants());
  }

  listBatchEntries(tenantId: string, batchId: string): Array<JournalEntryEntity & { line_count: number }> {
    return this.ledgerRepository.listEntriesByBatch(tenantId, batchId).map((entry) => ({
      ...entry,
      line_count: this.ledgerRepository.listLinesByEntry(tenantId, entry.id).length
    }));
  }

  private validateEntry(entryInput: PostJournalBatchInput['entries'][number]): void {
    if (!entryInput.source_event_id?.trim()) {
      throw new BadRequestException('source_event_id is required');
    }
    if (!entryInput.rule_version?.trim()) {
      throw new BadRequestException('rule_version is required');
    }
    if (!entryInput.currency || entryInput.currency.trim().length !== 3) {
      throw new BadRequestException('currency must be a 3-letter ISO code');
    }
    if (Number.isNaN(new Date(entryInput.entry_date).valueOf())) {
      throw new BadRequestException('entry_date must be a valid date');
    }
    if (!Array.isArray(entryInput.lines) || entryInput.lines.length < 2) {
      throw new BadRequestException('each entry must contain at least two lines');
    }

    let debitTotal = 0;
    let creditTotal = 0;
    entryInput.lines.forEach((line) => {
      if (!line.account_code?.trim()) {
        throw new BadRequestException('account_code is required for each line');
      }
      if (!Number.isFinite(line.amount_minor) || line.amount_minor <= 0) {
        throw new BadRequestException('amount_minor must be greater than 0');
      }
      if (line.direction === 'debit') {
        debitTotal += line.amount_minor;
      } else {
        creditTotal += line.amount_minor;
      }
    });

    if (debitTotal !== creditTotal) {
      throw new BadRequestException('journal entry is not balanced');
    }
  }

  private transactionParticipants(): TransactionParticipant[] {
    return [
      {
        key: 'ledger',
        snapshot: () => this.ledgerRepository.createSnapshot(),
        restore: (snapshot) => this.ledgerRepository.restoreSnapshot(snapshot as ReturnType<LedgerRepository['createSnapshot']>)
      },
      {
        key: 'events',
        snapshot: () => this.eventsService.createSnapshot(),
        restore: (snapshot) => this.eventsService.restoreSnapshot(snapshot as ReturnType<EventsService['createSnapshot']>)
      }
    ];
  }
}
