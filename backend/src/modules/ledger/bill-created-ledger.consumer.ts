import { Injectable, OnApplicationBootstrap } from '@nestjs/common';
import { EventProcessingRegistry } from '../events/queue/event-processing.registry';
import { QueueEnvelope } from '../events/queue/event-queue.types';
import { LedgerService } from './ledger.service';

@Injectable()
export class BillCreatedLedgerConsumer implements OnApplicationBootstrap {
  constructor(
    private readonly eventProcessingRegistry: EventProcessingRegistry,
    private readonly ledgerService: LedgerService
  ) {}

  onApplicationBootstrap(): void {
    this.eventProcessingRegistry.register('billing.bill.created.v1', 'ledger-posting', async (event) => {
      await this.handle(event);
    });
  }

  private async handle(event: QueueEnvelope): Promise<void> {
    await this.ledgerService.postEvent(event.tenant_id, event.event_id);
  }
}
