export type EventCategory = 'audit' | 'financial' | 'integration';
export type ActorType = 'user' | 'system';

export type EventType =
  | 'invoice_created'
  | 'invoice_issued'
  | 'invoice_voided'
  | 'payment_recorded'
  | 'payment_allocated'
  | 'payment_voided'
  | 'subscription_created'
  | 'subscription_cancelled'
  | 'document_generated'
  | 'document_sent';

export interface EventEntity {
  id: string;
  tenant_id: string;
  event_type: EventType;
  event_category: EventCategory;
  entity_type: string;
  entity_id: string;
  actor_type: ActorType;
  actor_id: string | null;
  occurred_at: string;
  payload: Record<string, unknown>;
  correlation_id: string | null;
  idempotency_key: string | null;
  created_at: string;
  updated_at: string;
}
