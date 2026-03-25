import { BadRequestException, Injectable } from '@nestjs/common';
import { IdempotencyService } from '../../../idempotency/idempotency.service';
import { EventsService } from '../../../events/events.service';
import type { Payment, PaymentStatus } from '../../../../../../packages/shared-types/src/types/payment';

type StripeObject = Record<string, unknown>;

interface StripeWebhookEvent {
  id: string;
  type: string;
  created?: number;
  data?: {
    object?: StripeObject;
  };
}

@Injectable()
export class StripeConnector {
  constructor(
    private readonly eventsService: EventsService,
    private readonly idempotencyService: IdempotencyService
  ) {}

  handleWebhook(tenantId: string, payload: unknown): Payment {
    const normalizedTenantId = tenantId?.trim();
    if (!normalizedTenantId) {
      throw new BadRequestException('tenantId is required');
    }

    const event = this.parseWebhook(payload);
    const idempotencyScope = `${normalizedTenantId}:connectors:stripe:webhook`;
    const idempotencyKey = `stripe:${event.id}`;
    const beginResult = this.idempotencyService.begin(idempotencyScope, idempotencyKey);

    if (beginResult.state === 'completed' && beginResult.record.response?.body) {
      return beginResult.record.response.body as Payment;
    }

    if (beginResult.state === 'in_progress') {
      throw new BadRequestException(`Webhook ${event.id} is already being processed`);
    }

    try {
      const payment = this.mapToCanonicalPayment(normalizedTenantId, event);

      this.eventsService.logEvent({
        tenant_id: normalizedTenantId,
        type: 'integration.record.normalized.v1',
        aggregate_type: 'normalized_record',
        aggregate_id: payment.id,
        aggregate_version: 1,
        idempotency_key: `connector:stripe:${event.id}`,
        producer: 'stripe-connector',
        action: 'normalized',
        payload: {
          normalized_record_id: payment.id,
          source_system: 'stripe',
          source_record_id: event.id,
          canonical_entity: 'payment',
          amount_minor: payment.amount_received_minor,
          currency_code: payment.currency
        }
      });

      this.idempotencyService.complete(idempotencyScope, idempotencyKey, {
        status_code: 200,
        body: payment
      });

      return payment;
    } catch (error) {
      this.idempotencyService.fail(idempotencyScope, idempotencyKey);
      throw error;
    }
  }

  private parseWebhook(payload: unknown): StripeWebhookEvent {
    if (!payload || typeof payload !== 'object') {
      throw new BadRequestException('Invalid Stripe webhook payload');
    }

    const event = payload as StripeWebhookEvent;
    if (!event.id || !event.type || !event.data?.object || typeof event.data.object !== 'object') {
      throw new BadRequestException('Stripe webhook payload is missing required fields');
    }

    return event;
  }

  private mapToCanonicalPayment(tenantId: string, event: StripeWebhookEvent): Payment {
    const source = event.data?.object ?? {};
    const metadata = this.readMetadata(source.metadata);
    const amountMinor = this.readNumber(source.amount_received) ?? this.readNumber(source.amount) ?? 0;
    const currency = this.readString(source.currency)?.toUpperCase() ?? 'USD';
    const createdEpoch = this.readNumber(source.created) ?? event.created ?? Math.floor(Date.now() / 1000);
    const createdAtIso = new Date(createdEpoch * 1000).toISOString();

    const sourceRecordId = this.readString(source.id) ?? event.id;
    const paymentMethod = this.readPaymentMethod(source);
    const paymentReference = this.readString(source.receipt_number) ?? this.readString(source.payment_intent) ?? sourceRecordId;
    const customerId = this.readString(metadata.customer_id) ?? this.readString(source.customer) ?? 'external-customer';

    const canonicalPayment: Payment = {
      id: `stripe:${sourceRecordId}`,
      tenant_id: tenantId,
      customer_id: customerId,
      payment_reference: paymentReference,
      payment_method: paymentMethod,
      payment_date: createdAtIso.slice(0, 10),
      currency,
      amount_received_minor: amountMinor,
      status: this.mapStatus(event.type, source),
      unallocated_minor: amountMinor,
      allocated_minor: 0,
      metadata: {
        source_system: 'stripe',
        source_event_id: event.id,
        source_event_type: event.type,
        source_object_type: this.readString(source.object) ?? 'unknown',
        source_object_id: sourceRecordId,
        metadata
      },
      created_at: createdAtIso,
      updated_at: createdAtIso
    };

    return canonicalPayment;
  }

  private mapStatus(eventType: string, source: StripeObject): PaymentStatus {
    const status = this.readString(source.status);

    if (eventType === 'charge.refunded') {
      return 'refunded';
    }

    if (status === 'succeeded') {
      return 'settled';
    }

    if (status === 'failed' || status === 'canceled') {
      return 'failed';
    }

    if (status === 'requires_capture') {
      return 'recorded';
    }

    return 'pending_settlement';
  }

  private readPaymentMethod(source: StripeObject): string {
    const fromMethodDetails = (source.payment_method_details as StripeObject | undefined)?.type;
    const paymentMethodTypes = Array.isArray(source.payment_method_types) ? source.payment_method_types : [];
    const methodType = this.readString(fromMethodDetails) ?? this.readString(paymentMethodTypes[0]);
    return methodType ?? 'stripe';
  }

  private readMetadata(input: unknown): Record<string, string> {
    if (!input || typeof input !== 'object') {
      return {};
    }

    return Object.entries(input).reduce<Record<string, string>>((acc, [key, value]) => {
      if (typeof value === 'string') {
        acc[key] = value;
      }
      return acc;
    }, {});
  }

  private readString(value: unknown): string | undefined {
    return typeof value === 'string' && value.trim().length > 0 ? value.trim() : undefined;
  }

  private readNumber(value: unknown): number | undefined {
    return typeof value === 'number' && Number.isFinite(value) ? value : undefined;
  }
}
