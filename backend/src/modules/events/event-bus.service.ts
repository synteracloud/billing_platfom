import { Injectable } from '@nestjs/common';
import { EventConsumerIdempotencyService } from '../idempotency/event-consumer-idempotency.service';
import { DomainEvent, DomainEventType } from './entities/event.entity';
import { EventsRepository } from './events.repository';

export type EventHandler<TEventType extends DomainEventType = DomainEventType> = (
  event: DomainEvent<TEventType>
) => Promise<void> | void;

export type EventSubscription = {
  unsubscribe: () => void;
  waitForIdle: () => Promise<void>;
};

type SubscriptionRecord<TEventType extends DomainEventType = DomainEventType> = {
  id: string;
  eventType: TEventType;
  handler: EventHandler<TEventType>;
  queue: DomainEvent<TEventType>[];
  draining: boolean;
  idleResolvers: Array<() => void>;
  retryTimer: NodeJS.Timeout | null;
  waitForIdle: () => Promise<void>;
  resolveIdle: () => void;
};

const RETRY_DELAY_MS = 25;
let subscriptionSequence = 0;

@Injectable()
export class EventBusService {
  private readonly subscriptions = new Map<string, SubscriptionRecord>();

  constructor(
    private readonly eventsRepository: EventsRepository,
    private readonly eventConsumerIdempotencyService: EventConsumerIdempotencyService
  ) {}

  async publish<TEventType extends DomainEventType>(event: DomainEvent<TEventType>): Promise<void> {
    const matchingSubscriptions = [...this.subscriptions.values()].filter((subscription) => subscription.eventType === event.type);

    for (const subscription of matchingSubscriptions) {
      subscription.queue.push(event as DomainEvent);
      this.scheduleDrain(subscription);
    }

    await Promise.all(matchingSubscriptions.map((subscription) => subscription.waitForIdle()));
  }

  subscribe<TEventType extends DomainEventType>(eventType: TEventType, handler: EventHandler<TEventType>): EventSubscription {
    const id = `event-bus:${eventType}:${++subscriptionSequence}`;
    const subscription = this.createSubscriptionRecord(id, eventType, handler);
    this.subscriptions.set(id, subscription as unknown as SubscriptionRecord);

    const backlog = this.eventsRepository
      .listAll()
      .filter((event): event is DomainEvent<TEventType> => event.type === eventType)
      .sort((left, right) => left.recorded_at.localeCompare(right.recorded_at) || left.id.localeCompare(right.id));

    for (const event of backlog) {
      subscription.queue.push(event);
    }

    this.scheduleDrain(subscription);

    return {
      unsubscribe: () => {
        if (subscription.retryTimer) {
          clearTimeout(subscription.retryTimer);
        }

        this.subscriptions.delete(id);
        subscription.queue.length = 0;
        subscription.draining = false;
        subscription.resolveIdle();
      },
      waitForIdle: () => subscription.waitForIdle()
    };
  }

  async waitForIdle(): Promise<void> {
    await Promise.all([...this.subscriptions.values()].map((subscription) => subscription.waitForIdle()));
  }

  private createSubscriptionRecord<TEventType extends DomainEventType>(
    id: string,
    eventType: TEventType,
    handler: EventHandler<TEventType>
  ): SubscriptionRecord<TEventType> {
    const subscription: SubscriptionRecord<TEventType> = {
      id,
      eventType,
      handler,
      queue: [],
      draining: false,
      idleResolvers: [],
      retryTimer: null,
      waitForIdle: () => {
        if (!subscription.draining && subscription.queue.length === 0 && !subscription.retryTimer) {
          return Promise.resolve();
        }

        return new Promise<void>((resolve) => {
          subscription.idleResolvers.push(resolve);
        });
      },
      resolveIdle: () => {
        const resolvers = subscription.idleResolvers.splice(0, subscription.idleResolvers.length);
        for (const resolve of resolvers) {
          resolve();
        }
      }
    };

    return subscription;
  }

  private scheduleDrain<TEventType extends DomainEventType>(subscription: SubscriptionRecord<TEventType>): void {
    if (subscription.draining || subscription.retryTimer) {
      return;
    }

    void this.drain(subscription);
  }

  private async drain<TEventType extends DomainEventType>(subscription: SubscriptionRecord<TEventType>): Promise<void> {
    if (subscription.draining) {
      return;
    }

    subscription.draining = true;

    try {
      while (subscription.queue.length > 0) {
        const currentEvent = subscription.queue[0];

        try {
          await this.eventConsumerIdempotencyService.execute(
            currentEvent.tenant_id,
            subscription.id,
            currentEvent.id,
            async () => {
              await subscription.handler(currentEvent as DomainEvent<TEventType>);
              return true;
            }
          );

          subscription.queue.shift();
        } catch {
          subscription.retryTimer = setTimeout(() => {
            subscription.retryTimer = null;
            void this.drain(subscription);
          }, RETRY_DELAY_MS);
          return;
        }
      }
    } finally {
      subscription.draining = false;
      if (subscription.queue.length === 0 && !subscription.retryTimer) {
        subscription.resolveIdle();
      }
    }
  }
}
