import { Injectable, OnApplicationBootstrap } from '@nestjs/common';
import { EventProcessingRegistry } from '../events/queue/event-processing.registry';
import { QueueEnvelope } from '../events/queue/event-queue.types';
import { CustomerBalanceService } from './customer-balance.service';

type InvoiceCreatedPayload = {
  customer_id?: string;
  total_minor?: number;
};

type PaymentReceivedPayload = {
  customer_id?: string;
  amount_minor?: number;
};

@Injectable()
export class CustomerBalanceEventsConsumer implements OnApplicationBootstrap {
  constructor(
    private readonly eventProcessingRegistry: EventProcessingRegistry,
    private readonly customerBalanceService: CustomerBalanceService
  ) {}

  onApplicationBootstrap(): void {
    this.eventProcessingRegistry.register('billing.invoice.created.v1', 'ar-customer-balance', async (event) => {
      this.consumeInvoiceCreated(event);
    });
    this.eventProcessingRegistry.register('invoice.created', 'ar-customer-balance', async (event) => {
      this.consumeInvoiceCreated(event);
    });

    this.eventProcessingRegistry.register('billing.payment.recorded.v1', 'ar-customer-balance', async (event) => {
      this.consumePaymentReceived(event);
    });
    this.eventProcessingRegistry.register('payment.received', 'ar-customer-balance', async (event) => {
      this.consumePaymentReceived(event);
    });
  }

  private consumeInvoiceCreated(event: QueueEnvelope): void {
    const payload = (event.payload ?? {}) as InvoiceCreatedPayload;
    const customerId = payload.customer_id?.trim();
    if (!customerId) {
      return;
    }

    this.customerBalanceService.applyInvoiceCreated(
      event.tenant_id,
      customerId,
      this.resolveEventId(event),
      this.normalizeMinor(payload.total_minor)
    );
  }

  private consumePaymentReceived(event: QueueEnvelope): void {
    const payload = (event.payload ?? {}) as PaymentReceivedPayload;
    const customerId = payload.customer_id?.trim();
    if (!customerId) {
      return;
    }

    this.customerBalanceService.applyPaymentReceived(
      event.tenant_id,
      customerId,
      this.resolveEventId(event),
      this.normalizeMinor(payload.amount_minor)
    );
  }

  private resolveEventId(event: QueueEnvelope): string {
    return event.event_id?.trim() || event.idempotency_key?.trim() || `${event.event_name}:${event.aggregate_id}`;
  }

  private normalizeMinor(value: number | undefined): number {
    if (!Number.isFinite(value)) {
      return 0;
    }

    return Math.trunc(value as number);
  }
}
