import { ConflictException, Injectable } from '@nestjs/common';
import { JournalEntryEntity } from './entities/journal-entry.entity';
import { JournalLineEntity } from './entities/journal-line.entity';

@Injectable()
export class LedgerRepository {
  private readonly journalEntries = new Map<string, JournalEntryEntity>();
  private readonly journalLines = new Map<string, JournalLineEntity>();
  private readonly idempotencyIndex = new Map<string, string>();
  private readonly requestIdempotencyIndex = new Map<string, string>();
  private readonly journalEntryLineIds = new Map<string, string[]>();
  private readonly tenantEntryIds = new Map<string, string[]>();
  private readonly tenantAccountEntryIds = new Map<string, string[]>();

  findBySourceEvent(tenantId: string, sourceEventId: string, ruleVersion: string): (JournalEntryEntity & { lines: JournalLineEntity[] }) | undefined {
    const existingId = this.idempotencyIndex.get(this.toIdempotencyKey(tenantId, sourceEventId, ruleVersion));
    if (!existingId) {
      return undefined;
    }

    return this.findById(tenantId, existingId);
  }

  findByRequestIdempotency(tenantId: string, requestKey: string): (JournalEntryEntity & { lines: JournalLineEntity[] }) | undefined {
    const existingId = this.requestIdempotencyIndex.get(this.toRequestIdempotencyKey(tenantId, requestKey));
    return existingId ? this.findById(tenantId, existingId) : undefined;
  }

  bindRequestIdempotency(tenantId: string, requestKey: string, journalEntryId: string): void {
    const compositeKey = this.toRequestIdempotencyKey(tenantId, requestKey);
    const existingId = this.requestIdempotencyIndex.get(compositeKey);
    if (existingId && existingId !== journalEntryId) {
      throw new ConflictException('request idempotency key is already bound to another journal entry');
    }

    this.requestIdempotencyIndex.set(compositeKey, journalEntryId);
  }

  findById(tenantId: string, journalEntryId: string): (JournalEntryEntity & { lines: JournalLineEntity[] }) | undefined {
    const entry = this.journalEntries.get(journalEntryId);
    if (!entry || entry.tenant_id !== tenantId) {
      return undefined;
    }

    return this.freeze({
      ...entry,
      lines: this.freeze(this.listLines(tenantId, journalEntryId))
    });
  }

  create(entry: JournalEntryEntity, lines: JournalLineEntity[]): JournalEntryEntity & { lines: JournalLineEntity[] } {
    this.journalEntries.set(entry.id, this.freeze({ ...entry }));
    this.idempotencyIndex.set(this.toIdempotencyKey(entry.tenant_id, entry.source_event_id, entry.rule_version), entry.id);

    const seenLineNumbers = new Set<number>();
    const touchedAccountCodes = new Set<string>();
    for (const line of lines) {
      if (seenLineNumbers.has(line.line_number)) {
        throw new ConflictException(`Duplicate journal line_number detected: ${line.line_number}`);
      }
      seenLineNumbers.add(line.line_number);
      touchedAccountCodes.add(line.account_code);
      this.journalLines.set(line.id, this.freeze({ ...line }));
      const existingLineIds = this.journalEntryLineIds.get(entry.id) ?? [];
      existingLineIds.push(line.id);
      this.journalEntryLineIds.set(entry.id, existingLineIds);
    }

    const tenantEntries = this.tenantEntryIds.get(entry.tenant_id) ?? [];
    tenantEntries.push(entry.id);
    this.tenantEntryIds.set(entry.tenant_id, tenantEntries);

    for (const accountCode of touchedAccountCodes) {
      const accountKey = this.toTenantAccountKey(entry.tenant_id, accountCode);
      const entryIds = this.tenantAccountEntryIds.get(accountKey) ?? [];
      entryIds.push(entry.id);
      this.tenantAccountEntryIds.set(accountKey, entryIds);
    }

    return this.findById(entry.tenant_id, entry.id)!;
  }

  listLines(tenantId: string, journalEntryId: string): JournalLineEntity[] {
    const lineIds = this.journalEntryLineIds.get(journalEntryId) ?? [];

    return lineIds
      .map((lineId) => this.journalLines.get(lineId))
      .filter((line): line is JournalLineEntity => Boolean(line && line.tenant_id === tenantId && line.journal_entry_id === journalEntryId))
      .sort((left, right) => left.line_number - right.line_number)
      .map((line) => this.freeze({ ...line }));
  }

