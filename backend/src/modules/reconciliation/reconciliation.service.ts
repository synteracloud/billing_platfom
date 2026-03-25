import { BadRequestException, Injectable, Optional } from '@nestjs/common';
import { randomUUID } from 'crypto';
import { EventsService } from '../events/events.service';
import {
  CreateReconciliationResultInput,
  ManualOverrideInput,
  ReconciliationResult
} from './entities/manual-reconciliation.entity';
import { ManualMatchRecord, ReconciliationItem, ReconciliationRepository } from './reconciliation.repository';

interface CreateManualMatchInput {
  left_item_id: string;
  right_item_id: string;
  reason?: string | null;
}

@Injectable()
export class ReconciliationService {
  constructor(
    private readonly reconciliationRepository: ReconciliationRepository,
    @Optional() private readonly eventsService?: EventsService
  ) {}

  createSuggestion(input: CreateReconciliationResultInput): ReconciliationResult {
    const created = this.reconciliationRepository.createSuggestion(input);

    this.eventsService?.logMutation({
      tenant_id: input.tenant_id,
      entity_type: 'reconciliation_result',
      entity_id: created.id,
      action: 'suggested',
      aggregate_version: 1,
      correlation_id: created.reconciliation_run_id,
      payload: {
        reconciliation_run_id: created.reconciliation_run_id,
        source_record_id: created.source_record_id,
        system_suggested_candidate_id: created.system_suggested_candidate_id,
        candidate_ids: created.candidates.map((candidate) => candidate.candidate_id)
      }
    });

    return created;
  }

  applyManualOverride(input: ManualOverrideInput): ReconciliationResult {
    const result = this.reconciliationRepository.findById(input.tenant_id, input.reconciliation_result_id);
    if (!result) {
      throw new BadRequestException('reconciliation_result not found');
    }

    const selectedCandidate = result.candidates.find((candidate) => candidate.candidate_id === input.selected_candidate_id);
    if (!selectedCandidate) {
      throw new BadRequestException('selected_candidate_id must exist in reconciliation candidates');
    }

    if (result.system_suggested_candidate_id === input.selected_candidate_id) {
      throw new BadRequestException('selected_candidate_id must override the system suggestion');
    }

    if (input.reason.trim().length === 0) {
      throw new BadRequestException('reason is required');
    }

    const now = new Date().toISOString();
    const updated: ReconciliationResult = {
      ...result,
      selected_candidate_id: input.selected_candidate_id,
      status: 'manually_matched',
      override_reason: input.reason,
      overridden_by: input.user_id,
      overridden_at: now,
      updated_at: now
    };

    this.eventsService?.logMutation({
      tenant_id: input.tenant_id,
      entity_type: 'reconciliation_result',
      entity_id: updated.id,
      action: 'manual_override_applied',
      aggregate_version: 2,
      actor_type: 'user',
      actor_id: input.user_id,
      correlation_id: input.correlation_id ?? updated.reconciliation_run_id,
      payload: {
        reconciliation_run_id: updated.reconciliation_run_id,
        source_record_id: updated.source_record_id,
        system_suggested_candidate_id: updated.system_suggested_candidate_id,
        selected_candidate_id: updated.selected_candidate_id,
        override_reason: updated.override_reason
      }
    });

    return this.reconciliationRepository.save(updated);
  }

  getUnmatchedItems(tenantId: string, sourceType?: string, limit = 100): ReconciliationItem[] {
    return this.reconciliationRepository
      .listItems(tenantId)
      .filter((item) => item.status === 'unmatched')
      .filter((item) => !sourceType || item.source_type === sourceType)
      .sort((a, b) => {
        if (a.occurred_at !== b.occurred_at) {
          return a.occurred_at.localeCompare(b.occurred_at);
        }

        return a.id.localeCompare(b.id);
      })
      .slice(0, Math.max(1, limit));
  }

  getMatches(tenantId: string, itemId?: string): ManualMatchRecord[] {
    const matches = this.reconciliationRepository.listMatches(tenantId).sort((a, b) => {
      if (a.created_at !== b.created_at) {
        return a.created_at.localeCompare(b.created_at);
      }

      return a.id.localeCompare(b.id);
    });

    if (!itemId) {
      return matches;
    }

    return matches.filter((match) => match.left_item_id === itemId || match.right_item_id === itemId);
  }

  createManualMatch(tenantId: string, input: CreateManualMatchInput): ManualMatchRecord {
    if (input.left_item_id === input.right_item_id) {
      throw new BadRequestException('manual match cannot use the same reconciliation item on both sides');
    }

    const left = this.reconciliationRepository.findItem(tenantId, input.left_item_id);
    const right = this.reconciliationRepository.findItem(tenantId, input.right_item_id);
    if (!left || !right) {
      throw new BadRequestException('reconciliation item not found');
    }

    if (left.status !== 'unmatched' || right.status !== 'unmatched') {
      throw new BadRequestException('manual matches can only be created for unmatched items');
    }

    if (left.currency_code !== right.currency_code) {
      throw new BadRequestException('reconciliation item currency must match');
    }

    if (left.amount_minor !== right.amount_minor) {
      throw new BadRequestException('reconciliation item amount must be equal');
    }

    const createdAt = new Date().toISOString();
    this.reconciliationRepository.markItemAsMatched(tenantId, left.id, createdAt);
    this.reconciliationRepository.markItemAsMatched(tenantId, right.id, createdAt);

    const manualMatch: ManualMatchRecord = {
      id: randomUUID(),
      tenant_id: tenantId,
      left_item_id: left.id,
      right_item_id: right.id,
      match_type: 'manual',
      reason: input.reason?.trim() ? input.reason.trim() : null,
      created_at: createdAt
    };

    this.eventsService?.logMutation({
      tenant_id: tenantId,
      entity_type: 'reconciliation_result',
      entity_id: manualMatch.id,
      action: 'manual_match_created',
      aggregate_version: 1,
      payload: {
        left_item_id: manualMatch.left_item_id,
        right_item_id: manualMatch.right_item_id,
        reason: manualMatch.reason
      }
    });

    return this.reconciliationRepository.saveMatch(manualMatch);
  }
}
