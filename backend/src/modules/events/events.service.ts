import { BadRequestException, Injectable } from '@nestjs/common';
import { QueryEventsDto } from './dto/query-events.dto';
import {
  CreateDomainEventInput,
  DomainEvent,
  DomainEventType,
  createDomainEvent
} from './entities/event.entity';
import { EventsRepository } from './events.repository';
import { validateDomainEvent } from './domain-event.validator';

@Injectable()
export class EventsService {
  constructor(private readonly eventsRepository: EventsRepository) {}

  listEvents(tenantId: string, query: QueryEventsDto): DomainEvent[] {
    this.validateDateRange(query);
    return this.eventsRepository.listByTenant(tenantId, query);
  }

  logEvent<TEventType extends DomainEventType>(input: CreateDomainEventInput<TEventType>): DomainEvent<TEventType> {
    this.validateCreateInput(input);

    const event = createDomainEvent({
      ...input,
      tenant_id: input.tenant_id.trim(),
      aggregate_id: input.aggregate_id.trim()
    });

    validateDomainEvent(event);
    return this.eventsRepository.create(event);
  }

  private validateCreateInput<TEventType extends DomainEventType>(
    input: CreateDomainEventInput<TEventType>
  ): void {
    if (!input.tenant_id || input.tenant_id.trim().length === 0) {
      throw new BadRequestException('tenant_id is required');
    }

    if (!input.aggregate_id || input.aggregate_id.trim().length === 0) {
      throw new BadRequestException('aggregate_id is required');
    }

    if (!input.payload || typeof input.payload !== 'object') {
      throw new BadRequestException('payload is required');
    }

    if (input.aggregate_version < 1) {
      throw new BadRequestException('aggregate_version must be greater than or equal to 1');
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
