import { BadRequestException, Injectable, Optional } from '@nestjs/common';
import {
  CreateReconciliationSuggestionsDto,
  ReconciliationSuggestionCandidateDto,
  ReconciliationSuggestionTransactionDto
} from './dto/reconciliation-suggestions.dto';
import { randomUUID } from 'crypto';
import type { EventsService } from '../events/events.service';
import {
  CreateReconciliationResultInput,
  ManualOverrideInput,
  ReconciliationResult
} from './entities/manual-reconciliation.entity';
import { ManualMatchRecord, ReconciliationItem, ReconciliationRepository } from './reconciliation.repository';


export interface ReconciliationSuggestion {
  unmatched_transaction_id: string;
  suggested_candidate_id: string | null;
  confidence_score: number;
  rationale: string[];
  candidate_rankings: Array<{
    candidate_id: string;
    confidence_score: number;
  }>;
  requires_manual_override: boolean;
  auto_apply: false;
  authoritative: false;
}

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


  suggestMatches(input: CreateReconciliationSuggestionsDto): ReconciliationSuggestion[] {
    return input.unmatched_transactions
      .map((transaction) => this.createSuggestionForTransaction(transaction, input.matching_candidates))
      .sort((a, b) => a.unmatched_transaction_id.localeCompare(b.unmatched_transaction_id));
  }

  private createSuggestionForTransaction(
    transaction: ReconciliationSuggestionTransactionDto,
    candidates: ReconciliationSuggestionCandidateDto[]
  ): ReconciliationSuggestion {
    const scoredCandidates = candidates
      .filter((candidate) => this.isComparable(transaction, candidate))
      .map((candidate) => ({
        candidate_id: candidate.id,
        score: this.computeConfidenceScore(transaction, candidate),
        reasons: this.buildRationale(transaction, candidate)
      }))
      .filter((candidate) => candidate.score > 0)
      .sort((a, b) => {
        if (b.score !== a.score) {
          return b.score - a.score;
        }

        return a.candidate_id.localeCompare(b.candidate_id);
      });

    if (scoredCandidates.length === 0) {
      return {
        unmatched_transaction_id: transaction.id,
        suggested_candidate_id: null,
        confidence_score: 0,
        rationale: ['No candidate passed currency/tenant compatibility checks'],
        candidate_rankings: [],
        requires_manual_override: true,
        auto_apply: false,
        authoritative: false
      };
    }

    const top = scoredCandidates[0];
    const next = scoredCandidates[1];
    const confidenceGap = next ? top.score - next.score : 1;
    const hasReferenceSignal = top.reasons.some((reason) => reason === 'Reference identifier match');
    const minimumScore = hasReferenceSignal ? 0.55 : 0.65;
    const minimumGap = hasReferenceSignal ? 0.08 : 0.14;
    const isConfident = top.score >= minimumScore && confidenceGap >= minimumGap;

    return {
      unmatched_transaction_id: transaction.id,
      suggested_candidate_id: isConfident ? top.candidate_id : null,
      confidence_score: Number(top.score.toFixed(4)),
      rationale: isConfident
        ? top.reasons
        : [...top.reasons, 'Top candidates are too close; requires analyst confirmation'],
      candidate_rankings: scoredCandidates
        .slice(0, 5)
        .map((candidate) => ({
          candidate_id: candidate.candidate_id,
          confidence_score: Number(candidate.score.toFixed(4))
        })),
      requires_manual_override: true,
      auto_apply: false,
      authoritative: false
    };
  }

  private isComparable(
    transaction: ReconciliationSuggestionTransactionDto,
    candidate: ReconciliationSuggestionCandidateDto
  ): boolean {
    return transaction.tenant_id === candidate.tenant_id && transaction.currency_code === candidate.currency_code;
  }

  private computeConfidenceScore(
    transaction: ReconciliationSuggestionTransactionDto,
    candidate: ReconciliationSuggestionCandidateDto
  ): number {
    const amountDistance = Math.abs(transaction.amount_minor - candidate.amount_minor);
    const amountMax = Math.max(transaction.amount_minor, candidate.amount_minor, 1);
    const amountSimilarity = Math.max(0, 1 - amountDistance / amountMax);

    const dateDistance = this.diffInDays(transaction.occurred_at, candidate.occurred_at);
    const dateScore = dateDistance <= 7 ? Math.max(0, 1 - dateDistance / 7) : 0;

    const referenceScore = this.normalizedReferenceMatch(transaction.reference_id, candidate.reference_id) ? 1 : 0;
    const counterpartyScore = this.counterpartySimilarity(transaction.counterparty_name, candidate.counterparty_name);

    const weightedScore = amountSimilarity * 0.45 + dateScore * 0.25 + referenceScore * 0.25 + counterpartyScore * 0.05;
    const ambiguityPenalty = referenceScore === 0 && counterpartyScore < 0.75 ? 0.9 : 1;

    return Math.max(0, Math.min(1, weightedScore * ambiguityPenalty));
  }

  private buildRationale(
    transaction: ReconciliationSuggestionTransactionDto,
    candidate: ReconciliationSuggestionCandidateDto
  ): string[] {
    const reasons: string[] = [];
    if (transaction.amount_minor === candidate.amount_minor) {
      reasons.push('Exact amount match');
    }

    const dateDistance = this.diffInDays(transaction.occurred_at, candidate.occurred_at);
    if (dateDistance <= 2) {
      reasons.push(`Date proximity within ${dateDistance} day(s)`);
    }

    if (this.normalizedReferenceMatch(transaction.reference_id, candidate.reference_id)) {
      reasons.push('Reference identifier match');
    }

    const counterpartyScore = this.counterpartySimilarity(transaction.counterparty_name, candidate.counterparty_name);
    if (counterpartyScore >= 0.75) {
      reasons.push('Counterparty names are similar');
    }

    return reasons.length > 0 ? reasons : ['Weak heuristic alignment'];
  }

  private normalizedReferenceMatch(left?: string | null, right?: string | null): boolean {
    if (!left || !right) {
      return false;
    }

    return left.trim().toLowerCase() === right.trim().toLowerCase();
  }

  private counterpartySimilarity(left?: string | null, right?: string | null): number {
    if (!left || !right) {
      return 0;
    }

    const leftNormalized = left.trim().toLowerCase();
    const rightNormalized = right.trim().toLowerCase();
    if (!leftNormalized || !rightNormalized) {
      return 0;
    }

    if (leftNormalized === rightNormalized) {
      return 1;
    }

    if (leftNormalized.includes(rightNormalized) || rightNormalized.includes(leftNormalized)) {
      return 0.85;
    }

    return 0;
  }

  private diffInDays(left: string, right: string): number {
    const leftTime = Date.parse(left);
    const rightTime = Date.parse(right);

    if (!Number.isFinite(leftTime) || !Number.isFinite(rightTime)) {
      return Number.MAX_SAFE_INTEGER;
    }

    const dayMs = 24 * 60 * 60 * 1000;
    return Math.abs(Math.round((leftTime - rightTime) / dayMs));
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
