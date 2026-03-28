const test = require('node:test');
const assert = require('node:assert/strict');

const { ShopifyTransport } = require('../.tmp-test-dist/modules/integrations/providers/shopify.transport');
const { ShopifyConnector } = require('../.tmp-test-dist/modules/integrations/providers/shopify.connector');
const { QuickBooksTransport } = require('../.tmp-test-dist/modules/integrations/providers/quickbooks.transport');
const { QuickBooksConnector } = require('../.tmp-test-dist/modules/integrations/providers/quickbooks.connector');

const context = {
  tenantId: 'tenant-real-1',
  connectorId: 'conn-001',
  provider: 'integration-suite'
};

test('Shopify connector ingests realistic order payload and normalizes to invoice records', async () => {
  const transport = new ShopifyTransport({
    async authenticate() {
      return { accessToken: 'shop-token', scope: ['read_orders'], shop: 'billing-shop.myshopify.com' };
    },
    async fetchOrders() {
      return {
        orders: [
          {
            id: 987654321,
            name: '#1001',
            currency: ' usd ',
            created_at: '2026-03-20T12:30:00Z',
            updated_at: '2026-03-20T12:45:00Z',
            total_price: '125.50',
            total_tax: '10.04',
            order_number: 1001,
            customer: {
              id: 741,
              email: 'ar@acme.com',
              first_name: 'Alicia',
              last_name: 'Keys'
            },
            line_items: [
              { id: 1, sku: 'SUB-BASIC', title: 'Subscription Basic', quantity: 1, price: '100.00' },
              { id: 2, sku: 'SETUP', title: 'Onboarding', quantity: 1, price: '25.50' }
            ]
          }
        ],
        nextCursor: 'cursor:shopify:2',
        hasMore: true
      };
    }
  });

  const connector = new ShopifyConnector(transport);
  const result = await connector.pull(context, { cursor: 'cursor:shopify:1', objectTypes: ['orders'] });

  assert.equal(result.normalization.trigger, 'normalization.requested.v1');
  assert.equal(result.normalization.direction, 'inbound');
  assert.equal(result.nextCursor, 'cursor:shopify:2');
  assert.equal(result.hasMore, true);
  assert.equal(result.normalization.records.length, 1);

  const [record] = result.normalization.records;
  assert.equal(record.objectType, 'invoice');
  assert.equal(record.objectId, '987654321');
  assert.equal(record.payload.invoice_number, '#1001');
  assert.equal(record.payload.currency_code, 'USD');
  assert.equal(record.payload.subtotal_minor, 12550);
  assert.equal(record.payload.tax_minor, 1004);
  assert.equal(record.payload.customer_name, 'Alicia Keys');
  assert.equal(record.payload.line_items[1].unit_price_minor, 2550);

  assert.equal(result.normalization.metadata.tenantId, 'tenant-real-1');
  assert.equal(result.normalization.metadata.connectorId, 'conn-001');
  assert.equal(result.normalization.metadata.provider, 'integration-suite');
});

test('QuickBooks connector supports basic import/export and maps canonical payload fields correctly', async () => {
  const transport = new QuickBooksTransport({
    async authenticate() {
      return { accessToken: 'qb-token', refreshToken: 'qb-refresh', realmId: '4620816365478291' };
    },
    async pull() {
      return {
        Invoice: [
          {
            Id: '71',
            DocNumber: 'INV-71',
            TxnDate: '2026-03-19',
            CurrencyRef: { value: 'usd' },
            CustomerRef: { value: '45', name: 'Acme LLC' },
            TotalAmt: 240.75,
            Balance: 140.75
          }
        ],
        Payment: [
          {
            Id: '88',
            TxnDate: '2026-03-20',
            CurrencyRef: { value: 'USD' },
            CustomerRef: { value: '45', name: 'Acme LLC' },
            TotalAmt: 100
          }
        ],
        nextCursor: 'quickbooks:cursor:2',
        hasMore: false
      };
    },
    async push(records) {
      return {
        accepted: records.map((entry) => ({
          objectType: entry.objectType,
          objectId: entry.objectId || 'generated-id',
          occurredAt: '2026-03-21T00:00:00.000Z',
          payload: entry.payload
        }))
      };
    }
  });

  const connector = new QuickBooksConnector(transport);

  const inbound = await connector.pull(context, { objectTypes: ['Invoice', 'Payment'] });
  assert.equal(inbound.normalization.records.length, 2);

  const invoice = inbound.normalization.records.find((record) => record.objectType === 'invoice');
  const payment = inbound.normalization.records.find((record) => record.objectType === 'payment');

  assert.equal(invoice.payload.invoice_number, 'INV-71');
  assert.equal(invoice.payload.currency_code, 'USD');
  assert.equal(invoice.payload.total_minor, 24075);
  assert.equal(invoice.payload.balance_minor, 14075);

  assert.equal(payment.payload.external_payment_id, '88');
  assert.equal(payment.payload.amount_minor, 10000);
  assert.equal(payment.payload.currency_code, 'USD');

  const outbound = await connector.push(context, {
    records: [
      {
        objectType: 'invoice',
        objectId: 'EXP-1001',
        payload: {
          invoice_number: 'EXP-1001',
          customer_external_id: '45',
          total_minor: 8800,
          currency_code: 'USD'
        }
      }
    ]
  });

  assert.equal(outbound.acceptedCount, 1);
  assert.equal(outbound.normalization.direction, 'outbound');
  assert.equal(outbound.normalization.records[0].objectId, 'EXP-1001');
  assert.equal(outbound.normalization.records[0].payload.currency_code, 'USD');
  assert.equal(outbound.normalization.records[0].payload.raw_type, 'export');
});
