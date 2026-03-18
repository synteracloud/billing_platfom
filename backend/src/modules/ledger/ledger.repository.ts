import { ConflictException, Injectable } from '@nestjs/common';
import { randomUUID } from 'crypto';
import { JournalEntryEntity } from './entities/journal-entry.entity';
import { JournalLineEntity } from './entities/journal-line.entity';

type LedgerSnapshot = {
  entries: Map<string, JournalEntryEntity>;
  lines: Map<string, JournalLineEntity>;
  entryIndex: Map<string, string>;
};

@Injectable()
export class LedgerRepository {
  private readonly entries = new Map<string, JournalEntryEntity>();
  private readonly lines = new Map<string, JournalLineEntity>();
  private readonly entryIndex = new Map<string, string>();

  findBySourceEvent(tenantId: string, sourceEventId: string, ruleVersion: string): JournalEntryEntity | undefined {
    const indexedId = this.entryIndex.get(this.toSourceKey(tenantId, sourceEventId, ruleVersion));
    return indexedId ? this.entries.get(indexedId) : undefined;
  }

  createEntry(entry: Omit<JournalEntryEntity, 'id' | 'created_at' | 'updated_at'>): JournalEntryEntity {
    const sourceKey = this.toSourceKey(entry.tenant_id, entry.source_event_id, entry.rule_version);
    const existingId = this.entryIndex.get(sourceKey);
    if (existingId) {
      const existing = this.entries.get(existingId);
      if (existing) {
        return existing;
      }
    }

    const now = new Date().toISOString();
    const created: JournalEntryEntity = {
      ...entry,
      id: randomUUID(),
      created_at: now,
      updated_at: now
    };

    this.entries.set(created.id, created);
    this.entryIndex.set(sourceKey, created.id);
    return created;
  }

  createLine(line: Omit<JournalLineEntity, 'id' | 'created_at' | 'updated_at'>): JournalLineEntity {
    const entry = this.entries.get(line.journal_entry_id);
    if (!entry || entry.tenant_id !== line.tenant_id) {
      throw new ConflictException('Foreign key violation for journal_entry_id');
    }

    const now = new Date().toISOString();
    const created: JournalLineEntity = {
      ...line,
      id: randomUUID(),
      created_at: now,
      updated_at: now
    };

    this.lines.set(created.id, created);
    return created;
  }

  listEntriesByBatch(tenantId: string, batchId: string): JournalEntryEntity[] {
    return [...this.entries.values()]
      .filter((entry) => entry.tenant_id === tenantId && entry.batch_id === batchId)
      .sort((a, b) => a.created_at.localeCompare(b.created_at));
  }

  listLinesByEntry(tenantId: string, journalEntryId: string): JournalLineEntity[] {
    return [...this.lines.values()]
      .filter((line) => line.tenant_id === tenantId && line.journal_entry_id === journalEntryId)
      .sort((a, b) => a.created_at.localeCompare(b.created_at));
  }

  createSnapshot(): LedgerSnapshot {
    return {
      entries: new Map([...this.entries.entries()].map(([id, entry]) => [id, this.clone(entry)])),
      lines: new Map([...this.lines.entries()].map(([id, line]) => [id, this.clone(line)])),
      entryIndex: new Map(this.entryIndex.entries())
    };
  }

  restoreSnapshot(snapshot: LedgerSnapshot): void {
    this.entries.clear();
    this.lines.clear();
    this.entryIndex.clear();

    for (const [id, entry] of snapshot.entries.entries()) {
      this.entries.set(id, this.clone(entry));
    }
    for (const [id, line] of snapshot.lines.entries()) {
      this.lines.set(id, this.clone(line));
    }
    for (const [key, value] of snapshot.entryIndex.entries()) {
      this.entryIndex.set(key, value);
    }
  }

  private toSourceKey(tenantId: string, sourceEventId: string, ruleVersion: string): string {
    return `${tenantId}::${sourceEventId}::${ruleVersion}`;
  }

  private clone<T>(value: T): T {
    return JSON.parse(JSON.stringify(value)) as T;
  }
}
