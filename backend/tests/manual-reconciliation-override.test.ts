import assert from 'assert';
import { LedgerRepository } from '../src/modules/ledger/ledger.repository';
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
  const tenantId = 'tenant-manual-recon';
  const eventsService = createEventsService();
  const reconciliationRepository = new ReconciliationRepository();
  const reconciliationService = new ReconciliationService(reconciliationRepository, eventsService);
  const ledgerRepository = new LedgerRepository();

  const ledgerBefore = ledgerRepository.createSnapshot();

  const suggested = reconciliationService.createSuggestion({
    tenant_id: tenantId,
    reconciliation_run_id: 'run-1',
    source_record_id: 'bank_txn_1',
    classification: 'partial_match',
    system_suggested_candidate_id: 'invoice_1',
    candidates: [
      { candidate_id: 'invoice_1', source_ref: 'INV-001', amount_minor: 1000 },
      { candidate_id: 'invoice_2', source_ref: 'INV-002', amount_minor: 1000 }
    ]
  });

  const overridden = reconciliationService.applyManualOverride({
    tenant_id: tenantId,
    reconciliation_result_id: suggested.id,
    selected_candidate_id: 'invoice_2',
    user_id: 'user-ops-1',
    reason: 'Confirmed remittance advice references INV-002',
    correlation_id: 'manual-recon-override-1'
  });

  assert.equal(overridden.selected_candidate_id, 'invoice_2', 'manual match should be stored');
  assert.equal(overridden.status, 'manually_matched', 'manual override should mark status as manually matched');
  assert.equal(overridden.overridden_by, 'user-ops-1', 'manual override should retain actor');
  assert.equal(overridden.system_suggested_candidate_id, 'invoice_1', 'system suggestion should remain immutable');

  const auditEvents = eventsService.listEvents(tenantId, {
    event_category: 'audit',
    aggregate_type: 'reconciliation_result',
    aggregate_id: suggested.id
  });

  assert.equal(auditEvents.length, 2, 'audit trail must include suggestion and manual override');
  assert(auditEvents.some((event) => event.event_type === 'audit.reconciliation_result.suggested.v1'));
  const manualAudit = auditEvents.find((event) => event.event_type === 'audit.reconciliation_result.manual_override_applied.v1');
  assert(manualAudit, 'manual override must emit audit event');
  assert.equal(manualAudit?.actor_type, 'user');

  assert.deepEqual(ledgerRepository.createSnapshot(), ledgerBefore, 'manual reconciliation must not mutate ledger state');

  assert.throws(
    () => {
      reconciliationService.applyManualOverride({
        tenant_id: tenantId,
        reconciliation_result_id: suggested.id,
        selected_candidate_id: 'invoice_404',
        user_id: 'user-ops-2',
        reason: 'invalid candidate'
      });
    },
    /selected_candidate_id must exist in reconciliation candidates/
  );

  const auditEventsAfterInvalid = eventsService.listEvents(tenantId, {
    event_category: 'audit',
    aggregate_type: 'reconciliation_result',
    aggregate_id: suggested.id
  });
  assert.equal(auditEventsAfterInvalid.length, 2, 'invalid overrides must not mutate result or create audit noise');

  assert.throws(
    () => {
      reconciliationService.applyManualOverride({
        tenant_id: tenantId,
        reconciliation_result_id: suggested.id,
        selected_candidate_id: 'invoice_1',
        user_id: 'user-ops-2',
        reason: 'same as suggestion'
      });
    },
    /must override the system suggestion/
  );

  console.log('manual reconciliation override test passed');
}

run();
