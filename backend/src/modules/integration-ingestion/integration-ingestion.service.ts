import { Injectable } from '@nestjs/common';
import { EventsService } from '../events/events.service';
import { DomainEvent } from '../events/entities/event.entity';

export interface ExternalPaymentInput {
  tenant_id: string;
  source_system: string;
  source_payment_id: string;
  received_at?: string;
  amount: number;
  currency: string;
}

export interface ExternalBankTransactionInput {
  tenant_id: string;
  source_system: string;
  source_transaction_id: string;
  synced_at?: string;
  amount: number;
  currency: string;
  direction: 'credit' | 'debit';
}

@Injectable()
export class IntegrationIngestionService {
  constructor(private readonly eventsService: EventsService) {}

  ingestExternalPayment(input: ExternalPaymentInput): DomainEvent<'payment.external.received.v1'> {
    const normalized = this.normalizeExternalPayment(input);

    return this.eventsService.logEvent({
      tenant_id: normalized.tenant_id,
      type: 'payment.external.received.v1',
      aggregate_type: 'external_payment',
      aggregate_id: normalized.external_payment_id,
      aggregate_version: 1,
      event_category: 'integration',
      producer: `integration:${normalized.source_system}`,
      idempotency_key: `payment.external.received.v1:${normalized.external_payment_id}`,
      payload: normalized
    });
  }

  syncBankTransaction(input: ExternalBankTransactionInput): DomainEvent<'bank.transaction.synced.v1'> {
    const normalized = this.normalizeBankTransaction(input);

    return this.eventsService.logEvent({
      tenant_id: normalized.tenant_id,
      type: 'bank.transaction.synced.v1',
      aggregate_type: 'bank_transaction',
      aggregate_id: normalized.bank_transaction_id,
      aggregate_version: 1,
      event_category: 'integration',
      producer: `integration:${normalized.source_system}`,
      idempotency_key: `bank.transaction.synced.v1:${normalized.bank_transaction_id}`,
      payload: normalized
    });
  }

  private normalizeExternalPayment(input: ExternalPaymentInput) {
    return {
      tenant_id: input.tenant_id.trim(),
      source_system: input.source_system.trim().toLowerCase(),
      external_payment_id: input.source_payment_id.trim(),
      received_at: input.received_at ?? new Date().toISOString(),
      amount_minor: Math.round(input.amount * 100),
      currency_code: input.currency.trim().toUpperCase(),
      status: 'received' as const
    };
  }

  private normalizeBankTransaction(input: ExternalBankTransactionInput) {
    return {
      tenant_id: input.tenant_id.trim(),
      source_system: input.source_system.trim().toLowerCase(),
      bank_transaction_id: input.source_transaction_id.trim(),
      synced_at: input.synced_at ?? new Date().toISOString(),
      amount_minor: Math.round(input.amount * 100),
      currency_code: input.currency.trim().toUpperCase(),
      direction: input.direction
    };
  }
}
