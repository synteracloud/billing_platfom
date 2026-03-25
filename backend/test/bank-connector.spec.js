const test = require('node:test');
const assert = require('node:assert/strict');

const { BankConnectorService } = require('../.tmp-test-dist/modules/bank-connector/bank-connector.service');
const { BankTransactionsRepository } = require('../.tmp-test-dist/modules/bank-connector/bank-transactions.repository');

function createBankConnectorService() {
  const bankTransactionsRepository = new BankTransactionsRepository();
  const bankConnectorService = new BankConnectorService(bankTransactionsRepository);

  return { bankConnectorService, bankTransactionsRepository };
}

test('maps inbound transaction into normalized BankTransaction shape', () => {
  const { bankConnectorService } = createBankConnectorService();

  const mapped = bankConnectorService.mapToBankTransaction('tenant-1', {
    external_id: ' tx-001 ',
    account_id: ' checking-01 ',
    posted_at: '2026-03-24T12:20:10-05:00',
    amount: '-12.34',
    currency: ' usd ',
    description: '  Coffee   Shop  ',
    counterparty_name: '  ACME CAFE ',
    reference: '  abc-123 '
  });

  assert.equal(mapped.external_id, 'TX-001');
  assert.equal(mapped.account_id, 'CHECKING-01');
  assert.equal(mapped.posted_date, '2026-03-24');
  assert.equal(mapped.amount_minor, -1234);
  assert.equal(mapped.direction, 'debit');
  assert.equal(mapped.currency, 'USD');
  assert.equal(mapped.description, 'Coffee Shop');
  assert.equal(mapped.counterparty_name, 'ACME CAFE');
  assert.equal(mapped.reference, 'ABC-123');
  assert.deepEqual(mapped.metadata, {});
});

test('ingestion is idempotent when duplicates are present in same batch and retry batch', () => {
  const { bankConnectorService, bankTransactionsRepository } = createBankConnectorService();

  const inbound = {
    transaction_id: 'txn-900',
    account_id: 'ops-checking',
    posted_at: '2026-03-23',
    amount_minor: 5000,
    currency: 'USD',
    description: 'Customer payment'
  };

  const first = bankConnectorService.ingestTransactions('tenant-1', [inbound, { ...inbound }]);
  const second = bankConnectorService.ingestTransactions('tenant-1', [{ ...inbound }]);

  assert.equal(first.ingested.length, 1);
  assert.equal(first.duplicates.length, 1);
  assert.equal(second.ingested.length, 0);
  assert.equal(second.duplicates.length, 1);
  assert.equal(bankTransactionsRepository.listByTenant('tenant-1').length, 1);
});

test('dedupe remains tenant-scoped and keeps consistent records', () => {
  const { bankConnectorService, bankTransactionsRepository } = createBankConnectorService();

  const inbound = {
    external_id: 'tx-shared',
    account_id: 'main',
    posted_at: '2026-03-20',
    amount: 15.25,
    currency: 'usd',
    description: 'transfer'
  };

  bankConnectorService.ingestTransactions('tenant-a', [inbound]);
  bankConnectorService.ingestTransactions('tenant-b', [inbound]);

  const tenantA = bankTransactionsRepository.listByTenant('tenant-a');
  const tenantB = bankTransactionsRepository.listByTenant('tenant-b');

  assert.equal(tenantA.length, 1);
  assert.equal(tenantB.length, 1);
  assert.notEqual(tenantA[0].dedupe_key, tenantB[0].dedupe_key);
  assert.equal(tenantA[0].amount_minor, 1525);
  assert.equal(tenantB[0].amount_minor, 1525);
});
