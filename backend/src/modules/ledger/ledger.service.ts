import { BadRequestException, ConflictException, ForbiddenException, Injectable } from '@nestjs/common';
import { createHash } from 'crypto';
import { FinancialTransactionManager, TransactionParticipant } from '../../common/transactions/financial-transaction.manager';
import { UserRole } from '../../common/interfaces/authenticated-request.interface';
import { DEFAULT_CHART_OF_ACCOUNTS, POSTING_RULE_EXPECTATIONS } from '../accounting/chart-of-accounts.defaults';
import { AccountDefinition } from '../accounting/entities/chart-of-account.entity';
import { BillCreatedPayload, BillPaidPayload, DomainEvent, InvoiceCreatedPayload, InvoiceIssuedPayload, PaymentRecordedPayload, PaymentRefundedPayload, PaymentSettledPayload } from '../events/entities/event.entity';
import { EventsService } from '../events/events.service';
import { CreateAdjustmentEntryDto, CreateManualJournalEntryDto } from './dto/manual-journal-entry.dto';
import { JournalEntryEntity } from './entities/journal-entry.entity';
import { JournalLineDirection, JournalLineEntity } from './entities/journal-line.entity';
import { LedgerRepository } from './ledger.repository';
import { CreateReversalEntryDto } from './dto/create-reversal-entry.dto';

const SUPPORTED_EVENT_NAMES = new Set([
  'billing.invoice.created.v1',
  'billing.invoice.issued.v1',
  'billing.payment.recorded.v1',
  'billing.payment.settled.v1',
  'billing.payment.refunded.v1',
  'billing.bill.created.v1',
  'billing.bill.approved.v1',
  'billing.bill.paid.v1',
  'accounting.manual.journal.posted.v1',
  'accounting.adjustment.journal.posted.v1',
  'accounting.journal.reversed.v1'
]);

const SYSTEM_ACCOUNT_INDEX = new Map(DEFAULT_CHART_OF_ACCOUNTS.map((account) => [account.code, account]));
const EVENT_REQUIRED_ACCOUNT_CODES = new Map(
  POSTING_RULE_EXPECTATIONS.map((expectation) => [
    expectation.eventType,
    expectation.requiredAccounts.map((requiredAccount) => DEFAULT_CHART_OF_ACCOUNTS.find((account) => account.key === requiredAccount.key)?.code).filter(Boolean) as string[]
  ])
);

