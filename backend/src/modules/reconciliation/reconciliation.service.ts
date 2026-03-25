import { BadRequestException, Injectable } from '@nestjs/common';
import { EventsService } from '../events/events.service';
import {
  CreateReconciliationResultInput,
  ManualOverrideInput,
  ReconciliationResult
} from './entities/manual-reconciliation.entity';
import { ReconciliationRepository } from './reconciliation.repository';

@Injectable()
export class ReconciliationService {
  constructor(
    private readonly reconciliationRepository: ReconciliationRepository,
    private readonly eventsService: EventsService
  ) {}

  createSuggestion(input: CreateReconciliationResultInput): ReconciliationResult {
    const created = this.reconciliationRepository.createSuggestion(input);

    this.eventsService.logMutation({
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

    this.eventsService.logMutation({
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
}
