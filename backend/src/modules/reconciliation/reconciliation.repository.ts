import { Injectable } from '@nestjs/common';
import { randomUUID } from 'crypto';
import { CreateReconciliationResultInput, ReconciliationResult } from './entities/manual-reconciliation.entity';

@Injectable()
export class ReconciliationRepository {
  private readonly results = new Map<string, ReconciliationResult>();

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

  createSnapshot(): { results: Map<string, ReconciliationResult> } {
    return {
      results: new Map([...this.results.entries()].map(([id, value]) => [id, this.freeze(value)]))
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
