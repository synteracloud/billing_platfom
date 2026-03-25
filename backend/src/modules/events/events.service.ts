import { BadRequestException, Injectable, Logger, Optional } from '@nestjs/common';
import { FinancialTransactionManager } from '../../common/transactions/financial-transaction.manager';
import { EventConsumerIdempotencyService } from '../idempotency/event-consumer-idempotency.service';
import { QueryEventsDto } from './dto/query-events.dto';
import {
  ActorType,
  createDomainEvent,
  CreateDomainEventInput,
  DomainAggregateType,
  DomainEvent,
  DomainEventType
} from './entities/event.entity';
import { EventsRepository } from './events.repository';
import { validateDomainEvent } from './domain-event.validator';
import { EventQueuePublisher } from './queue/event-queue.publisher';

interface LogMutationInput {
  tenant_id: string;
  entity_type: DomainAggregateType;
  entity_id: string;
  action: string;
  payload: Record<string, unknown>;
  aggregate_version: number;
  correlation_id?: string | null;
  causation_id?: string | null;
  idempotency_key?: string;
  actor_type?: ActorType;
  actor_id?: string | null;
  occurred_at?: string;
  producer?: string;
}

@Injectable()
export class EventsService {
  private readonly logger = new Logger(EventsService.name);

  constructor(
    private readonly eventsRepository: EventsRepository,
    private readonly eventConsumerIdempotencyService: EventConsumerIdempotencyService,
    private readonly eventQueuePublisher: EventQueuePublisher,
    @Optional() private readonly transactionManager?: FinancialTransactionManager
  ) {}

  listEvents(tenantId: string, query: QueryEventsDto): DomainEvent[] {
    this.validateDateRange(query);
    return this.eventsRepository.listByTenant(tenantId, query);
  }

  getEvent(tenantId: string, eventId: string): DomainEvent | undefined {
    return this.eventsRepository.findById(tenantId, eventId);
  }

  logEvent<TEventType extends DomainEventType>(input: CreateDomainEventInput<TEventType>): DomainEvent<TEventType> {
    this.validateCreateInput(input);

    const event = createDomainEvent({
      ...input,
      tenant_id: input.tenant_id.trim(),
      aggregate_id: input.aggregate_id.trim()
    });

    validateDomainEvent(event);
    const storedEvent = this.eventsRepository.create(event) as DomainEvent<TEventType>;
    const publishAfterCommit = () => this.eventQueuePublisher.publish(storedEvent).catch((error: Error) => {
      this.logger.error(`Failed to enqueue domain event ${storedEvent.id}: ${error.message}`);
    });

    if (this.transactionManager?.hasActiveTransaction()) {
      this.transactionManager.runAfterCommit(() => publishAfterCommit());
    } else {
      void publishAfterCommit();
    }
    return storedEvent;
  }

  logMutation(input: LogMutationInput): DomainEvent<`audit.${string}.v1`> {
    const occurredAt = input.occurred_at ?? new Date().toISOString();
    return this.logEvent({
      tenant_id: input.tenant_id,
      type: `audit.${input.entity_type}.${input.action}.v1`,
      event_category: 'audit',
      aggregate_type: input.entity_type,
      aggregate_id: input.entity_id,
      aggregate_version: input.aggregate_version,
      occurred_at: occurredAt,
      correlation_id: input.correlation_id ?? null,
      causation_id: input.causation_id ?? null,
      idempotency_key: input.idempotency_key ?? `audit:${input.entity_type}:${input.entity_id}:${input.action}:${input.aggregate_version}`,
      actor_type: input.actor_type ?? 'system',
      actor_id: input.actor_id ?? null,
      action: input.action,
      producer: input.producer ?? 'billing-platform',
      payload: {
        actor: {
          type: input.actor_type ?? 'system',
          id: input.actor_id ?? null
        },
        action: input.action,
        entity: {
          type: input.entity_type,
          id: input.entity_id
        },
        timestamp: occurredAt,
        payload: input.payload
      }
    });
  }

  consumeEventOnce<T>(
    tenantId: string,
    consumerName: string,
    eventId: string,
    handler: (event: DomainEvent) => Promise<T> | T
  ): Promise<T | null> {
    const event = this.getEvent(tenantId, eventId);
    if (!event) {
      throw new BadRequestException(`Event not found: ${eventId}`);
    }

    return this.eventConsumerIdempotencyService.execute(event, consumerName, () => handler(event));
  }

  createSnapshot(): ReturnType<EventsRepository['createSnapshot']> {
    return this.eventsRepository.createSnapshot();
  }

  restoreSnapshot(snapshot: ReturnType<EventsRepository['createSnapshot']>): void {
    this.eventsRepository.restoreSnapshot(snapshot);
  }

  private validateCreateInput(input: CreateDomainEventInput): void {
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
