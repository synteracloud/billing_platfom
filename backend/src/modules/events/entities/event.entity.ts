import { randomUUID } from 'crypto';

export const CANONICAL_EVENT_TYPES = [
  'billing.invoice.created.v1',
  'billing.invoice.sent.v1',
  'billing.invoice.issued.v1',
  'billing.invoice.paid.v1',
  'billing.invoice.voided.v1',
  'billing.payment.recorded.v1',
  'billing.payment.settled.v1',
  'billing.payment.allocated.v1',
  'billing.payment.refunded.v1',
  'billing.bill.created.v1',
  'billing.bill.approved.v1',
  'billing.bill.paid.v1',
  'payment.external.received.v1',
  'bank.transaction.synced.v1',
  'accounting.journal.posted.v1',
  'accounting.journal.reversed.v1',
  'subledger.receivable.updated.v1',
  'subledger.payable.updated.v1',
  'subledger.aging.snapshotted.v1',
  'integration.record.normalized.v1',
  'recon.run.completed.v1',
  'recon.match.classified.v1'
] as const;

export type CanonicalDomainEventType = (typeof CANONICAL_EVENT_TYPES)[number];
export type AuditEventType = `audit.${string}.v1`;
export type DomainEventType = CanonicalDomainEventType | AuditEventType;
export type EventCategory = 'audit' | 'financial' | 'integration';
export type ActorType = 'user' | 'system';

export type DomainAggregateType =
  | 'invoice'
  | 'invoice_line'
  | 'payment'
  | 'payment_allocation'
  | 'bill'
  | 'external_payment'
  | 'bank_transaction'
  | 'journal_entry'
  | 'receivable_position'
  | 'payable_position'
  | 'normalized_record'
  | 'reconciliation_run'
  | 'reconciliation_result'
  | 'document'
  | 'subscription'
  | 'accounting_period';

export type InvoiceCreatedPayload = {
  invoice_id: string;
  customer_id: string;
  invoice_number: string;
  status: 'draft' | 'issued' | 'paid' | 'void';
  subtotal_minor?: number;
  tax_minor?: number;
  jurisdiction?: string;
  total_minor: number;
  currency_code: string;
};

export type InvoiceIssuedPayload = {
  invoice_id: string;
  customer_id: string;
  issue_date: string;
  due_date: string | null;
  subtotal_minor?: number;
  tax_minor?: number;
  jurisdiction?: string;
  total_minor: number;
  currency_code: string;
};

export type InvoiceSentPayload = {
  invoice_id: string;
  customer_id: string;
  to_email: string;
  sent_at: string;
  total_minor: number;
  currency_code: string;
};

export type InvoicePaidPayload = {
  invoice_id: string;
  paid_at: string;
  amount_paid_minor: number;
  currency_code: string;
  payment_id: string;
};

export type InvoiceVoidedPayload = {
  invoice_id: string;
  voided_at: string;
  reason: string | null;
};

export type PaymentRecordedPayload = {
  payment_id: string;
  customer_id: string;
  amount_minor: number;
  currency_code: string;
  status: 'recorded' | 'pending_settlement' | 'settled' | 'failed' | 'refunded' | 'void';
};

export type PaymentSettledPayload = {
  payment_id: string;
  settled_at: string;
  amount_minor: number;
  currency_code: string;
  allocated_minor?: number;
  allocation_id?: string;
  allocation_ids?: string[];
  allocation_changes?: PaymentAllocationChange[];
  total_allocated_minor?: number;
};

export type PaymentAllocatedPayload = {
  payment_id: string;
  customer_id: string;
  amount_minor: number;
  allocation_count: number;
  total_allocated_minor: number;
  currency_code: string;
  allocation_changes: PaymentAllocationChange[];
};

export type PaymentRefundedPayload = {
  payment_id: string;
  refunded_at: string;
  amount_minor: number;
  currency_code: string;
  allocation_changes: PaymentAllocationChange[];
};

