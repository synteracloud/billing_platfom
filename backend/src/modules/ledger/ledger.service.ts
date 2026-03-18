import { BadRequestException, Injectable, NotFoundException } from '@nestjs/common';
import { FinancialTransactionManager, TransactionParticipant } from '../../common/transactions/financial-transaction.manager';
import { DomainEvent } from '../events/entities/event.entity';
import { EventsService } from '../events/events.service';
import { LedgerRepository, createDeterministicLedgerId } from './ledger.repository';
import { JournalEntryDetails } from './entities/journal-entry.entity';

@Injectable()
export class LedgerService {
  constructor(
    private readonly eventsService: EventsService,
    private readonly ledgerRepository: LedgerRepository,
    private readonly transactionManager: FinancialTransactionManager
  ) {}

  async postEvent(tenantId: string, eventId: string, requestIdempotencyKey?: string, ruleVersion = 1): Promise<JournalEntryDetails> {
    return this.transactionManager.wrapper(() => {
      const sourceEvent = this.eventsService.getEvent(tenantId, eventId);
      if (!sourceEvent) {
        throw new NotFoundException('Source event not found');
      }

      this.ensureSupported(sourceEvent);
      const effectiveIdempotencyKey = requestIdempotencyKey?.trim() || `journal-post:${sourceEvent.id}:${ruleVersion}`;

      const existing = this.ledgerRepository.findBySourceEvent(tenantId, sourceEvent.id, ruleVersion);
      if (existing) {
        return existing;
      }

      const duplicateByKey = this.ledgerRepository.findByIdempotencyKey(tenantId, effectiveIdempotencyKey);
      if (duplicateByKey) {
        if (duplicateByKey.source_event_id !== sourceEvent.id || duplicateByKey.rule_version !== ruleVersion) {
          throw new BadRequestException('idempotency key is already bound to a different posting request');
        }

        return duplicateByKey;
      }

      const journalEntry = this.buildJournalEntry(sourceEvent, effectiveIdempotencyKey, ruleVersion);
      const created = this.ledgerRepository.create(journalEntry);

      this.eventsService.logEvent({
        tenant_id: tenantId,
        type: 'accounting.journal.posted.v1',
        aggregate_type: 'journal_entry',
        aggregate_id: created.id,
        aggregate_version: 1,
        idempotency_key: `journal-event:${sourceEvent.id}:${ruleVersion}`,
        causation_id: sourceEvent.id,
        correlation_id: sourceEvent.correlation_id,
        payload: {
          journal_entry_id: created.id,
          source_type: sourceEvent.type,
          source_id: sourceEvent.aggregate_id,
          source_event_id: sourceEvent.id,
          currency_code: created.currency_code,
          line_count: created.line_count
        }
      });

      return created;
    }, this.financialParticipants());
  }

  private ensureSupported(event: DomainEvent): void {
    if (!['billing.invoice.issued.v1', 'billing.payment.settled.v1', 'billing.payment.refunded.v1'].includes(event.type)) {
      throw new BadRequestException(`No posting rule for event type ${event.type}`);
    }
  }

  private buildJournalEntry(event: DomainEvent, idempotencyKey: string, ruleVersion: number): JournalEntryDetails {
    const currencyCode = this.currencyForEvent(event);
    const amountMinor = this.amountForEvent(event);
    const entryId = createDeterministicLedgerId([event.tenant_id, event.id, String(ruleVersion)]);
    const lineSeed = [event.tenant_id, event.id, String(ruleVersion), currencyCode, String(amountMinor)];
    const accounts = this.accountsForEvent(event);
    const occurredDate = event.occurred_at.slice(0, 10);

    return {
      id: entryId,
      tenant_id: event.tenant_id,
      source_event_id: event.id,
      source_event_type: event.type,
      source_aggregate_id: event.aggregate_id,
      rule_version: ruleVersion,
      idempotency_key: idempotencyKey,
      currency_code: currencyCode,
      entry_date: occurredDate,
      line_count: 2,
      lines: [
        {
          id: createDeterministicLedgerId([...lineSeed, 'debit']),
          tenant_id: event.tenant_id,
          journal_entry_id: entryId,
          account_code: accounts.debit,
          direction: 'debit',
          amount_minor: amountMinor,
          currency_code: currencyCode,
          created_at: event.recorded_at
        },
        {
          id: createDeterministicLedgerId([...lineSeed, 'credit']),
          tenant_id: event.tenant_id,
          journal_entry_id: entryId,
          account_code: accounts.credit,
          direction: 'credit',
          amount_minor: amountMinor,
          currency_code: currencyCode,
          created_at: event.recorded_at
        }
      ],
      created_at: event.recorded_at
    };
  }

  private currencyForEvent(event: DomainEvent): string {
    if ('currency_code' in event.payload && typeof event.payload.currency_code === 'string') {
      return event.payload.currency_code;
    }

    throw new BadRequestException(`Event ${event.id} is missing currency_code`);
  }

  private amountForEvent(event: DomainEvent): number {
    if ('total_minor' in event.payload && typeof event.payload.total_minor === 'number') {
      return event.payload.total_minor;
    }

    if ('amount_minor' in event.payload && typeof event.payload.amount_minor === 'number') {
      return event.payload.amount_minor;
    }

    throw new BadRequestException(`Event ${event.id} is missing amount for posting`);
  }

  private accountsForEvent(event: DomainEvent): { debit: string; credit: string } {
    switch (event.type) {
      case 'billing.invoice.issued.v1':
        return { debit: 'accounts_receivable', credit: 'revenue' };
      case 'billing.payment.settled.v1':
        return { debit: 'cash', credit: 'accounts_receivable' };
      case 'billing.payment.refunded.v1':
        return { debit: 'accounts_receivable', credit: 'cash' };
      default:
        throw new BadRequestException(`No posting rule for event type ${event.type}`);
    }
  }

  private financialParticipants(): TransactionParticipant[] {
    return [
      {
        key: 'events',
        snapshot: () => this.eventsService.createSnapshot(),
        restore: (snapshot) => this.eventsService.restoreSnapshot(snapshot as ReturnType<EventsService['createSnapshot']>)
      },
      {
        key: 'ledger',
        snapshot: () => this.ledgerRepository.createSnapshot(),
        restore: (snapshot) => this.ledgerRepository.restoreSnapshot(snapshot as ReturnType<LedgerRepository['createSnapshot']>)
      }
    ];
  }
}
