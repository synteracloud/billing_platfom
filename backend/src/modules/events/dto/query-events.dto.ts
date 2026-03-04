export interface QueryEventsDto {
  event_category?: string;
  event_type?: string;
  entity_type?: string;
  entity_id?: string;
  actor_type?: string;
  occurred_at_from?: string;
  occurred_at_to?: string;
  correlation_id?: string;
}
