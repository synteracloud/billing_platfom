import { Injectable } from '@nestjs/common';
import { randomUUID } from 'crypto';
import { QueryEventsDto } from './dto/query-events.dto';
import { EventEntity } from './entities/event.entity';

@Injectable()
export class EventsRepository {
  private readonly events = new Map<string, EventEntity>();

  create(event: Omit<EventEntity, 'id' | 'created_at'>): EventEntity {
    const created: EventEntity = {
      ...event,
      id: randomUUID(),
      created_at: new Date().toISOString()
    };

    this.events.set(created.id, created);
    return created;
  }

  listByTenant(tenantId: string, query: QueryEventsDto): EventEntity[] {
    const fromDate = query.created_at_from ? new Date(query.created_at_from) : null;
    const toDate = query.created_at_to ? new Date(query.created_at_to) : null;

    return [...this.events.values()]
      .filter((event) => event.tenant_id === tenantId)
      .filter((event) => !query.event_type || event.event_type === query.event_type)
      .filter((event) => !query.entity_type || event.entity_type === query.entity_type)
      .filter((event) => !query.entity_id || event.entity_id === query.entity_id)
      .filter((event) => {
        const created = new Date(event.created_at);
        if (fromDate && created < fromDate) {
          return false;
        }

        if (toDate && created > toDate) {
          return false;
        }

        return true;
      })
      .sort((a, b) => b.created_at.localeCompare(a.created_at));
  }
}
