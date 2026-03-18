import { ConflictException, Injectable } from '@nestjs/common';
import { QueryEventsDto } from './dto/query-events.dto';
import { DomainEvent } from './entities/event.entity';

@Injectable()
export class EventsRepository {
  private readonly events = new Map<string, DomainEvent>();
  private readonly eventIdempotencyIndex = new Map<string, string>();

  create(event: DomainEvent): DomainEvent {
    const compositeIdempotency = this.toCompositeIdempotency(event.tenant_id, event.idempotency_key);
    const existingEventId = this.eventIdempotencyIndex.get(compositeIdempotency);
    if (existingEventId) {
      const existing = this.events.get(existingEventId);
      if (existing) {
        return existing;
      }
    }

    this.events.set(event.id, event);
    this.eventIdempotencyIndex.set(compositeIdempotency, event.id);
    return event;
  }


  findById(tenantId: string, eventId: string): DomainEvent | undefined {
    const event = this.events.get(eventId);
    if (!event || event.tenant_id !== tenantId) {
      return undefined;
    }

    return this.clone(event);
  }

  listAll(): DomainEvent[] {
    return [...this.events.values()].map((event) => this.clone(event));
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

  createSnapshot(): { events: Map<string, DomainEvent>; eventIdempotencyIndex: Map<string, string> } {
    return {
      events: new Map([...this.events.entries()].map(([id, event]) => [id, this.clone(event)])),
      eventIdempotencyIndex: new Map(this.eventIdempotencyIndex.entries())
    };
  }

  restoreSnapshot(snapshot: { events: Map<string, DomainEvent>; eventIdempotencyIndex: Map<string, string> }): void {
    this.events.clear();
    this.eventIdempotencyIndex.clear();

    for (const [id, event] of snapshot.events.entries()) {
      this.events.set(id, this.clone(event));
    }

    for (const [key, value] of snapshot.eventIdempotencyIndex.entries()) {
      if (!this.events.has(value)) {
        throw new ConflictException(`Broken event idempotency index for key: ${key}`);
      }

      this.eventIdempotencyIndex.set(key, value);
    }
  }

  private toCompositeIdempotency(tenantId: string, idempotencyKey: string): string {
    return `${tenantId}::${idempotencyKey}`;
  }

  private clone<T>(value: T): T {
    return JSON.parse(JSON.stringify(value)) as T;
  }
}
