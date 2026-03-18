import { Injectable, Logger, OnApplicationBootstrap } from '@nestjs/common';
import { EventProcessingRegistry } from './event-processing.registry';

@Injectable()
export class DefaultEventHandlersBootstrap implements OnApplicationBootstrap {
  private readonly logger = new Logger(DefaultEventHandlersBootstrap.name);

  constructor(private readonly eventProcessingRegistry: EventProcessingRegistry) {}

  onApplicationBootstrap(): void {
    this.eventProcessingRegistry.register('billing.invoice.issued.v1', async (event) => {
      this.logger.log(`Async invoice-issued projection refreshed for invoice ${event.aggregate_id}`);
    });

    this.eventProcessingRegistry.register('billing.payment.settled.v1', async (event) => {
      this.logger.log(`Async payment-settled hooks completed for payment ${event.aggregate_id}`);
    });
  }
}
