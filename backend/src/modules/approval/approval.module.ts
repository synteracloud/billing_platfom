import { Module } from '@nestjs/common';
import { EventsModule } from '../events/events.module';
import { ApprovalRepository } from './approval.repository';
import { ApprovalService } from './approval.service';

@Module({
  imports: [EventsModule],
  providers: [ApprovalRepository, ApprovalService],
  exports: [ApprovalRepository, ApprovalService]
})
export class ApprovalModule {}
