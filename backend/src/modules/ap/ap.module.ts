import { Module } from '@nestjs/common';
import { EventsModule } from '../events/events.module';
import { EventQueueModule } from '../events/queue/event-queue.module';
import { LedgerModule } from '../ledger/ledger.module';
import { ApController } from './ap.controller';
import { ApEventsHandler } from './ap.events.handler';
import { ApRepository } from './ap.repository';
import { ApService } from './ap.service';

@Module({
  imports: [EventsModule, EventQueueModule, LedgerModule],
  controllers: [ApController],
  providers: [ApService, ApRepository, ApEventsHandler],
  exports: [ApService, ApRepository]
})
export class ApModule {}