export type PaymentAllocationChange = {
  invoice_id: string;
  allocated_delta_minor: number;
};

export type BillCreatedPayload = {
  bill_id: string;
  vendor_id?: string;
  created_at: string;
  due_date?: string | null;
  subtotal_minor?: number;
  tax_minor?: number;
  jurisdiction?: string;
  total_minor: number;
  currency_code: string;
  expense_classification: 'operating' | 'cost_of_goods_sold' | 'asset';
};

export type BillApprovedPayload = {
  bill_id: string;
  vendor_id: string;
  approved_at: string;
  due_date: string | null;
  total_minor: number;
  currency_code: string;
};

export type BillPaidPayload = {
  bill_id: string;
  paid_at: string;
  amount_paid_minor: number;
  currency_code: string;
};

export type PaymentExternalReceivedPayload = {
  external_payment_id: string;
  source_system: string;
  received_at: string;
  amount_minor: number;
  currency_code: string;
  status: 'received';
};

export type BankTransactionSyncedPayload = {
  bank_transaction_id: string;
  source_system: string;
  synced_at: string;
  amount_minor: number;
  currency_code: string;
  direction: 'credit' | 'debit';
};

export type JournalPostedPayload = {
  journal_entry_id: string;
  source_type: string;
  source_id: string;
  source_event_id: string;
  currency_code: string;
  line_count: number;
  batch_id: string;
};

export type JournalReversedPayload = {
  journal_entry_id: string;
  reversed_by_journal_entry_id: string;
  reason: string | null;
};

export type ReceivableUpdatedPayload = {
  receivable_position_id: string;
  customer_id: string;
  open_amount_minor: number;
  currency_code: string;
};

export type PayableUpdatedPayload = {
  payable_position_id: string;
  vendor_id: string;
  open_amount_minor: number;
  currency_code: string;
};

export type AgingSnapshottedPayload = {
  snapshot_id: string;
  as_of_at: string;
  bucket_0_30_minor: number;
  bucket_31_60_minor: number;
  bucket_61_90_minor: number;
  bucket_91_plus_minor: number;
  currency_code: string;
};

export type IntegrationRecordNormalizedPayload = {
  normalized_record_id: string;
  source_system: string;
  source_record_id: string;
  canonical_entity: string;
  amount_minor: number | null;
  currency_code: string | null;
};

export type ReconRunCompletedPayload = {
  reconciliation_run_id: string;
  started_at: string;
  completed_at: string;
  matched_count: number;
  unmatched_count: number;
};

export type ReconMatchClassifiedPayload = {
  reconciliation_result_id: string;
  reconciliation_run_id: string;
  classification: 'match' | 'partial_match' | 'mismatch';
  confidence_score: number;
};

export type AuditPayload = {
  actor: {
    type: ActorType;
    id: string | null;
  };
  action: string;
  entity: {
    type: DomainAggregateType;
    id: string;
  };
  timestamp: string;
  payload: Record<string, unknown>;
};

export type DomainEventPayloadMap = {
  'billing.invoice.created.v1': InvoiceCreatedPayload;
  'billing.invoice.sent.v1': InvoiceSentPayload;
  'billing.invoice.issued.v1': InvoiceIssuedPayload;
  'billing.invoice.paid.v1': InvoicePaidPayload;
  'billing.invoice.voided.v1': InvoiceVoidedPayload;
  'billing.payment.recorded.v1': PaymentRecordedPayload;
  'billing.payment.settled.v1': PaymentSettledPayload;
  'billing.payment.allocated.v1': PaymentAllocatedPayload;
  'billing.payment.refunded.v1': PaymentRefundedPayload;
  'billing.bill.created.v1': BillCreatedPayload;
  'billing.bill.approved.v1': BillApprovedPayload;
  'billing.bill.paid.v1': BillPaidPayload;
  'payment.external.received.v1': PaymentExternalReceivedPayload;
  'bank.transaction.synced.v1': BankTransactionSyncedPayload;
  'accounting.journal.posted.v1': JournalPostedPayload;
  'accounting.journal.reversed.v1': JournalReversedPayload;
  'subledger.receivable.updated.v1': ReceivableUpdatedPayload;
  'subledger.payable.updated.v1': PayableUpdatedPayload;
  'subledger.aging.snapshotted.v1': AgingSnapshottedPayload;
  'integration.record.normalized.v1': IntegrationRecordNormalizedPayload;
  'recon.run.completed.v1': ReconRunCompletedPayload;
  'recon.match.classified.v1': ReconMatchClassifiedPayload;
};

