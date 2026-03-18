import { Module } from '@nestjs/common';
import { IdempotencyModule } from '../idempotency/idempotency.module';
import { EventBusService } from './event-bus.service';
import { EventsController } from './events.controller';
import { EventsRepository } from './events.repository';
import { EventsService } from './events.service';

@Module({
  imports: [IdempotencyModule],
  controllers: [EventsController],
  providers: [EventBusService, EventsService, EventsRepository],
  exports: [EventsService]
})
export class EventsModule {}
