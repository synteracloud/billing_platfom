import { Injectable } from '@nestjs/common';
import { QueryEventsDto } from './dto/query-events.dto';
import { DomainEvent } from './entities/event.entity';

@Injectable()
export class EventsRepository {
  private readonly events = new Map<string, DomainEvent>();

  create(event: DomainEvent): DomainEvent {
    this.events.set(event.id, event);
    return event;
  }

  listByTenant(tenantId: string, query: QueryEventsDto): DomainEvent[] {
    const fromDate = query.occurred_at_from ? new Date(query.occurred_at_from) : null;
    const toDate = query.occurred_at_to ? new Date(query.occurred_at_to) : null;

    return [...this.events.values()]
      .filter((event) => event.tenant_id === tenantId)
      .filter((event) => !query.type || event.type === query.type)
      .filter((event) => !query.aggregate_type || event.aggregate_type === query.aggregate_type)
      .filter((event) => !query.aggregate_id || event.aggregate_id === query.aggregate_id)
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

  createSnapshot(): { events: Map<string, EventEntity> } {
    return {
      events: new Map([...this.events.entries()].map(([id, event]) => [id, this.clone(event)]))
    };
  }

  restoreSnapshot(snapshot: { events: Map<string, EventEntity> }): void {
    this.events.clear();
    for (const [id, event] of snapshot.events.entries()) {
      this.events.set(id, this.clone(event));
    }
  }

  private clone<T>(value: T): T {
    return JSON.parse(JSON.stringify(value)) as T;
  }
}