export type EventPayloadFor<TEventType extends DomainEventType> =
  TEventType extends CanonicalDomainEventType ? DomainEventPayloadMap[TEventType] : AuditPayload;

export interface DomainEvent<TEventType extends DomainEventType = DomainEventType> {
  id: string;
  type: TEventType;
  event_type: TEventType;
  version: number;
  tenant_id: string;
  payload: EventPayloadFor<TEventType>;
  occurred_at: string;
  recorded_at: string;
  created_at: string;
  updated_at: string;
  aggregate_type: DomainAggregateType;
  aggregate_id: string;
  entity_type: DomainAggregateType;
  entity_id: string;
  aggregate_version: number;
  causation_id: string | null;
  correlation_id: string | null;
  idempotency_key: string;
  producer: string;
  event_category: EventCategory;
  actor_type: ActorType;
  actor_id: string | null;
  action: string;
  timestamp: string;
}

export interface CreateDomainEventInput<TEventType extends DomainEventType = DomainEventType> {
  type: TEventType;
  tenant_id: string;
  payload: EventPayloadFor<TEventType>;
  aggregate_type: DomainAggregateType;
  aggregate_id: string;
  aggregate_version: number;
  occurred_at?: string;
  causation_id?: string | null;
  correlation_id?: string | null;
  idempotency_key?: string;
  producer?: string;
  event_category?: EventCategory;
  actor_type?: ActorType;
  actor_id?: string | null;
  action?: string;
}

export function createDomainEvent<TEventType extends DomainEventType>(
  input: CreateDomainEventInput<TEventType>
): DomainEvent<TEventType> {
  const now = new Date().toISOString();
  const version = parseInt(input.type.split('.v').slice(-1)[0] ?? '1', 10);
  const occurredAt = input.occurred_at ?? now;

  return {
    id: randomUUID(),
    type: input.type,
    event_type: input.type,
    version,
    tenant_id: input.tenant_id,
    payload: input.payload,
    occurred_at: occurredAt,
    recorded_at: now,
    created_at: now,
    updated_at: now,
    aggregate_type: input.aggregate_type,
    aggregate_id: input.aggregate_id,
    entity_type: input.aggregate_type,
    entity_id: input.aggregate_id,
    aggregate_version: input.aggregate_version,
    causation_id: input.causation_id ?? null,
    correlation_id: input.correlation_id ?? null,
    idempotency_key: input.idempotency_key ?? `${input.type}:${input.aggregate_id}:${input.aggregate_version}`,
    producer: input.producer ?? 'billing-platform',
    event_category: input.event_category ?? inferEventCategory(input.type),
    actor_type: input.actor_type ?? 'system',
    actor_id: input.actor_id ?? null,
    action: input.action ?? inferAction(input.type),
    timestamp: occurredAt
  };
}

function inferEventCategory(type: DomainEventType): EventCategory {
  if (type.startsWith('integration.')) {
    return 'integration';
  }

  if (type.startsWith('audit.')) {
    return 'audit';
  }

  return 'financial';
}

function inferAction(type: DomainEventType): string {
  const parts = type.split('.');
  return parts.length >= 3 ? parts[2] : type;
}
