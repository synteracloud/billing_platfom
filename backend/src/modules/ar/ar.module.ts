import { Module } from '@nestjs/common';
import { EventsModule } from '../events/events.module';
import { EventQueueModule } from '../events/queue/event-queue.module';
import { ArController } from './ar.controller';
import { ArEventsHandler } from './ar.events.handler';
import { ArRepository } from './ar.repository';
import { ArService } from './ar.service';

@Module({
  imports: [EventsModule, EventQueueModule],
  controllers: [ArController],
  providers: [ArService, ArRepository, ArEventsHandler],
  exports: [ArService]
})
export class ArModule {}
