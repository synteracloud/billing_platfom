import assert from 'assert';
import { ApprovalRepository } from '../src/modules/approval/approval.repository';
import { ApprovalService } from '../src/modules/approval/approval.service';
import { EventConsumerIdempotencyService } from '../src/modules/idempotency/event-consumer-idempotency.service';
import { IdempotencyRepository } from '../src/modules/idempotency/idempotency.repository';
import { IdempotencyService } from '../src/modules/idempotency/idempotency.service';
import { EventsRepository } from '../src/modules/events/events.repository';
import { EventsService } from '../src/modules/events/events.service';
import { EventQueuePublisher } from '../src/modules/events/queue/event-queue.publisher';
import { InMemoryQueueDriver } from '../src/modules/events/queue/in-memory-queue.driver';
import { ReconciliationRepository } from '../src/modules/reconciliation/reconciliation.repository';
import { ReconciliationService } from '../src/modules/reconciliation/reconciliation.service';

function createEventsService(): EventsService {
  const idempotencyRepository = new IdempotencyRepository();
  const idempotencyService = new IdempotencyService(idempotencyRepository);
  const eventConsumerIdempotencyService = new EventConsumerIdempotencyService(idempotencyService);
  const eventsRepository = new EventsRepository();
  const eventQueuePublisher = new EventQueuePublisher(new InMemoryQueueDriver());
  return new EventsService(eventsRepository, eventConsumerIdempotencyService, eventQueuePublisher);
}

function run() {
  const tenantId = 'tenant-approval';
  const eventsService = createEventsService();
  const approvalRepository = new ApprovalRepository();
  const approvalService = new ApprovalService(approvalRepository, eventsService);

  approvalService.configureThreshold(tenantId, 'manual_journal_entry', { requires_approval_over_minor: 0 });
  approvalService.configureThreshold(tenantId, 'reconciliation_override', { requires_approval_over_minor: 0 });
  approvalService.configureThreshold(tenantId, 'period_reopen', { requires_approval_over_minor: 0 });
  approvalService.configureThreshold(tenantId, 'large_bill_exception', { requires_approval_over_minor: 100_000 });
  approvalService.configureThreshold(tenantId, 'large_payment_exception', { requires_approval_over_minor: 50_000 });

  const reconRepository = new ReconciliationRepository();
  const reconService = new ReconciliationService(reconRepository, eventsService, approvalService);
  const suggested = reconService.createSuggestion({
    tenant_id: tenantId,
    reconciliation_run_id: 'run-approval-1',
    source_record_id: 'bank_tx_1',
    classification: 'partial_match',
    system_suggested_candidate_id: 'inv-1',
    candidates: [
      { candidate_id: 'inv-1', source_ref: 'INV-001', amount_minor: 9900 },
      { candidate_id: 'inv-2', source_ref: 'INV-002', amount_minor: 9900 }
    ]
  });

  const reconApproval = approvalService.requestApproval(tenantId, 'reconciliation_override', {
    actor_id: 'analyst-1',
    amount_minor: 0,
    correlation_id: 'recon-approval-1',
    context: { reconciliation_result_id: suggested.id }
  });
  approvalService.approve(tenantId, reconApproval.id, 'controller-1', 'confirmed by supervisor');

  const overridden = reconService.applyManualOverride({
    tenant_id: tenantId,
    reconciliation_result_id: suggested.id,
    selected_candidate_id: 'inv-2',
    user_id: 'analyst-1',
    reason: 'Remittance references inv-2',
    approval_request_id: reconApproval.id,
    correlation_id: 'recon-approval-1'
  });

  assert.equal(overridden.status, 'manually_matched');
  assert.equal(overridden.overridden_by, 'analyst-1');

  assert.throws(() => {
    reconService.applyManualOverride({
      tenant_id: tenantId,
      reconciliation_result_id: suggested.id,
      selected_candidate_id: 'inv-1',
      user_id: 'analyst-1',
      reason: 'bypass',
      approval_request_id: reconApproval.id,
      correlation_id: 'recon-approval-1'
    });
  }, /must be approved before executing reconciliation_override/);

  const reopenApproval = approvalService.requestApproval(tenantId, 'period_reopen', {
    actor_id: 'analyst-2',
    amount_minor: 0,
    context: { period: '2026-02' }
  });
  approvalService.reject(tenantId, reopenApproval.id, 'controller-2', 'period remains locked');
  assert.throws(() => {
    approvalService.enforceApprovalGate(tenantId, 'period_reopen', {
      actor_id: 'analyst-2',
      amount_minor: 0,
      approval_request_id: reopenApproval.id
    });
  }, /must be approved before executing period_reopen/);

  approvalService.enforceApprovalGate(tenantId, 'large_bill_exception', {
    actor_id: 'system',
    amount_minor: 25_000,
    context: { bill_id: 'bill-small' }
  });
  assert.throws(() => {
    approvalService.enforceApprovalGate(tenantId, 'large_bill_exception', {
      actor_id: 'system',
      amount_minor: 250_000,
      context: { bill_id: 'bill-large' }
    });
  }, /requires an approved approval_request_id/);

  const largePayment = approvalService.requestApproval(tenantId, 'large_payment_exception', {
    actor_id: 'analyst-3',
    amount_minor: 75_000,
    correlation_id: 'pay-1'
  });

  assert.throws(() => {
    approvalService.enforceApprovalGate(tenantId, 'large_payment_exception', {
      actor_id: 'system',
      amount_minor: 75_000,
      approval_request_id: largePayment.id
    });
  }, /must be approved/);

  approvalService.approve(tenantId, largePayment.id, 'controller-3');
  approvalService.enforceApprovalGate(tenantId, 'large_payment_exception', {
    actor_id: 'system',
    amount_minor: 75_000,
    approval_request_id: largePayment.id
  });

  assert.throws(() => {
    approvalService.enforceApprovalGate(tenantId, 'large_payment_exception', {
      actor_id: 'system',
      amount_minor: 75_000,
      approval_request_id: largePayment.id
    });
  }, /must be approved/);

  const frozenRequest = approvalRepository.getRequest(tenantId, largePayment.id);
  assert(frozenRequest && Object.isFrozen(frozenRequest));
  assert(frozenRequest && frozenRequest.steps.every((step) => Object.isFrozen(step)));

  const snapshot = approvalRepository.createSnapshot();
  const sandbox = approvalService.requestApproval(tenantId, 'manual_journal_entry', {
    actor_id: 'analyst-4',
    amount_minor: 0
  });
  assert(approvalRepository.getRequest(tenantId, sandbox.id));
  approvalRepository.restoreSnapshot(snapshot);
  assert.equal(approvalRepository.getRequest(tenantId, sandbox.id), undefined, 'snapshot restore must rewind uncommitted records');

  const auditEvents = eventsService.listEvents(tenantId, {
    event_category: 'audit',
    aggregate_type: 'approval_request'
  });
  assert(auditEvents.some((event) => event.event_type === 'audit.approval_request.approved.v1'));
  assert(auditEvents.some((event) => event.event_type === 'audit.approval_request.rejected.v1'));
  assert(auditEvents.some((event) => event.event_type === 'audit.approval_request.execution_blocked.v1'));
  assert(auditEvents.some((event) => event.actor_id === 'controller-1'), 'approver identity must be recorded');

  console.log('approval workflow qc test passed');
}

run();
