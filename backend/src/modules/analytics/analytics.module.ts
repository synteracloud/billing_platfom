import { Module } from '@nestjs/common';
import { ApModule } from '../ap/ap.module';
import { ArModule } from '../ar/ar.module';
import { LedgerModule } from '../ledger/ledger.module';
import { AnalyticsController } from './analytics.controller';
import { AiController } from './ai.controller';
import { AnalyticsReadOnlyGuard } from './analytics-readonly.guard';
import { AnalyticsService } from './analytics.service';

@Module({
  imports: [LedgerModule, ArModule, ApModule],
  controllers: [AnalyticsController, AiController],
  providers: [AnalyticsService, AnalyticsReadOnlyGuard],
  exports: [AnalyticsService]
})
export class AnalyticsModule {}
