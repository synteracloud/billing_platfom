import { Injectable, Logger } from '@nestjs/common';
import { SubscriptionsService } from './subscriptions.service';

@Injectable()
export class SubscriptionsSchedulerService {
  private readonly logger = new Logger(SubscriptionsSchedulerService.name);

  constructor(private readonly subscriptionsService: SubscriptionsService) {}

  runDailyJob(asOf = new Date()): { processed: number; invoices_generated: number } {
    const summary = this.subscriptionsService.processDueSubscriptions(asOf);

    this.logger.log(
      `Processed due subscriptions: ${summary.processed}, invoices generated: ${summary.invoices_generated}`
    );

    return summary;
  }
}
