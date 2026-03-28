import {
  ConnectorAuthInput,
  ConnectorAuthResult,
  ConnectorPullInput,
  ConnectorPushInput,
  ConnectorWebhookInput,
  ConnectorTransportRecord
} from '../interfaces/connector.types';
import { ProviderTransport } from './provider-transport.interface';

export interface QuickBooksInvoice {
  Id: string;
  DocNumber?: string;
  TxnDate?: string;
  CurrencyRef?: { value?: string };
  CustomerRef?: { value?: string; name?: string };
  TotalAmt?: number;
  Balance?: number;
}

export interface QuickBooksPayment {
  Id: string;
  TxnDate?: string;
  CurrencyRef?: { value?: string };
  CustomerRef?: { value?: string; name?: string };
  TotalAmt?: number;
}

export interface QuickBooksPullResponse {
  Invoice?: QuickBooksInvoice[];
  Payment?: QuickBooksPayment[];
  nextCursor?: string;
  hasMore?: boolean;
}

export interface QuickBooksPushResponse {
  accepted: Array<{ objectType: string; objectId: string; occurredAt?: string; payload: Record<string, unknown> }>;
}

export interface QuickBooksApiClient {
  authenticate(credentials: Record<string, unknown>): Promise<{ accessToken: string; refreshToken?: string; realmId?: string }>;
  pull(input: ConnectorPullInput): Promise<QuickBooksPullResponse>;
  push(records: ConnectorPushInput['records']): Promise<QuickBooksPushResponse>;
}

function normalizeCurrency(value: unknown): string {
  if (typeof value !== 'string') {
    return 'USD';
  }

  return value.trim().toUpperCase() || 'USD';
}

function toMinorUnits(value: unknown): number {
  if (typeof value === 'number' && Number.isFinite(value)) {
    return Math.round(value * 100);
  }

  return 0;
}

function mapInvoice(invoice: QuickBooksInvoice): ConnectorTransportRecord {
  const objectId = String(invoice.Id).trim();

  return {
    objectType: 'invoice',
    objectId,
    occurredAt: invoice.TxnDate ? `${invoice.TxnDate}T00:00:00.000Z` : new Date().toISOString(),
    payload: {
      provider: 'quickbooks',
      external_invoice_id: objectId,
      invoice_number: invoice.DocNumber?.trim() ?? null,
      customer_external_id: invoice.CustomerRef?.value?.trim() ?? null,
      customer_name: invoice.CustomerRef?.name?.trim() ?? null,
      currency_code: normalizeCurrency(invoice.CurrencyRef?.value),
      total_minor: toMinorUnits(invoice.TotalAmt),
      balance_minor: toMinorUnits(invoice.Balance),
      issued_date: invoice.TxnDate?.trim() ?? null,
      raw_type: 'Invoice'
    }
  };
}

function mapPayment(payment: QuickBooksPayment): ConnectorTransportRecord {
  const objectId = String(payment.Id).trim();

  return {
    objectType: 'payment',
    objectId,
    occurredAt: payment.TxnDate ? `${payment.TxnDate}T00:00:00.000Z` : new Date().toISOString(),
    payload: {
      provider: 'quickbooks',
      external_payment_id: objectId,
      customer_external_id: payment.CustomerRef?.value?.trim() ?? null,
      customer_name: payment.CustomerRef?.name?.trim() ?? null,
      currency_code: normalizeCurrency(payment.CurrencyRef?.value),
      amount_minor: toMinorUnits(payment.TotalAmt),
      received_date: payment.TxnDate?.trim() ?? null,
      raw_type: 'Payment'
    }
  };
}

export class QuickBooksTransport implements ProviderTransport {
  constructor(private readonly apiClient: QuickBooksApiClient) {}

  async authenticate(input: ConnectorAuthInput): Promise<ConnectorAuthResult> {
    const auth = await this.apiClient.authenticate(input.credentials);

    return {
      accessToken: auth.accessToken,
      refreshToken: auth.refreshToken,
      metadata: {
        provider: 'quickbooks',
        realmId: auth.realmId ?? null
      }
    };
  }

  async pull(input: ConnectorPullInput) {
    const response = await this.apiClient.pull(input);
    const invoices = Array.isArray(response.Invoice) ? response.Invoice : [];
    const payments = Array.isArray(response.Payment) ? response.Payment : [];

    return {
      records: [...invoices.map(mapInvoice), ...payments.map(mapPayment)],
      cursor: response.nextCursor,
      hasMore: response.hasMore,
      metadata: {
        provider: 'quickbooks',
        entities: ['Invoice', 'Payment']
      }
    };
  }

  async push(input: ConnectorPushInput) {
    const response = await this.apiClient.push(input.records);

    return {
      records: response.accepted.map((entry) => ({
        objectType: entry.objectType,
        objectId: entry.objectId,
        occurredAt: entry.occurredAt ?? new Date().toISOString(),
        payload: {
          provider: 'quickbooks',
          ...entry.payload,
          raw_type: 'export'
        }
      })),
      acceptedCount: response.accepted.length,
      metadata: {
        provider: 'quickbooks',
        direction: 'outbound'
      }
    };
  }

  async handleWebhook(input: ConnectorWebhookInput) {
    const body = (input.body ?? {}) as { Invoice?: QuickBooksInvoice[]; Payment?: QuickBooksPayment[] };

    return {
      records: [
        ...(Array.isArray(body.Invoice) ? body.Invoice.map(mapInvoice) : []),
        ...(Array.isArray(body.Payment) ? body.Payment.map(mapPayment) : [])
      ],
      acknowledged: true,
      metadata: {
        provider: 'quickbooks',
        source: 'webhook'
      }
    };
  }
}
