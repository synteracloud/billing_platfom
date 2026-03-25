import { BadRequestException } from '@nestjs/common';
import {
  AuditPayload,
  CANONICAL_EVENT_TYPES,
  CanonicalDomainEventType,
  DomainEvent,
  DomainEventPayloadMap
} from './entities/event.entity';

const EVENT_TYPE_SET = new Set<string>(CANONICAL_EVENT_TYPES);

const payloadValidators: {
  [T in CanonicalDomainEventType]: (payload: DomainEventPayloadMap[T]) => void;
} = {
  'billing.invoice.created.v1': (payload) => {
    requireString(payload.invoice_id, 'payload.invoice_id');
    requireString(payload.customer_id, 'payload.customer_id');
    requireString(payload.invoice_number, 'payload.invoice_number');
    requireNumber(payload.total_minor, 'payload.total_minor');
    requireString(payload.currency_code, 'payload.currency_code');
  },
  'billing.invoice.issued.v1': (payload) => {
    requireString(payload.invoice_id, 'payload.invoice_id');
    requireString(payload.issue_date, 'payload.issue_date');
    requireNumber(payload.total_minor, 'payload.total_minor');
    requireString(payload.currency_code, 'payload.currency_code');
  },
  'billing.invoice.voided.v1': (payload) => {
    requireString(payload.invoice_id, 'payload.invoice_id');
    requireString(payload.voided_at, 'payload.voided_at');
  },
  'billing.payment.recorded.v1': (payload) => {
    requireString(payload.payment_id, 'payload.payment_id');
    requireString(payload.customer_id, 'payload.customer_id');
    requireNumber(payload.amount_minor, 'payload.amount_minor');
    requireString(payload.currency_code, 'payload.currency_code');
  },
  'billing.payment.settled.v1': (payload) => {
    requireString(payload.payment_id, 'payload.payment_id');
    requireString(payload.settled_at, 'payload.settled_at');
    requireNumber(payload.amount_minor, 'payload.amount_minor');
    requireString(payload.currency_code, 'payload.currency_code');
  },
  'billing.payment.allocated.v1': (payload) => {
    requireString(payload.payment_id, 'payload.payment_id');
    requireNumber(payload.allocation_count, 'payload.allocation_count');
    requireNumber(payload.total_allocated_minor, 'payload.total_allocated_minor');
    requireString(payload.currency_code, 'payload.currency_code');
    requireAllocationChanges(payload.allocation_changes, 'payload.allocation_changes');
  },
  'billing.payment.refunded.v1': (payload) => {
    requireString(payload.payment_id, 'payload.payment_id');
    requireString(payload.refunded_at, 'payload.refunded_at');
    requireNumber(payload.amount_minor, 'payload.amount_minor');
    requireString(payload.currency_code, 'payload.currency_code');
    requireAllocationChanges(payload.allocation_changes, 'payload.allocation_changes');
  },
  'accounting.journal.posted.v1': (payload) => {
    requireString(payload.journal_entry_id, 'payload.journal_entry_id');
    requireString(payload.source_type, 'payload.source_type');
    requireString(payload.source_id, 'payload.source_id');
    requireString(payload.source_event_id, 'payload.source_event_id');
    requireString(payload.currency_code, 'payload.currency_code');
    requireNumber(payload.line_count, 'payload.line_count');
    requireString(payload.batch_id, 'payload.batch_id');
  },
  'accounting.journal.reversed.v1': (payload) => {
    requireString(payload.journal_entry_id, 'payload.journal_entry_id');
    requireString(payload.reversed_by_journal_entry_id, 'payload.reversed_by_journal_entry_id');
  },
  'subledger.receivable.updated.v1': (payload) => {
    requireString(payload.receivable_position_id, 'payload.receivable_position_id');
    requireString(payload.customer_id, 'payload.customer_id');
    requireNumber(payload.open_amount_minor, 'payload.open_amount_minor');
    requireString(payload.currency_code, 'payload.currency_code');
  },
  'subledger.payable.updated.v1': (payload) => {
    requireString(payload.payable_position_id, 'payload.payable_position_id');
    requireString(payload.vendor_id, 'payload.vendor_id');
    requireNumber(payload.open_amount_minor, 'payload.open_amount_minor');
    requireString(payload.currency_code, 'payload.currency_code');
  },
  'subledger.aging.snapshotted.v1': (payload) => {
    requireString(payload.snapshot_id, 'payload.snapshot_id');
    requireString(payload.as_of_at, 'payload.as_of_at');
    requireNumber(payload.bucket_0_30_minor, 'payload.bucket_0_30_minor');
    requireNumber(payload.bucket_31_60_minor, 'payload.bucket_31_60_minor');
    requireNumber(payload.bucket_61_90_minor, 'payload.bucket_61_90_minor');
    requireNumber(payload.bucket_91_plus_minor, 'payload.bucket_91_plus_minor');
    requireString(payload.currency_code, 'payload.currency_code');
  },
  'integration.record.normalized.v1': (payload) => {
    requireString(payload.normalized_record_id, 'payload.normalized_record_id');
    requireString(payload.source_system, 'payload.source_system');
    requireString(payload.source_record_id, 'payload.source_record_id');
    requireString(payload.canonical_entity, 'payload.canonical_entity');
  },
  'recon.run.completed.v1': (payload) => {
    requireString(payload.reconciliation_run_id, 'payload.reconciliation_run_id');
    requireString(payload.started_at, 'payload.started_at');
    requireString(payload.completed_at, 'payload.completed_at');
    requireNumber(payload.matched_count, 'payload.matched_count');
    requireNumber(payload.unmatched_count, 'payload.unmatched_count');
  },
  'recon.match.classified.v1': (payload) => {
    requireString(payload.reconciliation_result_id, 'payload.reconciliation_result_id');
    requireString(payload.reconciliation_run_id, 'payload.reconciliation_run_id');
    requireNumber(payload.confidence_score, 'payload.confidence_score');
  }
};

