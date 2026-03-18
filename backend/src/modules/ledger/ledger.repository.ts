import { Injectable } from '@nestjs/common';
import { JournalEntryEntity } from './entities/journal-entry.entity';
import { JournalLineEntity } from './entities/journal-line.entity';

@Injectable()
export class LedgerRepository {
  private readonly journalEntries = new Map<string, JournalEntryEntity>();
  private readonly journalLines = new Map<string, JournalLineEntity>();
  private readonly idempotencyIndex = new Map<string, string>();

  findBySourceEvent(tenantId: string, sourceEventId: string, ruleVersion: string): (JournalEntryEntity & { lines: JournalLineEntity[] }) | undefined {
    const existingId = this.idempotencyIndex.get(this.toIdempotencyKey(tenantId, sourceEventId, ruleVersion));
    if (!existingId) {
      return undefined;
    }

    return this.findById(tenantId, existingId);
  }

  findById(tenantId: string, journalEntryId: string): (JournalEntryEntity & { lines: JournalLineEntity[] }) | undefined {
    const entry = this.journalEntries.get(journalEntryId);
    if (!entry || entry.tenant_id !== tenantId) {
      return undefined;
    }

    return {
      ...entry,
      lines: this.listLines(tenantId, journalEntryId)
    };
  }

  create(entry: JournalEntryEntity, lines: JournalLineEntity[]): JournalEntryEntity & { lines: JournalLineEntity[] } {
    this.journalEntries.set(entry.id, { ...entry });
    this.idempotencyIndex.set(this.toIdempotencyKey(entry.tenant_id, entry.source_event_id, entry.rule_version), entry.id);

    for (const line of lines) {
      this.journalLines.set(line.id, { ...line });
    }

    return {
      ...entry,
      lines: this.listLines(entry.tenant_id, entry.id)
    };
  }

  listLines(tenantId: string, journalEntryId: string): JournalLineEntity[] {
    return [...this.journalLines.values()]
      .filter((line) => line.tenant_id === tenantId && line.journal_entry_id === journalEntryId)
      .sort((left, right) => left.line_number - right.line_number)
      .map((line) => ({ ...line }));
  }

  createSnapshot(): {
    journalEntries: Map<string, JournalEntryEntity>;
    journalLines: Map<string, JournalLineEntity>;
    idempotencyIndex: Map<string, string>;
  } {
    return {
      journalEntries: new Map([...this.journalEntries.entries()].map(([id, entry]) => [id, { ...entry }])),
      journalLines: new Map([...this.journalLines.entries()].map(([id, line]) => [id, { ...line }])),
      idempotencyIndex: new Map(this.idempotencyIndex.entries())
    };
  }

  restoreSnapshot(snapshot: {
    journalEntries: Map<string, JournalEntryEntity>;
    journalLines: Map<string, JournalLineEntity>;
    idempotencyIndex: Map<string, string>;
  }): void {
    this.journalEntries.clear();
    this.journalLines.clear();
    this.idempotencyIndex.clear();

    for (const [id, entry] of snapshot.journalEntries.entries()) {
      this.journalEntries.set(id, { ...entry });
    }

    for (const [id, line] of snapshot.journalLines.entries()) {
      this.journalLines.set(id, { ...line });
    }

    for (const [key, entryId] of snapshot.idempotencyIndex.entries()) {
      this.idempotencyIndex.set(key, entryId);
    }
  }

  private toIdempotencyKey(tenantId: string, sourceEventId: string, ruleVersion: string): string {
    return `${tenantId}::${sourceEventId}::${ruleVersion}`;
  }
}
