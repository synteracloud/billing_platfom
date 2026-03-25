import { Injectable, OnApplicationBootstrap } from '@nestjs/common';
import { EventProcessingRegistry } from '../events/queue/event-processing.registry';
import { QueueEnvelope } from '../events/queue/event-queue.types';
import { LedgerService } from './ledger.service';

@Injectable()
export class LedgerInvoiceCreatedConsumer implements OnApplicationBootstrap {
  constructor(
    private readonly eventProcessingRegistry: EventProcessingRegistry,
    private readonly ledgerService: LedgerService
  ) {}

  onApplicationBootstrap(): void {
    this.eventProcessingRegistry.register('billing.invoice.created.v1', 'ledger-ar-revenue-posting', async (event) => {
      await this.postInvoiceCreatedEvent(event);
    });
  }

  private async postInvoiceCreatedEvent(event: QueueEnvelope): Promise<void> {
    await this.ledgerService.postEvent(
      event.tenant_id,
      event.event_id,
      `ledger:invoice-created:${event.event_id}`,
      '1'
    );
  }
}
