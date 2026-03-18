export interface QueryEventsDto {
  type?: string;
  aggregate_type?: string;
  aggregate_id?: string;
  occurred_at_from?: string;
  occurred_at_to?: string;
  correlation_id?: string;
}