export function validateDomainEvent(event: DomainEvent): void {
  requireString(event.id, 'id');
  requireString(event.type, 'type');
  requireString(event.event_type, 'event_type');
  requireString(event.tenant_id, 'tenant_id');
  requireString(event.occurred_at, 'occurred_at');
  requireString(event.recorded_at, 'recorded_at');
  requireString(event.aggregate_type, 'aggregate_type');
  requireString(event.aggregate_id, 'aggregate_id');
  requireString(event.entity_type, 'entity_type');
  requireString(event.entity_id, 'entity_id');
  requireString(event.event_category, 'event_category');
  requireString(event.actor_type, 'actor_type');
  requireString(event.action, 'action');
  requireString(event.timestamp, 'timestamp');
  requireNumber(event.aggregate_version, 'aggregate_version');
  requireString(event.idempotency_key, 'idempotency_key');
  requireString(event.producer, 'producer');
  requireNumber(event.version, 'version');

  const expectedVersion = parseInt(event.type.split('.v').slice(-1)[0] ?? '1', 10);
  if (event.version !== expectedVersion) {
    throw new BadRequestException('version must match event type suffix');
  }

  if (event.type.startsWith('audit.')) {
    validateAuditPayload(event.payload as AuditPayload);
    return;
  }

  if (!EVENT_TYPE_SET.has(event.type)) {
    throw new BadRequestException(`type is not in canonical event catalog: ${event.type}`);
  }

  payloadValidators[event.type as CanonicalDomainEventType](event.payload as never);
}

function validateAuditPayload(payload: AuditPayload): void {
  if (!payload || typeof payload !== 'object') {
    throw new BadRequestException('payload is required');
  }

  requireString(payload.action, 'payload.action');
  requireString(payload.entity.type, 'payload.entity.type');
  requireString(payload.entity.id, 'payload.entity.id');
  requireString(payload.actor.type, 'payload.actor.type');
  requireString(payload.timestamp, 'payload.timestamp');

  if (!payload.payload || typeof payload.payload !== 'object') {
    throw new BadRequestException('payload.payload is required');
  }
}

function requireString(value: unknown, field: string): void {
  if (typeof value !== 'string' || value.trim().length === 0) {
    throw new BadRequestException(`${field} is required`);
  }
}

function requireNumber(value: unknown, field: string): void {
  if (typeof value !== 'number' || !Number.isFinite(value)) {
    throw new BadRequestException(`${field} must be a finite number`);
  }
}

function requireAllocationChanges(value: unknown, field: string): void {
  if (!Array.isArray(value)) {
    throw new BadRequestException(`${field} must be an array`);
  }

  for (const [index, item] of value.entries()) {
    if (!item || typeof item !== 'object') {
      throw new BadRequestException(`${field}[${index}] must be an object`);
    }

    requireString((item as { invoice_id?: unknown }).invoice_id, `${field}[${index}].invoice_id`);
    requireNumber((item as { allocated_delta_minor?: unknown }).allocated_delta_minor, `${field}[${index}].allocated_delta_minor`);
  }
}
