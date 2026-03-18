import { Logger, Module } from '@nestjs/common';
import { IdempotencyModule } from '../../idempotency/idempotency.module';
import { BullMqQueueDriver } from './bullmq-queue.driver';
import { DefaultEventHandlersBootstrap } from './default-event-handlers.bootstrap';
import { EventProcessingRegistry } from './event-processing.registry';
import { EventProcessingWorker } from './event-processing.worker';
import { EventQueuePublisher } from './event-queue.publisher';
import { InMemoryQueueDriver } from './in-memory-queue.driver';
import { EVENT_QUEUE_DRIVER } from './queue.constants';

@Module({
  imports: [IdempotencyModule],
  providers: [
    BullMqQueueDriver,
    InMemoryQueueDriver,
    {
      provide: EVENT_QUEUE_DRIVER,
      inject: [BullMqQueueDriver, InMemoryQueueDriver],
      useFactory: (bullMqQueueDriver: BullMqQueueDriver, inMemoryQueueDriver: InMemoryQueueDriver) => {
        const logger = new Logger('EventQueueModule');
        const configuredDriver = process.env.EVENT_QUEUE_DRIVER ?? 'bullmq';
        if (configuredDriver === 'in-memory') {
          logger.warn('Using in-memory event queue driver; set EVENT_QUEUE_DRIVER=bullmq with Redis available for production.');
          return inMemoryQueueDriver;
        }

        try {
          return bullMqQueueDriver;
        } catch (error) {
          logger.warn(`BullMQ dependencies unavailable, falling back to in-memory queue driver: ${(error as Error).message}`);
          return inMemoryQueueDriver;
        }
      }
    },
    EventQueuePublisher,
    EventProcessingRegistry,
    EventProcessingWorker,
    DefaultEventHandlersBootstrap
  ],
  exports: [EVENT_QUEUE_DRIVER, EventQueuePublisher, EventProcessingRegistry]
})
export class EventQueueModule {}
