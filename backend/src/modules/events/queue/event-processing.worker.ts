import { Inject, Injectable, Logger, OnApplicationBootstrap, OnModuleDestroy } from '@nestjs/common';
import { DomainEventType } from '../entities/event.entity';
import { EventConsumerIdempotencyService } from '../../idempotency/event-consumer-idempotency.service';
import { EVENT_QUEUE_DRIVER } from './queue.constants';
import { EventProcessingRegistry } from './event-processing.registry';
import { QueueDriver, QueueJob } from './event-queue.types';

@Injectable()
export class EventProcessingWorker implements OnApplicationBootstrap, OnModuleDestroy {
  private readonly logger = new Logger(EventProcessingWorker.name);

  constructor(
    @Inject(EVENT_QUEUE_DRIVER) private readonly queueDriver: QueueDriver,
    private readonly processingRegistry: EventProcessingRegistry,
    private readonly eventConsumerIdempotencyService: EventConsumerIdempotencyService
  ) {}

  async onApplicationBootstrap(): Promise<void> {
    await this.queueDriver.registerProcessor((job) => this.process(job));
  }

  async onModuleDestroy(): Promise<void> {
    await this.queueDriver.close();
  }

  private async process(job: QueueJob): Promise<void> {
    const handlers = this.processingRegistry.getHandlers(job.data.event_name);
    if (handlers.length === 0) {
      this.logger.debug(`No async handlers registered for ${job.data.event_name}; acknowledging event ${job.data.event_id}`);
      return;
    }

    for (const handler of handlers) {
      const consumerName = `${job.data.event_name}:${handler.name}`;
      await this.eventConsumerIdempotencyService.execute(
        {
          id: job.data.event_id,
          type: job.data.event_name as DomainEventType,
          tenant_id: job.data.tenant_id,
          idempotency_key: job.data.idempotency_key
        },
        consumerName,
        async () => {
          await handler.handle(job.data);
          this.logger.log(
            `Processed ${job.data.event_name} event ${job.data.event_id} on attempt ${job.attemptsMade + 1}`
          );
          return true;
        }
      );
    }
  }
}
