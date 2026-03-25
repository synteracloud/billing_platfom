import { Injectable, OnApplicationBootstrap } from '@nestjs/common';
import { PaymentAllocationChange } from '../events/entities/event.entity';
import { EventProcessingRegistry } from '../events/queue/event-processing.registry';
import { QueueEnvelope } from '../events/queue/event-queue.types';
import { InvoicesService } from './invoices.service';

@Injectable()
export class InvoicePaymentEventsHandler implements OnApplicationBootstrap {
  constructor(
    private readonly eventProcessingRegistry: EventProcessingRegistry,
    private readonly invoicesService: InvoicesService
  ) {}

  onApplicationBootstrap(): void {
    this.eventProcessingRegistry.register('billing.payment.allocated.v1', 'invoice-payment-state-projection', async (event) => {
      this.handlePaymentAllocationEvent(event);
    });

    this.eventProcessingRegistry.register('billing.payment.refunded.v1', 'invoice-payment-state-projection', async (event) => {
      this.handlePaymentAllocationEvent(event);
    });
  }

  private handlePaymentAllocationEvent(event: QueueEnvelope): void {
    const payload = event.payload as { allocation_changes?: PaymentAllocationChange[] } | undefined;
    const allocationChanges = Array.isArray(payload?.allocation_changes) ? payload.allocation_changes : [];
    if (allocationChanges.length === 0) {
      return;
    }

    this.invoicesService.reconcilePaymentAllocations(
      event.tenant_id,
      allocationChanges,
      event.correlation_id ?? event.aggregate_id
    );
  }
}
