import { Module } from '@nestjs/common';
import { EventsModule } from '../events/events.module';
import { PollingRepository } from './polling.repository';
import { PollingService } from './polling.service';
import { IntegrationsSchedulerService } from './scheduler.service';

@Module({
  imports: [EventsModule],
  providers: [PollingRepository, PollingService, IntegrationsSchedulerService],
  exports: [PollingRepository, PollingService, IntegrationsSchedulerService]
})
export class IntegrationsModule {}