const EVENT_DIRECTIONAL_ACCOUNT_RULES = new Map<string, Array<{ direction: JournalLineDirection; codes: string[] }>>([
  ['billing.invoice.created.v1', [
    { direction: 'debit', codes: ['1100'] },
    { direction: 'credit', codes: ['4000', '2100'] }
  ]],
  ['billing.invoice.issued.v1', [
    { direction: 'debit', codes: ['1100'] },
    { direction: 'credit', codes: ['4000', '2100'] }
  ]],
  ['billing.payment.settled.v1', [
    { direction: 'debit', codes: ['1000', '1010'] },
    { direction: 'credit', codes: ['1100', '2200'] }
  ]],
  ['billing.payment.recorded.v1', [
    { direction: 'debit', codes: ['1000', '1010'] },
    { direction: 'credit', codes: ['2200'] }
  ]],
  ['billing.payment.refunded.v1', [
    { direction: 'debit', codes: ['5010', '1100'] },
    { direction: 'credit', codes: ['1000'] }
  ]],
  ['billing.bill.approved.v1', [
    { direction: 'debit', codes: ['5000'] },
    { direction: 'credit', codes: ['2000'] }
  ]],
  ['billing.bill.created.v1', [
    { direction: 'debit', codes: ['5000'] },
    { direction: 'credit', codes: ['2000'] }
  ]],
  ['billing.bill.paid.v1', [
    { direction: 'debit', codes: ['2000'] },
    { direction: 'credit', codes: ['1000'] }
  ]]
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
  metadata?: Record<string, unknown> | null;
  entries: PostingLineInput[];
}

@Injectable()
export class LedgerService {
  constructor(
    private readonly ledgerRepository: LedgerRepository,
    private readonly eventsService: EventsService,
    private readonly transactionManager: FinancialTransactionManager
  ) {
    this.validateSystemChartOfAccounts();
  }

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
        metadata: normalized.metadata,
        created_at: normalized.created_at
      };

      const created = this.ledgerRepository.create(entry, lines);
      this.eventsService.logMutation({
        tenant_id: normalized.tenant_id,
        entity_type: 'journal_entry',
        entity_id: created.id,
        action: 'posted',
        aggregate_version: 1,
        correlation_id: normalized.source_id,
        causation_id: normalized.source_event_id,
        idempotency_key: `audit:journal_entry:${normalized.source_event_id}:${normalized.rule_version}`,
        payload: { after: created, lines: created.lines, source_event_id: normalized.source_event_id }
      });
      this.eventsService.logEvent({
        tenant_id: normalized.tenant_id,
        type: 'accounting.journal.posted.v1',
        aggregate_type: 'journal_entry',
        aggregate_id: created.id,
        aggregate_version: 1,
        correlation_id: normalized.source_id,
        causation_id: normalized.source_event_id,
        idempotency_key: `accounting.journal.posted.v1:${normalized.source_event_id}:${normalized.rule_version}`,
        payload: {
          journal_entry_id: created.id,
          source_type: created.source_type,
          source_id: created.source_id,
          source_event_id: created.source_event_id,
          currency_code: created.currency_code,
          line_count: created.lines.length,
          batch_id: created.id
        }
      });

      return created;
    }, this.transactionParticipants());
  }

  postEvent(tenantId: string, eventId: string, requestIdempotencyKey?: string, ruleVersion: string | number = '1'): Promise<JournalEntryEntity & { lines: JournalLineEntity[] }> {
    return this.transactionManager.wrapper(async () => {
      const normalizedTenantId = tenantId.trim();
      const normalizedRuleVersion = String(ruleVersion).trim();
      const normalizedRequestKey = requestIdempotencyKey?.trim() || null;

      if (!normalizedTenantId) {
        throw new BadRequestException('tenant_id is required');
      }

      if (!eventId?.trim()) {
        throw new BadRequestException('event_id is required');
      }

      if (!normalizedRuleVersion) {
        throw new BadRequestException('rule_version is required');
      }

      if (normalizedRequestKey) {
        const boundEntry = this.ledgerRepository.findByRequestIdempotency(normalizedTenantId, normalizedRequestKey);
        if (boundEntry && boundEntry.source_event_id !== eventId) {
          throw new ConflictException('request idempotency key is already bound to another event');
        }

        if (boundEntry) {
          return boundEntry;
        }
      }

      return this.eventsService.consumeEventOnce(normalizedTenantId, `ledger-posting:${normalizedRuleVersion}`, eventId, async (event) => {
        const existing = this.ledgerRepository.findBySourceEvent(normalizedTenantId, event.id, normalizedRuleVersion);
        if (existing) {
          if (normalizedRequestKey) {
            this.ledgerRepository.bindRequestIdempotency(normalizedTenantId, normalizedRequestKey, existing.id);
          }
          return existing;
        }

        const created = await this.post(this.buildPostingTransaction(event, normalizedRuleVersion));
        if (normalizedRequestKey) {
          this.ledgerRepository.bindRequestIdempotency(normalizedTenantId, normalizedRequestKey, created.id);
        }
        return created;
      }).then((result) => {
        if (!result) {
          const existing = this.ledgerRepository.findBySourceEvent(normalizedTenantId, eventId, normalizedRuleVersion);
          if (!existing) {
            throw new ConflictException('Event consumption completed without a ledger posting result');
          }
          return existing;
        }
        return result;
      });
    }, this.transactionParticipants());
  }

  getJournalEntry(tenantId: string, journalEntryId: string): (JournalEntryEntity & { lines: JournalLineEntity[] }) | undefined {
    return this.ledgerRepository.findById(tenantId, journalEntryId);
  }

  createManualJournalEntry(
    tenantId: string,
    actorRole: UserRole,
    payload: CreateManualJournalEntryDto,
    requestIdempotencyKey?: string
  ): Promise<JournalEntryEntity & { lines: JournalLineEntity[] }> {
    this.assertManualPostingRole(actorRole);
    const sourceId = payload.source_id?.trim();
    if (!sourceId) {
      throw new BadRequestException('source_id is required');
    }

    const sourceEventId = this.createDeterministicId('manual-journal', tenantId, sourceId, payload.entry_date, payload.currency_code, JSON.stringify(payload.lines));
    const requestKey = requestIdempotencyKey?.trim();
    if (requestKey) {
      const existing = this.ledgerRepository.findByRequestIdempotency(tenantId, requestKey);
      if (existing) {
        return Promise.resolve(existing);
      }
    }

    return this.post({
      tenant_id: tenantId,
      source_type: 'manual_journal_entry',
      source_id: sourceId,
      source_event_id: sourceEventId,
      event_name: 'accounting.manual.journal.posted.v1',
      rule_version: 'manual.v1',
      entry_date: payload.entry_date,
      currency_code: payload.currency_code,
      description: payload.description ?? 'Manual journal entry',
      entries: payload.lines.map((line) => ({
        account_code: line.account_code,
        account_name: line.account_name,
        direction: line.direction,
        amount_minor: line.amount_minor,
        currency_code: payload.currency_code
      }))
    }).then((created) => {
      if (requestKey) {
        this.ledgerRepository.bindRequestIdempotency(tenantId, requestKey, created.id);
      }
      return created;
    });
  }

  createAdjustmentEntry(
    tenantId: string,
    actorRole: UserRole,
    payload: CreateAdjustmentEntryDto,
    requestIdempotencyKey?: string
  ): Promise<JournalEntryEntity & { lines: JournalLineEntity[] }> {
    this.assertManualPostingRole(actorRole);
    const sourceId = payload.source_id?.trim();
    if (!sourceId) {
      throw new BadRequestException('source_id is required');
    }

    const adjustmentReference = payload.adjusts_journal_entry_id?.trim() || null;
    if (adjustmentReference) {
      const referencedEntry = this.ledgerRepository.findById(tenantId, adjustmentReference);
      if (!referencedEntry) {
        throw new BadRequestException(`Referenced journal_entry ${adjustmentReference} was not found`);
      }
    }

    const sourceEventId = this.createDeterministicId('adjustment-journal', tenantId, sourceId, payload.entry_date, payload.currency_code, JSON.stringify(payload.lines), adjustmentReference ?? 'none');

    return this.post({
      tenant_id: tenantId,
      source_type: 'adjustment_journal_entry',
      source_id: sourceId,
      source_event_id: sourceEventId,
      event_name: 'accounting.adjustment.journal.posted.v1',
      rule_version: 'manual-adjustment.v1',
      entry_date: payload.entry_date,
      currency_code: payload.currency_code,
      description: payload.description ?? `Adjustment entry${adjustmentReference ? ` for ${adjustmentReference}` : ''}`,
      metadata: adjustmentReference ? { adjustment_of_journal_entry_id: adjustmentReference } : null,
      entries: payload.lines.map((line) => ({
        account_code: line.account_code,
        account_name: line.account_name,
        direction: line.direction,
        amount_minor: line.amount_minor,
        currency_code: payload.currency_code
      }))
    }).then((created) => {
      const requestKey = requestIdempotencyKey?.trim();
      if (requestKey) {
        this.ledgerRepository.bindRequestIdempotency(tenantId, requestKey, created.id);
      }

      return created;
    });
  }

  createReversalEntry(
    tenantId: string,
    actorRole: UserRole,
    originalJournalEntryId: string,
    payload: CreateReversalEntryDto,
    requestIdempotencyKey?: string
  ): Promise<JournalEntryEntity & { lines: JournalLineEntity[] }> {
    this.assertManualPostingRole(actorRole);
    const original = this.ledgerRepository.findById(tenantId, originalJournalEntryId);
    if (!original) {
      throw new BadRequestException(`journal_entry ${originalJournalEntryId} was not found`);
    }

    const normalizedSourceId = payload.source_id?.trim();
    if (!normalizedSourceId) {
      throw new BadRequestException('source_id is required');
    }

    const sourceEventId = this.createDeterministicId(
      'reversal-journal',
      tenantId,
      original.id,
      normalizedSourceId,
      payload.reversal_date,
      original.source_event_id,
      original.rule_version
    );

    return this.post({
      tenant_id: tenantId,
      source_type: 'reversal_journal_entry',
      source_id: normalizedSourceId,
      source_event_id: sourceEventId,
      event_name: 'accounting.journal.reversed.v1',
      rule_version: 'manual-reversal.v1',
      entry_date: payload.reversal_date,
      currency_code: original.currency_code,
      description: payload.reason?.trim() || `Reversal of ${original.id}`,
      metadata: {
        reversal_of_journal_entry_id: original.id,
        reversal_of_source_event_id: original.source_event_id
      },
      entries: original.lines.map((line) => ({
        account_code: line.account_code,
        account_name: line.account_name,
        direction: line.direction === 'debit' ? 'credit' : 'debit',
        amount_minor: line.amount_minor,
        currency_code: line.currency_code
      }))
    }).then((created) => {
      const requestKey = requestIdempotencyKey?.trim();
      if (requestKey) {
        this.ledgerRepository.bindRequestIdempotency(tenantId, requestKey, created.id);
      }
      return created;
    });
  }

  private validateAndNormalize(transaction: PostingTransactionInput): PostingTransactionInput & { created_at: string; description: string | null; metadata: Record<string, unknown> | null } {
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

      if (entry.direction !== 'debit' && entry.direction !== 'credit') {
        throw new BadRequestException('Each entry direction must be debit or credit');
      }

      if (!Number.isInteger(entry.amount_minor) || entry.amount_minor <= 0) {
        throw new BadRequestException('Each entry amount_minor must be an integer greater than zero');
      }

      if (!entry.currency_code?.trim()) {
        throw new BadRequestException('Each entry currency_code is required');
      }

      const accountCode = entry.account_code.trim();
      const account = SYSTEM_ACCOUNT_INDEX.get(accountCode);
      if (!account) {
        throw new BadRequestException(`Unknown ledger account_code: ${accountCode}`);
      }

      return {
        account_code: accountCode,
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

    this.validateRequiredAccounts(transaction.event_name, entries);

    const debitTotal = entries.filter((entry) => entry.direction === 'debit').reduce((sum, entry) => sum + entry.amount_minor, 0);
    const creditTotal = entries.filter((entry) => entry.direction === 'credit').reduce((sum, entry) => sum + entry.amount_minor, 0);

    if (debitTotal !== creditTotal) {
      throw new BadRequestException('Unbalanced posting: debit total must equal credit total');
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
      metadata: transaction.metadata ?? null,
      entries,
      created_at: new Date().toISOString()
    };
  }

  private buildPostingTransaction(event: DomainEvent, ruleVersion: string): PostingTransactionInput {
    const eventType = event.type as string;

    switch (eventType) {
      case 'billing.invoice.created.v1': {
        const payload = event.payload as InvoiceCreatedPayload;
        return {
          tenant_id: event.tenant_id,
          source_type: 'invoice',
          source_id: payload.invoice_id,
          source_event_id: event.id,
          event_name: eventType,
          rule_version: ruleVersion,
          entry_date: event.occurred_at.slice(0, 10),
          currency_code: payload.currency_code,
          description: `Invoice created ${payload.invoice_id}`,
          entries: [
            this.createPostingLine('1100', 'Accounts Receivable', 'debit', payload.total_minor, payload.currency_code),
            this.createPostingLine('4000', 'Revenue', 'credit', payload.total_minor, payload.currency_code)
          ]
        };
      }
      case 'billing.invoice.issued.v1': {
        const payload = event.payload as InvoiceIssuedPayload;
        return {
          tenant_id: event.tenant_id,
          source_type: 'invoice',
          source_id: payload.invoice_id,
          source_event_id: event.id,
          event_name: eventType,
          rule_version: ruleVersion,
          entry_date: payload.issue_date,
          currency_code: payload.currency_code,
          description: `Invoice issued ${payload.invoice_id}`,
          entries: [
            this.createPostingLine('1100', 'Accounts Receivable', 'debit', payload.total_minor, payload.currency_code),
            this.createPostingLine('4000', 'Revenue', 'credit', payload.total_minor, payload.currency_code)
          ]
        };
      }
      case 'billing.payment.settled.v1': {
        const payload = event.payload as PaymentSettledPayload;
        const allocationContext = this.resolvePaymentAllocationContext(payload);
        return {
          tenant_id: event.tenant_id,
          source_type: 'payment',
          source_id: allocationContext.source_id,
          source_event_id: event.id,
          event_name: eventType,
          rule_version: ruleVersion,
          entry_date: payload.settled_at.slice(0, 10),
          currency_code: payload.currency_code,
          description: allocationContext.description,
          entries: [
            this.createPostingLine('1000', 'Cash', 'debit', allocationContext.allocated_minor, payload.currency_code),
            this.createPostingLine('1100', 'Accounts Receivable', 'credit', allocationContext.allocated_minor, payload.currency_code)
          ]
        };
      }
      case 'billing.payment.recorded.v1': {
        const payload = event.payload as PaymentRecordedPayload;
        const receivedDate = event.occurred_at.slice(0, 10);
        return {
          tenant_id: event.tenant_id,
          source_type: 'payment',
          source_id: payload.payment_id,
          source_event_id: event.id,
          event_name: eventType,
          rule_version: ruleVersion,
          entry_date: receivedDate,
          currency_code: payload.currency_code,
          description: `Payment received ${payload.payment_id}`,
          entries: [
            this.createPostingLine('1000', 'Cash', 'debit', payload.amount_minor, payload.currency_code),
            this.createPostingLine('2200', 'Unallocated Cash', 'credit', payload.amount_minor, payload.currency_code)
          ]
        };
      }
      case 'billing.payment.refunded.v1': {
        const payload = event.payload as PaymentRefundedPayload;
        return {
          tenant_id: event.tenant_id,
          source_type: 'payment',
          source_id: payload.payment_id,
          source_event_id: event.id,
          event_name: eventType,
          rule_version: ruleVersion,
          entry_date: payload.refunded_at.slice(0, 10),
          currency_code: payload.currency_code,
          description: `Payment refunded ${payload.payment_id}`,
          entries: [
            this.createPostingLine('5010', 'Refund Expense', 'debit', payload.amount_minor, payload.currency_code),
            this.createPostingLine('1000', 'Cash', 'credit', payload.amount_minor, payload.currency_code)
          ]
        };
      }
      case 'billing.bill.approved.v1':
        throw new BadRequestException(`Automatic posting for ${eventType} is not yet implemented`);
      case 'billing.bill.paid.v1': {
        const payload = event.payload as BillPaidPayload;
        return {
          tenant_id: event.tenant_id,
          source_type: 'bill',
          source_id: payload.bill_id,
          source_event_id: event.id,
          event_name: eventType,
          rule_version: ruleVersion,
          entry_date: payload.paid_at.slice(0, 10),
          currency_code: payload.currency_code,
          description: `Bill paid ${payload.bill_id}`,
          entries: [
            this.createPostingLine('2000', 'Accounts Payable', 'debit', payload.amount_paid_minor, payload.currency_code),
            this.createPostingLine('1000', 'Cash', 'credit', payload.amount_paid_minor, payload.currency_code)
          ]
        };
      }
      case 'billing.bill.created.v1': {
        const payload = event.payload as BillCreatedPayload;
        return {
          tenant_id: event.tenant_id,
          source_type: 'bill',
          source_id: payload.bill_id,
          source_event_id: event.id,
          event_name: eventType,
          rule_version: ruleVersion,
          entry_date: payload.created_at.slice(0, 10),
          currency_code: payload.currency_code,
          description: `Bill created ${payload.bill_id} (${payload.expense_classification})`,
          entries: [
            this.createPostingLine('5000', 'Expense', 'debit', payload.total_minor, payload.currency_code),
            this.createPostingLine('2000', 'Accounts Payable', 'credit', payload.total_minor, payload.currency_code)
          ]
        };
      }
      default:
        throw new BadRequestException(`Unsupported event_name: ${eventType}`);
    }
  }

  private createPostingLine(accountCode: string, accountName: string, direction: JournalLineDirection, amountMinor: number, currencyCode: string): PostingLineInput {
    return {
      account_code: accountCode,
      account_name: accountName,
      direction,
      amount_minor: amountMinor,
      currency_code: currencyCode
    };
  }

  private resolvePaymentAllocationContext(payload: PaymentSettledPayload): { allocated_minor: number; source_id: string; description: string } {
    const totalSettledMinor = payload.amount_minor;
    const allocatedFromField = Number.isInteger(payload.allocated_minor) ? payload.allocated_minor : null;
    const allocatedFromTotal = Number.isInteger(payload.total_allocated_minor) ? payload.total_allocated_minor : null;
    const allocationChanges = Array.isArray(payload.allocation_changes) ? payload.allocation_changes : [];
    const allocatedFromChanges = allocationChanges
      .map((item) => item.allocated_delta_minor)
      .filter((value) => Number.isInteger(value) && value > 0)
      .reduce((sum, value) => sum + value, 0);
    const allocatedMinor = allocatedFromField
      ?? allocatedFromTotal
      ?? (allocatedFromChanges > 0 ? allocatedFromChanges : totalSettledMinor);

    if (!Number.isInteger(allocatedMinor) || allocatedMinor <= 0) {
      throw new BadRequestException('Payment settled payload must include a positive allocated amount');
    }

    if (allocatedMinor > totalSettledMinor) {
      throw new BadRequestException('Allocated amount cannot exceed settled amount');
    }

    const allocationIds = new Set<string>();
    if (payload.allocation_id?.trim()) {
      allocationIds.add(payload.allocation_id.trim());
    }
    for (const allocationId of payload.allocation_ids ?? []) {
      if (typeof allocationId === 'string' && allocationId.trim()) {
        allocationIds.add(allocationId.trim());
      }
    }

    const allocationReference = Array.from(allocationIds.values()).sort();
    const allocationSuffix = allocationReference.length > 0 ? ` allocations ${allocationReference.join(',')}` : '';
    const sourceId = allocationReference.length > 0
      ? `${payload.payment_id}:${allocationReference.join('+')}`
      : payload.payment_id;

    return {
      allocated_minor: allocatedMinor,
      source_id: sourceId,
      description: `Payment settled ${payload.payment_id}${allocationSuffix}`.trim()
    };
  }

  private validateSystemChartOfAccounts(): void {
    const seenKeys = new Set<string>();
    const seenCodes = new Set<string>();

    for (const account of DEFAULT_CHART_OF_ACCOUNTS) {
      this.assertUniqueAccountField(seenKeys, account.key, 'key');
      this.assertUniqueAccountField(seenCodes, account.code, 'code');
    }

    for (const expectation of POSTING_RULE_EXPECTATIONS) {
      for (const requiredAccount of expectation.requiredAccounts) {
        const account = DEFAULT_CHART_OF_ACCOUNTS.find((candidate) => candidate.key === requiredAccount.key);
        if (!account) {
          throw new Error(`Incomplete chart of accounts: missing required account ${requiredAccount.key}`);
        }

        if (!requiredAccount.allowedTypes.includes(account.type)) {
          throw new Error(`Incomplete chart of accounts: account ${requiredAccount.key} has invalid type ${account.type}`);
        }
      }
    }
  }

  private validateRequiredAccounts(eventName: string, entries: PostingLineInput[]): void {
    const requiredAccountCodes = EVENT_REQUIRED_ACCOUNT_CODES.get(eventName) ?? [];
    if (requiredAccountCodes.length === 0) {
      return;
    }
    const entryAccountCodes = new Set(entries.map((entry) => entry.account_code));
    const covered = requiredAccountCodes.some((code) => entryAccountCodes.has(code));

    if (!covered) {
      throw new BadRequestException(`Posting does not satisfy required accounts for ${eventName}`);
    }

    const directionalRules = EVENT_DIRECTIONAL_ACCOUNT_RULES.get(eventName) ?? [];
    for (const rule of directionalRules) {
      const satisfied = entries.some((entry) => entry.direction === rule.direction && rule.codes.includes(entry.account_code));
      if (!satisfied) {
        throw new BadRequestException(`Posting does not satisfy required accounts for ${eventName}`);
      }
    }
  }

  private assertUniqueAccountField(seenValues: Set<string>, value: string, fieldName: keyof AccountDefinition): void {
    if (seenValues.has(value)) {
      throw new Error(`Incomplete chart of accounts: duplicate account ${fieldName} ${value}`);
    }
    seenValues.add(value);
  }

  private assertManualPostingRole(actorRole: UserRole): void {
    if (actorRole !== 'admin') {
      throw new ForbiddenException('manual journal operations are restricted to admin role');
    }
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
