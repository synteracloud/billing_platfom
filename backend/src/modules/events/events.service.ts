import { BadRequestException, Injectable } from '@nestjs/common';
import { QueryEventsDto } from './dto/query-events.dto';
import { ActorType, EventCategory, EventEntity, EventType } from './entities/event.entity';
import { EventsRepository } from './events.repository';

type CreateEventInput = {
  tenant_id: string;
  event_type: EventType;
  event_category: EventCategory;
  entity_type: string;
  entity_id: string;
  actor_type: ActorType;
  actor_id?: string | null;
  payload?: Record<string, unknown>;
  correlation_id?: string | null;
  idempotency_key?: string | null;
};

@Injectable()
export class EventsService {
  constructor(private readonly eventsRepository: EventsRepository) {}

  listEvents(tenantId: string, query: QueryEventsDto): EventEntity[] {
    this.validateDateRange(query);
    return this.eventsRepository.listByTenant(tenantId, query);
  }

  logEvent(input: CreateEventInput): EventEntity {
    this.validateCreateInput(input);

    return this.eventsRepository.create({
      tenant_id: input.tenant_id,
      event_type: input.event_type,
      event_category: input.event_category,
      entity_type: input.entity_type.trim(),
      entity_id: input.entity_id.trim(),
      actor_type: input.actor_type,
      actor_id: input.actor_id ?? null,
      occurred_at: new Date().toISOString(),
      payload: input.payload ?? {},
      correlation_id: input.correlation_id ?? null,
      idempotency_key: input.idempotency_key ?? null
    });
  }

  private validateCreateInput(input: CreateEventInput): void {
    if (!input.tenant_id || input.tenant_id.trim().length === 0) {
      throw new BadRequestException('tenant_id is required');
    }

    if (!input.entity_type || input.entity_type.trim().length === 0) {
      throw new BadRequestException('entity_type is required');
    }

    if (!input.entity_id || input.entity_id.trim().length === 0) {
      throw new BadRequestException('entity_id is required');
    }
  }

  private validateDateRange(query: QueryEventsDto): void {
    if (query.occurred_at_from && Number.isNaN(new Date(query.occurred_at_from).valueOf())) {
      throw new BadRequestException('occurred_at_from must be a valid ISO-8601 date');
    }

    if (query.occurred_at_to && Number.isNaN(new Date(query.occurred_at_to).valueOf())) {
      throw new BadRequestException('occurred_at_to must be a valid ISO-8601 date');
    }
  }
}
