import { Injectable } from '@nestjs/common';
import { IdempotencyService } from './idempotency.service';

@Injectable()
export class EventConsumerIdempotencyService {
  constructor(private readonly idempotencyService: IdempotencyService) {}

  async execute<T>(tenantId: string, consumerName: string, eventId: string, handler: () => Promise<T> | T): Promise<T | null> {
    const scope = `${tenantId}:event-consumer:${consumerName}`;
    const beginResult = this.idempotencyService.begin(scope, eventId);

    if (beginResult.state === 'completed') {
      return (beginResult.record.response?.body as T | null) ?? null;
    }

    if (beginResult.state === 'in_progress') {
      const completed = await this.idempotencyService.waitForCompletion(scope, eventId);
      return (completed?.response?.body as T | null) ?? null;
    }

    try {
      const result = await handler();
      this.idempotencyService.complete(scope, eventId, { status_code: 200, body: result });
      return result;
    } catch (error) {
      this.idempotencyService.fail(scope, eventId);
      throw error;
    }
  }
}
