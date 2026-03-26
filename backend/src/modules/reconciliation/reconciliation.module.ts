import { Module } from '@nestjs/common';
import { ApprovalModule } from '../approval/approval.module';
import { EventsModule } from '../events/events.module';
import { ReconciliationController } from './reconciliation.controller';
import { ReconciliationRepository } from './reconciliation.repository';
import { ReconciliationService } from './reconciliation.service';

@Module({
  imports: [EventsModule, ApprovalModule],
  controllers: [ReconciliationController],
  providers: [ReconciliationRepository, ReconciliationService],
  exports: [ReconciliationRepository, ReconciliationService]
})
export class ReconciliationModule {}
