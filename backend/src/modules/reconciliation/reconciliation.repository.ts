import { BadRequestException, Injectable } from '@nestjs/common';
import { randomUUID } from 'crypto';
import { CreateReconciliationResultInput, ReconciliationResult } from './entities/manual-reconciliation.entity';

export interface ReconciliationItem {
  id: string;
  tenant_id: string;
  source_type: string;
  source_ref: string;
  currency_code: string;
  amount_minor: number;
  occurred_at: string;
  status: 'unmatched' | 'matched';
  updated_at: string;
}

export interface ManualMatchRecord {
  id: string;
  tenant_id: string;
  left_item_id: string;
  right_item_id: string;
  match_type: 'manual';
  reason: string | null;
  created_at: string;
}

@Injectable()
export class ReconciliationRepository {
  private readonly results = new Map<string, ReconciliationResult>();
  private readonly items = new Map<string, ReconciliationItem>();
  private readonly matches = new Map<string, ManualMatchRecord>();

  createSuggestion(input: CreateReconciliationResultInput): ReconciliationResult {
    const timestamp = new Date().toISOString();
    const entity: ReconciliationResult = {
      id: randomUUID(),
      tenant_id: input.tenant_id,
      reconciliation_run_id: input.reconciliation_run_id,
      source_record_id: input.source_record_id,
      classification: input.classification,
      system_suggested_candidate_id: input.system_suggested_candidate_id,
      selected_candidate_id: input.system_suggested_candidate_id,
      status: 'suggested',
      override_reason: null,
      overridden_by: null,
      overridden_at: null,
      candidates: input.candidates.map((candidate) => ({ ...candidate })),
      created_at: timestamp,
      updated_at: timestamp
    };

    this.results.set(entity.id, this.freeze(entity));
    return this.clone(entity);
  }

  findById(tenantId: string, reconciliationResultId: string): ReconciliationResult | undefined {
    const result = this.results.get(reconciliationResultId);
    if (!result || result.tenant_id !== tenantId) {
      return undefined;
    }

    return this.clone(result);
  }

  save(result: ReconciliationResult): ReconciliationResult {
    this.results.set(result.id, this.freeze(result));
    return this.clone(result);
  }

  listByRun(tenantId: string, reconciliationRunId: string): ReconciliationResult[] {
    return [...this.results.values()]
      .filter((result) => result.tenant_id === tenantId && result.reconciliation_run_id === reconciliationRunId)
      .map((result) => this.clone(result));
  }

  upsertItem(input: ReconciliationItem): ReconciliationItem {
    if (input.amount_minor <= 0) {
      throw new BadRequestException('reconciliation item amount_minor must be greater than 0');
    }

    const item = {
      ...input,
      status: input.status ?? 'unmatched'
    };
    this.items.set(item.id, this.freeze(item));
    return this.clone(item);
  }

  findItem(tenantId: string, itemId: string): ReconciliationItem | undefined {
    const item = this.items.get(itemId);
    if (!item || item.tenant_id !== tenantId) {
      return undefined;
    }

    return this.clone(item);
  }

  listItems(tenantId: string): ReconciliationItem[] {
    return [...this.items.values()]
      .filter((item) => item.tenant_id === tenantId)
      .map((item) => this.clone(item));
  }

  saveMatch(match: ManualMatchRecord): ManualMatchRecord {
    this.matches.set(match.id, this.freeze(match));
    return this.clone(match);
  }

  listMatches(tenantId: string): ManualMatchRecord[] {
    return [...this.matches.values()]
      .filter((match) => match.tenant_id === tenantId)
      .map((match) => this.clone(match));
  }

  markItemAsMatched(tenantId: string, itemId: string, updatedAt: string): ReconciliationItem {
    const item = this.findItem(tenantId, itemId);
    if (!item) {
      throw new BadRequestException(`reconciliation item not found: ${itemId}`);
    }

    const updated: ReconciliationItem = {
      ...item,
      status: 'matched',
      updated_at: updatedAt
    };

    this.items.set(updated.id, this.freeze(updated));
    return this.clone(updated);
  }

  createSnapshot(): {
    results: Map<string, ReconciliationResult>;
    items: Map<string, ReconciliationItem>;
    matches: Map<string, ManualMatchRecord>;
  } {
    return {
      results: new Map([...this.results.entries()].map(([id, value]) => [id, this.freeze(value)])),
      items: new Map([...this.items.entries()].map(([id, value]) => [id, this.freeze(value)])),
      matches: new Map([...this.matches.entries()].map(([id, value]) => [id, this.freeze(value)]))
    };
  }

  private clone<T>(value: T): T {
    return JSON.parse(JSON.stringify(value)) as T;
  }

  private freeze<T>(value: T): T {
    if (value && typeof value === 'object' && !Object.isFrozen(value)) {
      Object.freeze(value);
    }

    return value;
  }
}
