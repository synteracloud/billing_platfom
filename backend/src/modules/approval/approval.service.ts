import { BadRequestException, ConflictException, Injectable, Optional } from '@nestjs/common';
import { randomUUID } from 'crypto';
import type { EventsService } from '../events/events.service';
import { ApprovalRepository } from './approval.repository';
import { ApprovalRequestEntity, ApprovalStatus, ApprovalThreshold, SensitiveActionType } from './entities/approval-request.entity';

interface ApprovalContext {
  amount_minor?: number | null;
  approval_request_id?: string | null;
  actor_id: string;
  correlation_id?: string;
  context?: Record<string, unknown>;
}

@Injectable()
export class ApprovalService {
  private readonly alwaysRequiredActions = new Set<SensitiveActionType>([
    'manual_journal_entry',
    'reconciliation_override',
    'period_reopen'
  ]);

  constructor(
    private readonly approvalRepository: ApprovalRepository,
    @Optional() private readonly eventsService?: EventsService
  ) {}

  configureThreshold(tenantId: string, actionType: SensitiveActionType, threshold: ApprovalThreshold): void {
    if (!tenantId.trim()) {
      throw new BadRequestException('tenant_id is required');
    }

    if (!Number.isInteger(threshold.requires_approval_over_minor) || threshold.requires_approval_over_minor < 0) {
      throw new BadRequestException('requires_approval_over_minor must be a non-negative integer');
    }

    this.approvalRepository.setThreshold(tenantId, actionType, threshold);
  }

  requestApproval(tenantId: string, actionType: SensitiveActionType, input: ApprovalContext): ApprovalRequestEntity {
    if (!tenantId.trim()) {
      throw new BadRequestException('tenant_id is required');
    }

    if (!input.actor_id?.trim()) {
      throw new BadRequestException('actor_id is required');
    }

    const now = new Date().toISOString();
    const created: ApprovalRequestEntity = {
      id: randomUUID(),
      tenant_id: tenantId,
      action_type: actionType,
      amount_minor: input.amount_minor ?? null,
      status: 'pending',
      requested_by: input.actor_id,
      approved_by: null,
      rejected_by: null,
      rejected_reason: null,
      consumed_by: null,
      correlation_id: input.correlation_id ?? null,
      context: input.context ?? {},
      created_at: now,
      updated_at: now,
      steps: [
        {
          id: randomUUID(),
          status: 'requested',
          actor_id: input.actor_id,
          actor_type: 'user',
          at: now,
          note: null
        }
      ]
    };

    this.audit(tenantId, created.id, 'requested', input.actor_id, {
      action_type: actionType,
      amount_minor: created.amount_minor,
      context: created.context
    }, input.correlation_id);

    return this.approvalRepository.saveRequest(created);
  }

  approve(tenantId: string, requestId: string, approverId: string, note?: string): ApprovalRequestEntity {
    return this.transition(tenantId, requestId, 'approved', approverId, note ?? null);
  }

  reject(tenantId: string, requestId: string, approverId: string, reason: string): ApprovalRequestEntity {
    if (!reason?.trim()) {
      throw new BadRequestException('rejection reason is required');
    }

    return this.transition(tenantId, requestId, 'rejected', approverId, reason.trim());
  }

  enforceApprovalGate(tenantId: string, actionType: SensitiveActionType, input: ApprovalContext): void {
    if (!input.actor_id?.trim()) {
      throw new BadRequestException('actor_id is required');
    }

    const configuredThreshold = this.approvalRepository.getThreshold(tenantId, actionType)?.requires_approval_over_minor;
    const threshold = this.alwaysRequiredActions.has(actionType)
      ? 0
      : (configuredThreshold ?? Number.MAX_SAFE_INTEGER);
    const amount = input.amount_minor ?? 0;
    const requiresApproval = amount >= threshold;

    if (!requiresApproval) {
      return;
    }

    const requestId = input.approval_request_id?.trim();
    if (!requestId) {
      this.audit(tenantId, 'missing-approval', 'execution_blocked', input.actor_id, {
        action_type: actionType,
        reason: 'approval_request_id is required'
      }, input.correlation_id);
      throw new ConflictException(`${actionType} requires an approved approval_request_id`);
    }

    const request = this.approvalRepository.getRequest(tenantId, requestId);
    if (!request || request.action_type !== actionType) {
      this.audit(tenantId, requestId, 'execution_blocked', input.actor_id, {
        action_type: actionType,
        reason: 'approval request not found or action mismatch'
      }, input.correlation_id);
      throw new ConflictException('approval request not found for action');
    }

    if (request.status !== 'approved') {
      this.audit(tenantId, request.id, 'execution_blocked', input.actor_id, {
        action_type: actionType,
        reason: `approval request status is ${request.status}`
      }, input.correlation_id);
      throw new ConflictException(`approval request must be approved before executing ${actionType}`);
    }

    const consumed = this.appendStep(request, 'consumed', input.actor_id, null, input.correlation_id);
    consumed.status = 'consumed';
    consumed.consumed_by = input.actor_id;
    this.approvalRepository.saveRequest(consumed);
  }

  private transition(tenantId: string, requestId: string, targetStatus: Extract<ApprovalStatus, 'approved' | 'rejected'>, actorId: string, note: string | null): ApprovalRequestEntity {
    if (!actorId?.trim()) {
      throw new BadRequestException('actor_id is required');
    }

    const request = this.approvalRepository.getRequest(tenantId, requestId);
    if (!request) {
      throw new BadRequestException('approval request not found');
    }

    if (request.status !== 'pending') {
      throw new ConflictException(`approval request transition ${request.status} -> ${targetStatus} is not allowed`);
    }

    const updated = this.appendStep(request, targetStatus, actorId, note, request.correlation_id ?? undefined);
    updated.status = targetStatus;
    updated.approved_by = targetStatus === 'approved' ? actorId : null;
    updated.rejected_by = targetStatus === 'rejected' ? actorId : null;
    updated.rejected_reason = targetStatus === 'rejected' ? note : null;
    return this.approvalRepository.saveRequest(updated);
  }

  private appendStep(
    request: ApprovalRequestEntity,
    status: 'approved' | 'rejected' | 'consumed',
    actorId: string,
    note: string | null,
    correlationId?: string
  ): ApprovalRequestEntity {
    const now = new Date().toISOString();
    const updated: ApprovalRequestEntity = {
      ...request,
      updated_at: now,
      steps: [
        ...request.steps,
        {
          id: randomUUID(),
          status,
          actor_id: actorId,
          actor_type: 'user',
          at: now,
          note
        }
      ]
    };

    this.audit(updated.tenant_id, updated.id, status, actorId, {
      action_type: updated.action_type,
      note
    }, correlationId);

    return updated;
  }

  private audit(
    tenantId: string,
    requestId: string,
    action: string,
    actorId: string,
    payload: Record<string, unknown>,
    correlationId?: string
  ): void {
    this.eventsService?.logMutation({
      tenant_id: tenantId,
      entity_type: 'approval_request',
      entity_id: requestId,
      action,
      aggregate_version: 1,
      actor_type: 'user',
      actor_id: actorId,
      correlation_id: correlationId,
      payload
    });
  }
}
