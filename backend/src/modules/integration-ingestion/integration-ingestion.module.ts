import { Module } from '@nestjs/common';
import { EventsModule } from '../events/events.module';
import { IntegrationIngestionService } from './integration-ingestion.service';

@Module({
  imports: [EventsModule],
  providers: [IntegrationIngestionService],
  exports: [IntegrationIngestionService]
})
export class IntegrationIngestionModule {}
