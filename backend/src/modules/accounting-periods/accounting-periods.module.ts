import { Module } from '@nestjs/common';
import { EventsModule } from '../events/events.module';
import { AccountingPeriodsController } from './accounting-periods.controller';
import { AccountingPeriodsRepository } from './accounting-periods.repository';
import { AccountingPeriodsService } from './accounting-periods.service';

@Module({
  imports: [EventsModule],
  controllers: [AccountingPeriodsController],
  providers: [AccountingPeriodsRepository, AccountingPeriodsService],
  exports: [AccountingPeriodsService, AccountingPeriodsRepository]
})
export class AccountingPeriodsModule {}
