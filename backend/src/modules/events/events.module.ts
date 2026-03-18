import { Module } from '@nestjs/common';
import { IdempotencyModule } from '../idempotency/idempotency.module';
import { EventQueueModule } from './queue/event-queue.module';
import { EventsController } from './events.controller';
import { EventsRepository } from './events.repository';
import { EventsService } from './events.service';

@Module({
  imports: [IdempotencyModule, EventQueueModule],
  controllers: [EventsController],
  providers: [EventsService, EventsRepository],
  exports: [EventsService]
})
export class EventsModule {}
