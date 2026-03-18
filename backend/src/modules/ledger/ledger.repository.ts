import { ConflictException, Injectable } from '@nestjs/common';
import { createHash } from 'crypto';
import { JournalEntryDetails, JournalEntryEntity, JournalLineEntity } from './entities/journal-entry.entity';

@Injectable()
export class LedgerRepository {
  private readonly entries = new Map<string, JournalEntryEntity>();
  private readonly lines = new Map<string, JournalLineEntity>();
  private readonly sourceEventIndex = new Map<string, string>();
  private readonly idempotencyIndex = new Map<string, string>();

  findBySourceEvent(tenantId: string, sourceEventId: string, ruleVersion: number): JournalEntryDetails | undefined {
    const existingId = this.sourceEventIndex.get(this.sourceKey(tenantId, sourceEventId, ruleVersion));
    if (!existingId) {
      return undefined;
    }

    return this.getById(tenantId, existingId);
  }

  findByIdempotencyKey(tenantId: string, idempotencyKey: string): JournalEntryDetails | undefined {
    const existingId = this.idempotencyIndex.get(this.idempotencyKey(tenantId, idempotencyKey));
    if (!existingId) {
      return undefined;
    }

    return this.getById(tenantId, existingId);
  }

  getById(tenantId: string, journalEntryId: string): JournalEntryDetails | undefined {
    const entry = this.entries.get(journalEntryId);
    if (!entry || entry.tenant_id !== tenantId) {
      return undefined;
    }

    return {
      ...entry,
      lines: [...this.lines.values()]
        .filter((line) => line.tenant_id === tenantId && line.journal_entry_id === journalEntryId)
        .sort((a, b) => a.id.localeCompare(b.id))
    };
  }

  create(input: Omit<JournalEntryDetails, 'created_at'>): JournalEntryDetails {
    const sourceKey = this.sourceKey(input.tenant_id, input.source_event_id, input.rule_version);
    const existingForSource = this.sourceEventIndex.get(sourceKey);
    if (existingForSource) {
      const existing = this.getById(input.tenant_id, existingForSource);
      if (existing) {
        return existing;
      }
    }

    const idempotencyKey = this.idempotencyKey(input.tenant_id, input.idempotency_key);
    const existingForIdempotency = this.idempotencyIndex.get(idempotencyKey);
    if (existingForIdempotency) {
      const existing = this.getById(input.tenant_id, existingForIdempotency);
      if (existing) {
        if (existing.source_event_id !== input.source_event_id || existing.rule_version !== input.rule_version) {
          throw new ConflictException('Unique constraint violation for (tenant_id, idempotency_key)');
        }

        return existing;
      }
    }

    const createdAt = new Date().toISOString();
    const entry: JournalEntryEntity = { ...input, created_at: createdAt };
    this.entries.set(entry.id, entry);
    this.sourceEventIndex.set(sourceKey, entry.id);
    this.idempotencyIndex.set(idempotencyKey, entry.id);

    for (const line of input.lines) {
      this.lines.set(line.id, { ...line, created_at: createdAt });
    }

    return this.getById(entry.tenant_id, entry.id)!;
  }

  createSnapshot(): {
    entries: Map<string, JournalEntryEntity>;
    lines: Map<string, JournalLineEntity>;
    sourceEventIndex: Map<string, string>;
    idempotencyIndex: Map<string, string>;
  } {
    return {
      entries: new Map([...this.entries.entries()].map(([id, entry]) => [id, this.clone(entry)])),
      lines: new Map([...this.lines.entries()].map(([id, line]) => [id, this.clone(line)])),
      sourceEventIndex: new Map(this.sourceEventIndex.entries()),
      idempotencyIndex: new Map(this.idempotencyIndex.entries())
    };
  }

  restoreSnapshot(snapshot: {
    entries: Map<string, JournalEntryEntity>;
    lines: Map<string, JournalLineEntity>;
    sourceEventIndex: Map<string, string>;
    idempotencyIndex: Map<string, string>;
  }): void {
    this.entries.clear();
    this.lines.clear();
    this.sourceEventIndex.clear();
    this.idempotencyIndex.clear();

    snapshot.entries.forEach((entry, id) => this.entries.set(id, this.clone(entry)));
    snapshot.lines.forEach((line, id) => this.lines.set(id, this.clone(line)));
    snapshot.sourceEventIndex.forEach((value, key) => this.sourceEventIndex.set(key, value));
    snapshot.idempotencyIndex.forEach((value, key) => this.idempotencyIndex.set(key, value));
  }

  private sourceKey(tenantId: string, sourceEventId: string, ruleVersion: number): string {
    return `${tenantId}::${sourceEventId}::${ruleVersion}`;
  }

  private idempotencyKey(tenantId: string, idempotencyKey: string): string {
    return `${tenantId}::${idempotencyKey}`;
  }

  private clone<T>(value: T): T {
    return JSON.parse(JSON.stringify(value)) as T;
  }
}

export function createDeterministicLedgerId(parts: string[]): string {
  const hash = createHash('sha256').update(parts.join('::')).digest('hex').slice(0, 32);
  return `${hash.slice(0, 8)}-${hash.slice(8, 12)}-${hash.slice(12, 16)}-${hash.slice(16, 20)}-${hash.slice(20, 32)}`;
}
