import { BadRequestException, Injectable } from '@nestjs/common';
import { DomainEvent } from '../events/entities/event.entity';
import { IdempotencyService } from './idempotency.service';

@Injectable()
export class EventConsumerIdempotencyService {
  constructor(private readonly idempotencyService: IdempotencyService) {}

  async execute<T>(event: Pick<DomainEvent, 'tenant_id' | 'id' | 'type' | 'idempotency_key'>, consumerName: string, handler: () => Promise<T> | T): Promise<T | null> {
    const tenantId = event.tenant_id?.trim();
    const consumer = consumerName.trim();
    const idempotencyKey = event.idempotency_key?.trim();

    if (!tenantId) {
      throw new BadRequestException('tenant_id is required for event consumers');
    }

    if (!consumer) {
      throw new BadRequestException('consumerName is required for event consumers');
    }

    if (!idempotencyKey) {
      throw new BadRequestException(`idempotency_key is required for event consumer ${consumer}`);
    }

    const scope = `${tenantId}:event-consumer:${consumer}`;
    const beginResult = this.idempotencyService.begin(scope, idempotencyKey);

    if (beginResult.state === 'completed') {
      return (beginResult.record.response?.body as T | null) ?? null;
    }

    if (beginResult.state === 'in_progress') {
      const completed = await this.idempotencyService.waitForCompletion(scope, idempotencyKey);
      return (completed?.response?.body as T | null) ?? null;
    }

    try {
      const result = await handler();
      this.idempotencyService.complete(scope, idempotencyKey, { status_code: 200, body: result });
      return result;
    } catch (error) {
      this.idempotencyService.fail(scope, idempotencyKey);
      throw error;
    }
  }
}
