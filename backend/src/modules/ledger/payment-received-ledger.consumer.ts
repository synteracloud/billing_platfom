import { Injectable, OnApplicationBootstrap } from '@nestjs/common';
import { EventProcessingRegistry } from '../events/queue/event-processing.registry';
import { QueueEnvelope } from '../events/queue/event-queue.types';
import { LedgerService } from './ledger.service';

@Injectable()
export class PaymentReceivedLedgerConsumer implements OnApplicationBootstrap {
  constructor(
    private readonly eventProcessingRegistry: EventProcessingRegistry,
    private readonly ledgerService: LedgerService
  ) {}

  onApplicationBootstrap(): void {
    this.eventProcessingRegistry.register('billing.payment.recorded.v1', 'ledger-cash-receipt-posting', async (event) => {
      await this.postPaymentReceivedEvent(event);
    });
  }

  private async postPaymentReceivedEvent(event: QueueEnvelope): Promise<void> {
    await this.ledgerService.postEvent(
      event.tenant_id,
      event.event_id,
      `ledger:payment-received:${event.event_id}`,
      '1'
    );
  }
}
