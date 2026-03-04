export type EventType =
  | 'invoice_created'
  | 'invoice_issued'
  | 'invoice_voided'
  | 'payment_recorded'
  | 'payment_allocated'
  | 'payment_voided'
  | 'subscription_created'
  | 'subscription_cancelled'
  | 'user_created'
  | 'user_updated';

export interface EventEntity {
  id: string;
  tenant_id: string;
  event_type: EventType;
  entity_type: string;
  entity_id: string;
  actor_user_id: string | null;
  payload: Record<string, unknown>;
  created_at: string;
}
