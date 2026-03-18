import { Inject, Injectable } from '@nestjs/common';
import { DomainEvent } from '../entities/event.entity';
import { EVENT_QUEUE_DRIVER } from './queue.constants';
import { QueueDriver, QueueEnvelope } from './event-queue.types';

@Injectable()
export class EventQueuePublisher {
  private readonly maxAttempts = parseInt(process.env.EVENT_QUEUE_ATTEMPTS ?? '4', 10);
  private readonly backoffDelayMs = parseInt(process.env.EVENT_QUEUE_BACKOFF_MS ?? '250', 10);

  constructor(@Inject(EVENT_QUEUE_DRIVER) private readonly queueDriver: QueueDriver) {}

  async publish(event: DomainEvent): Promise<void> {
    const envelope: QueueEnvelope = {
      event_id: event.id,
      event_name: event.type,
      event_version: event.version,
      occurred_at: event.occurred_at,
      recorded_at: event.recorded_at,
      tenant_id: event.tenant_id,
      aggregate_type: event.aggregate_type,
      aggregate_id: event.aggregate_id,
      aggregate_version: event.aggregate_version,
      causation_id: event.causation_id,
      correlation_id: event.correlation_id,
      idempotency_key: event.idempotency_key,
      producer: event.producer,
      payload: event.payload
    };

    await this.queueDriver.add(event.type, envelope, {
      jobId: event.id,
      attempts: this.maxAttempts,
      backoffDelayMs: this.backoffDelayMs
    });
  }
}
