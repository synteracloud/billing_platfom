import { Injectable, OnApplicationBootstrap } from '@nestjs/common';
import { EventProcessingRegistry } from '../events/queue/event-processing.registry';
import { BillCreatedPayload, PayableUpdatedPayload } from '../events/entities/event.entity';
import { ApService } from './ap.service';

@Injectable()
export class ApEventsHandler implements OnApplicationBootstrap {
  constructor(
    private readonly eventProcessingRegistry: EventProcessingRegistry,
    private readonly apService: ApService
  ) {}

  onApplicationBootstrap(): void {
    this.eventProcessingRegistry.register('billing.bill.created.v1', 'ap-payable-bill-created-projection', async (event) => {
      this.apService.applyBillCreated(event.tenant_id, event.payload as BillCreatedPayload, event.correlation_id);
    });

    this.eventProcessingRegistry.register('subledger.payable.updated.v1', 'ap-payable-updated-projection', async (event) => {
      this.apService.applyPayableUpdated(event.tenant_id, event.payload as PayableUpdatedPayload, event.correlation_id);
    });
  }
}
