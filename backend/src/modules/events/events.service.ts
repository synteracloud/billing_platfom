import { BadRequestException, Injectable } from '@nestjs/common';
import { QueryEventsDto } from './dto/query-events.dto';
import { EventEntity, EventType } from './entities/event.entity';
import { EventsRepository } from './events.repository';

type CreateEventInput = {
  tenant_id: string;
  event_type: EventType;
  entity_type: string;
  entity_id: string;
  actor_user_id?: string | null;
  payload?: Record<string, unknown>;
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
      entity_type: input.entity_type.trim(),
      entity_id: input.entity_id.trim(),
      actor_user_id: input.actor_user_id ?? null,
      payload: input.payload ?? {}
    });
  }

  private validateCreateInput(input: CreateEventInput): void {
    if (!input.tenant_id || input.tenant_id.trim().length === 0) {
      throw new BadRequestException('tenant_id is required');
    }

    if (!input.event_type || input.event_type.trim().length === 0) {
      throw new BadRequestException('event_type is required');
    }

    if (!input.entity_type || input.entity_type.trim().length === 0) {
      throw new BadRequestException('entity_type is required');
    }

    if (!input.entity_id || input.entity_id.trim().length === 0) {
      throw new BadRequestException('entity_id is required');
    }
  }

  private validateDateRange(query: QueryEventsDto): void {
    if (query.created_at_from && Number.isNaN(new Date(query.created_at_from).valueOf())) {
      throw new BadRequestException('created_at_from must be a valid ISO-8601 date');
    }

    if (query.created_at_to && Number.isNaN(new Date(query.created_at_to).valueOf())) {
      throw new BadRequestException('created_at_to must be a valid ISO-8601 date');
    }

    if (query.created_at_from && query.created_at_to) {
      const fromDate = new Date(query.created_at_from);
      const toDate = new Date(query.created_at_to);
      if (fromDate > toDate) {
        throw new BadRequestException('created_at_from must be earlier than or equal to created_at_to');
      }
    }
  }
}
