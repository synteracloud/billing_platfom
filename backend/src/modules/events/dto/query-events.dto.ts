export interface QueryEventsDto {
  type?: string;
  event_type?: string;
  event_category?: string;
  aggregate_type?: string;
  aggregate_id?: string;
  entity_type?: string;
  entity_id?: string;
  actor_type?: string;
  occurred_at_from?: string;
  occurred_at_to?: string;
  correlation_id?: string;
}
