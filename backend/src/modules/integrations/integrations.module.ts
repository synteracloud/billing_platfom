import { Module } from '@nestjs/common';
import { EventsModule } from '../events/events.module';
import { PollingRepository } from './polling.repository';
import { IntegrationsController } from './integrations.controller';
import { PollingService } from './polling.service';
import { IntegrationsSchedulerService } from './scheduler.service';

@Module({
  imports: [EventsModule],
  controllers: [IntegrationsController],
  providers: [PollingRepository, PollingService, IntegrationsSchedulerService],
  exports: [PollingRepository, PollingService, IntegrationsSchedulerService]
})
export class IntegrationsModule {}