  listEntries(tenantId: string): Array<JournalEntryEntity & { lines: JournalLineEntity[] }> {
    const entryIds = this.tenantEntryIds.get(tenantId) ?? [];
    return entryIds
      .map((entryId) => this.findById(tenantId, entryId))
      .filter((entry): entry is JournalEntryEntity & { lines: JournalLineEntity[] } => Boolean(entry))
      .sort((left, right) => left.created_at.localeCompare(right.created_at) || left.id.localeCompare(right.id));
  }

  listEntriesByAccount(tenantId: string, accountCode: string): Array<JournalEntryEntity & { lines: JournalLineEntity[] }> {
    const entryIds = this.tenantAccountEntryIds.get(this.toTenantAccountKey(tenantId, accountCode)) ?? [];
    return entryIds
      .map((entryId) => this.findById(tenantId, entryId))
      .filter((entry): entry is JournalEntryEntity & { lines: JournalLineEntity[] } => Boolean(entry))
      .sort((left, right) => left.created_at.localeCompare(right.created_at) || left.id.localeCompare(right.id));
  }

  createSnapshot(): {
    journalEntries: Map<string, JournalEntryEntity>;
    journalLines: Map<string, JournalLineEntity>;
    idempotencyIndex: Map<string, string>;
    requestIdempotencyIndex: Map<string, string>;
    journalEntryLineIds: Map<string, string[]>;
    tenantEntryIds: Map<string, string[]>;
    tenantAccountEntryIds: Map<string, string[]>;
  } {
    return {
      journalEntries: new Map([...this.journalEntries.entries()].map(([id, entry]) => [id, this.freeze({ ...entry })])),
      journalLines: new Map([...this.journalLines.entries()].map(([id, line]) => [id, this.freeze({ ...line })])),
      idempotencyIndex: new Map(this.idempotencyIndex.entries()),
      requestIdempotencyIndex: new Map(this.requestIdempotencyIndex.entries()),
      journalEntryLineIds: new Map([...this.journalEntryLineIds.entries()].map(([entryId, lineIds]) => [entryId, [...lineIds]])),
      tenantEntryIds: new Map([...this.tenantEntryIds.entries()].map(([tenantId, entryIds]) => [tenantId, [...entryIds]])),
      tenantAccountEntryIds: new Map([...this.tenantAccountEntryIds.entries()].map(([compositeKey, entryIds]) => [compositeKey, [...entryIds]]))
    };
  }

  restoreSnapshot(snapshot: {
    journalEntries: Map<string, JournalEntryEntity>;
    journalLines: Map<string, JournalLineEntity>;
    idempotencyIndex: Map<string, string>;
    requestIdempotencyIndex: Map<string, string>;
    journalEntryLineIds: Map<string, string[]>;
    tenantEntryIds: Map<string, string[]>;
    tenantAccountEntryIds: Map<string, string[]>;
  }): void {
    this.journalEntries.clear();
    this.journalLines.clear();
    this.idempotencyIndex.clear();
    this.requestIdempotencyIndex.clear();
    this.journalEntryLineIds.clear();
    this.tenantEntryIds.clear();
    this.tenantAccountEntryIds.clear();

    for (const [id, entry] of snapshot.journalEntries.entries()) {
      this.journalEntries.set(id, this.freeze({ ...entry }));
    }

    for (const [id, line] of snapshot.journalLines.entries()) {
      this.journalLines.set(id, this.freeze({ ...line }));
    }

    for (const [key, entryId] of snapshot.idempotencyIndex.entries()) {
      this.idempotencyIndex.set(key, entryId);
    }

    for (const [key, entryId] of snapshot.requestIdempotencyIndex.entries()) {
      this.requestIdempotencyIndex.set(key, entryId);
    }

    for (const [entryId, lineIds] of snapshot.journalEntryLineIds.entries()) {
      this.journalEntryLineIds.set(entryId, [...lineIds]);
    }

    for (const [tenantId, entryIds] of snapshot.tenantEntryIds.entries()) {
      this.tenantEntryIds.set(tenantId, [...entryIds]);
    }

    for (const [compositeKey, entryIds] of snapshot.tenantAccountEntryIds.entries()) {
      this.tenantAccountEntryIds.set(compositeKey, [...entryIds]);
    }
  }

  private toIdempotencyKey(tenantId: string, sourceEventId: string, ruleVersion: string): string {
    return `${tenantId}::${sourceEventId}::${ruleVersion}`;
  }

  private toRequestIdempotencyKey(tenantId: string, requestKey: string): string {
    return `${tenantId}::request::${requestKey}`;
  }

  private toTenantAccountKey(tenantId: string, accountCode: string): string {
    return `${tenantId}::account::${accountCode}`;
  }

  private freeze<T>(value: T): T {
    if (value && typeof value === 'object' && !Object.isFrozen(value)) {
      Object.freeze(value);
    }
    return value;
  }
}
