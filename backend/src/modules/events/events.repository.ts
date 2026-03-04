import { Injectable } from '@nestjs/common';
import { randomUUID } from 'crypto';
import { QueryEventsDto } from './dto/query-events.dto';
import { EventEntity } from './entities/event.entity';

@Injectable()
export class EventsRepository {
  private readonly events = new Map<string, EventEntity>();

  create(event: Omit<EventEntity, 'id' | 'created_at' | 'updated_at'>): EventEntity {
    const now = new Date().toISOString();
    const created: EventEntity = {
      ...event,
      id: randomUUID(),
      created_at: now,
      updated_at: now
    };

    this.events.set(created.id, created);
    return created;
  }

  listByTenant(tenantId: string, query: QueryEventsDto): EventEntity[] {
    const fromDate = query.occurred_at_from ? new Date(query.occurred_at_from) : null;
    const toDate = query.occurred_at_to ? new Date(query.occurred_at_to) : null;

    return [...this.events.values()]
      .filter((event) => event.tenant_id === tenantId)
      .filter((event) => !query.event_category || event.event_category === query.event_category)
      .filter((event) => !query.event_type || event.event_type === query.event_type)
      .filter((event) => !query.entity_type || event.entity_type === query.entity_type)
      .filter((event) => !query.entity_id || event.entity_id === query.entity_id)
      .filter((event) => !query.actor_type || event.actor_type === query.actor_type)
      .filter((event) => !query.correlation_id || event.correlation_id === query.correlation_id)
      .filter((event) => {
        const occurred = new Date(event.occurred_at);
        if (fromDate && occurred < fromDate) {
          return false;
        }

        if (toDate && occurred > toDate) {
          return false;
        }

        return true;
      })
      .sort((a, b) => b.occurred_at.localeCompare(a.occurred_at));
  }
}
