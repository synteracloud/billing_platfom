import { Module } from '@nestjs/common';
import { EventsModule } from '../events/events.module';
import { EventQueueModule } from '../events/queue/event-queue.module';
import { ApController } from './ap.controller';
import { ApEventsHandler } from './ap.events.handler';
import { ApRepository } from './ap.repository';
import { ApService } from './ap.service';

@Module({
  imports: [EventsModule, EventQueueModule],
  controllers: [ApController],
  providers: [ApService, ApRepository, ApEventsHandler],
  exports: [ApService]
})
export class ApModule {}
