import { Injectable, OnApplicationBootstrap } from '@nestjs/common';
import { EventProcessingRegistry } from '../events/queue/event-processing.registry';
import { QueueEnvelope } from '../events/queue/event-queue.types';
import { InvoiceIssuedPayload, InvoiceVoidedPayload, PaymentAllocatedPayload, PaymentRefundedPayload } from '../events/entities/event.entity';
import { ArService } from './ar.service';

@Injectable()
export class ArEventsHandler implements OnApplicationBootstrap {
  constructor(
    private readonly eventProcessingRegistry: EventProcessingRegistry,
    private readonly arService: ArService
  ) {}

  onApplicationBootstrap(): void {
    this.eventProcessingRegistry.register('billing.invoice.issued.v1', 'ar-receivable-issued-projection', async (event) => {
      this.arService.applyInvoiceIssued(event.tenant_id, event.payload as InvoiceIssuedPayload, event.correlation_id);
    });

    this.eventProcessingRegistry.register('billing.payment.allocated.v1', 'ar-receivable-allocation-projection', async (event) => {
      this.arService.applyPaymentAllocated(event.tenant_id, event.payload as PaymentAllocatedPayload, event.correlation_id);
    });

    this.eventProcessingRegistry.register('billing.payment.refunded.v1', 'ar-receivable-refund-projection', async (event) => {
      this.arService.applyPaymentAllocated(event.tenant_id, event.payload as PaymentRefundedPayload, event.correlation_id);
    });

    this.eventProcessingRegistry.register('billing.invoice.voided.v1', 'ar-receivable-void-projection', async (event) => {
      this.arService.applyInvoiceVoided(event.tenant_id, event.payload as InvoiceVoidedPayload, event.correlation_id);
    });
  }
}
