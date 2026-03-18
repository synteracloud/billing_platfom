export interface QueueEnvelope<TPayload = unknown> {
  event_id: string;
  event_name: string;
  event_version: number;
  occurred_at: string;
  recorded_at: string;
  tenant_id: string;
  aggregate_type: string;
  aggregate_id: string;
  aggregate_version: number;
  causation_id: string | null;
  correlation_id: string | null;
  idempotency_key: string;
  producer: string;
  payload: TPayload;
}

export interface QueueJob<TPayload = unknown> {
  id: string;
  name: string;
  data: QueueEnvelope<TPayload>;
  attemptsMade: number;
}

export interface QueueJobOptions {
  jobId: string;
  attempts: number;
  backoffDelayMs: number;
}

export interface QueueDriver {
  add<TPayload = unknown>(name: string, data: QueueEnvelope<TPayload>, options: QueueJobOptions): Promise<void>;
  registerProcessor(handler: (job: QueueJob) => Promise<void>): Promise<void>;
  close(): Promise<void>;
}
