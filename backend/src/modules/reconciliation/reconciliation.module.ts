import { Module } from '@nestjs/common';
import { ReconciliationController } from './reconciliation.controller';
import { ReconciliationRepository } from './reconciliation.repository';
import { ReconciliationService } from './reconciliation.service';

@Module({
  controllers: [ReconciliationController],
  providers: [ReconciliationRepository, ReconciliationService],
  exports: [ReconciliationRepository, ReconciliationService]
})
export class ReconciliationModule {}
