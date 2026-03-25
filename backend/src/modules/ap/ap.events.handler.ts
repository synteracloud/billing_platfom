import { Injectable, OnApplicationBootstrap } from '@nestjs/common';
import { EventProcessingRegistry } from '../events/queue/event-processing.registry';
import { QueueEnvelope } from '../events/queue/event-queue.types';
import { ApService, BillApprovedPayload, BillPaidPayload } from './ap.service';

@Injectable()
export class ApEventsHandler implements OnApplicationBootstrap {
  constructor(
    private readonly eventProcessingRegistry: EventProcessingRegistry,
    private readonly apService: ApService
  ) {}

  onApplicationBootstrap(): void {
    this.eventProcessingRegistry.register('billing.bill.approved.v1', 'ap-payable-approved-projection', async (event) => {
      this.apService.applyBillApprovedFromEvent(
        event.tenant_id,
        event.payload as BillApprovedPayload,
        event.correlation_id,
        event.event_id
      );
    });

    this.eventProcessingRegistry.register('billing.bill.paid.v1', 'ap-payable-payment-projection', async (event) => {
      this.apService.applyBillPaidFromEvent(event.tenant_id, event.payload as BillPaidPayload, event.correlation_id, event.event_id);
    });

    this.eventProcessingRegistry.register('billing.bill.created.v1', 'ap-payable-created-projection', async (event) => {
      const payload = event.payload as QueueEnvelope['payload'] & {
        bill_id: string;
        vendor_id?: string;
        created_at: string;
        due_date?: string | null;
        total_minor: number;
        currency_code: string;
      };

      this.apService.applyBillApprovedFromEvent(
        event.tenant_id,
        {
          bill_id: payload.bill_id,
          vendor_id: payload.vendor_id ?? 'unknown-vendor',
          approved_at: payload.created_at,
          due_date: payload.due_date ?? null,
          total_minor: payload.total_minor,
          currency_code: payload.currency_code
        },
        event.correlation_id,
        event.event_id
      );
    });
  }
}
