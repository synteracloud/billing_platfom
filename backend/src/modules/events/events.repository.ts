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
        return this.clone(existing);
      }
    }

    this.events.set(event.id, this.deepFreeze(this.clone(event)));
    this.eventIdempotencyIndex.set(compositeIdempotency, event.id);
    return this.clone(this.events.get(event.id)!);
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
    const requestedType = query.type ?? query.event_type;
    const requestedEntityType = query.aggregate_type ?? query.entity_type;
    const requestedEntityId = query.aggregate_id ?? query.entity_id;

    return [...this.events.values()]
      .filter((event) => event.tenant_id === tenantId)
      .filter((event) => !requestedType || event.type === requestedType)
      .filter((event) => !query.event_category || event.event_category === query.event_category)
      .filter((event) => !requestedEntityType || event.entity_type === requestedEntityType)
      .filter((event) => !requestedEntityId || event.entity_id === requestedEntityId)
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
      .sort((a, b) => b.occurred_at.localeCompare(a.occurred_at))
      .map((event) => this.clone(event));
  }

  createSnapshot(): { events: Map<string, DomainEvent>; eventIdempotencyIndex: Map<string, string> } {
    return {
      events: new Map([...this.events.entries()].map(([id, event]) => [id, this.deepFreeze(this.clone(event))])),
      eventIdempotencyIndex: new Map(this.eventIdempotencyIndex.entries())
    };
  }

  restoreSnapshot(snapshot: { events: Map<string, DomainEvent>; eventIdempotencyIndex: Map<string, string> }): void {
    this.events.clear();
    this.eventIdempotencyIndex.clear();

    for (const [id, event] of snapshot.events.entries()) {
      this.events.set(id, this.deepFreeze(this.clone(event)));
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

  private deepFreeze<T>(value: T): T {
    if (value && typeof value === 'object' && !Object.isFrozen(value)) {
      Object.freeze(value);
      for (const nested of Object.values(value as Record<string, unknown>)) {
        this.deepFreeze(nested);
      }
    }

    return value;
  }
}
