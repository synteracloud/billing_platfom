import {
  ConnectorAuthInput,
  ConnectorAuthResult,
  ConnectorPullInput,
  ConnectorPushInput,
  ConnectorWebhookInput,
  ConnectorTransportRecord
} from '../interfaces/connector.types';
import { ProviderTransport } from './provider-transport.interface';

export interface ShopifyOrderRecord {
  id: number | string;
  name?: string;
  currency?: string;
  created_at: string;
  updated_at?: string;
  total_price?: string | number;
  total_tax?: string | number;
  order_number?: number | string;
  customer?: {
    id?: number | string;
    email?: string;
    first_name?: string;
    last_name?: string;
  };
  line_items?: Array<{
    id?: number | string;
    sku?: string;
    title?: string;
    quantity?: number;
    price?: string | number;
  }>;
}

export interface ShopifyOrdersResponse {
  orders: ShopifyOrderRecord[];
  nextCursor?: string;
  hasMore?: boolean;
}

export interface ShopifyApiClient {
  authenticate(credentials: Record<string, unknown>): Promise<{ accessToken: string; scope?: string[]; shop?: string }>;
  fetchOrders(input: ConnectorPullInput): Promise<ShopifyOrdersResponse>;
}

function cleanString(value: unknown): string {
  return typeof value === 'string' ? value.trim() : '';
}

function toMoneyMinor(value: unknown): number {
  if (typeof value === 'number' && Number.isFinite(value)) {
    return Math.round(value * 100);
  }

  if (typeof value === 'string') {
    const parsed = Number.parseFloat(value.trim());
    return Number.isFinite(parsed) ? Math.round(parsed * 100) : 0;
  }

  return 0;
}

function normalizeOrder(order: ShopifyOrderRecord): ConnectorTransportRecord {
  const objectId = String(order.id).trim();
  const currency = cleanString(order.currency).toUpperCase() || 'USD';
  const customerFirst = cleanString(order.customer?.first_name);
  const customerLast = cleanString(order.customer?.last_name);

  return {
    objectType: 'invoice',
    objectId,
    occurredAt: cleanString(order.created_at) || new Date().toISOString(),
    payload: {
      provider: 'shopify',
      invoice_number: cleanString(order.name) || `SHOPIFY-${objectId}`,
      external_order_id: objectId,
      external_order_number: order.order_number ?? null,
      customer_external_id: order.customer?.id ? String(order.customer.id).trim() : null,
      customer_email: cleanString(order.customer?.email) || null,
      customer_name: `${customerFirst} ${customerLast}`.trim() || null,
      currency_code: currency,
      subtotal_minor: toMoneyMinor(order.total_price),
      tax_minor: toMoneyMinor(order.total_tax),
      line_items: Array.isArray(order.line_items)
        ? order.line_items.map((line) => ({
            external_line_id: line.id ? String(line.id).trim() : null,
            sku: cleanString(line.sku) || null,
            description: cleanString(line.title) || null,
            quantity: typeof line.quantity === 'number' ? line.quantity : 0,
            unit_price_minor: toMoneyMinor(line.price)
          }))
        : [],
      issued_at: cleanString(order.created_at) || null,
      updated_at: cleanString(order.updated_at) || null,
      raw_type: 'order'
    }
  };
}

export class ShopifyTransport implements ProviderTransport {
  constructor(private readonly apiClient: ShopifyApiClient) {}

  async authenticate(input: ConnectorAuthInput): Promise<ConnectorAuthResult> {
    const auth = await this.apiClient.authenticate(input.credentials);

    return {
      accessToken: auth.accessToken,
      metadata: {
        provider: 'shopify',
        scope: auth.scope ?? input.scope ?? [],
        shop: auth.shop ?? null
      }
    };
  }

  async pull(input: ConnectorPullInput) {
    const response = await this.apiClient.fetchOrders(input);

    return {
      records: response.orders.map((order) => normalizeOrder(order)),
      cursor: response.nextCursor,
      hasMore: response.hasMore,
      metadata: {
        provider: 'shopify',
        sourceObjectType: 'order',
        requestedCursor: input.cursor ?? null
      }
    };
  }

  async push(_input: ConnectorPushInput) {
    return {
      records: [],
      acceptedCount: 0,
      metadata: {
        provider: 'shopify',
        unsupported: 'outbound'
      }
    };
  }

  async handleWebhook(input: ConnectorWebhookInput) {
    const body = (input.body ?? {}) as { orders?: ShopifyOrderRecord[]; order?: ShopifyOrderRecord };
    const orders = Array.isArray(body.orders) ? body.orders : body.order ? [body.order] : [];

    return {
      records: orders.map((order) => normalizeOrder(order)),
      acknowledged: true,
      metadata: {
        provider: 'shopify',
        source: 'webhook'
      }
    };
  }
}
