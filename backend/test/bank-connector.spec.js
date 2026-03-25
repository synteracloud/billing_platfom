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

test('auto-match applies exact amount, date threshold, and reference with safe defaults', () => {
  const { bankConnectorService } = createBankConnectorService();

  const transaction = bankConnectorService.mapToBankTransaction('tenant-1', {
    external_id: 'tx-auto-1',
    account_id: 'ops',
    posted_at: '2026-03-24',
    amount_minor: 12500,
    currency: 'USD',
    reference: 'INV-1001'
  });

  const result = bankConnectorService.autoMatchTransaction('tenant-1', transaction, [
    { id: 'candidate-1', amount_minor: 12500, posted_date: '2026-03-24', reference: 'inv-1001' },
    { id: 'candidate-2', amount_minor: 12500, posted_date: '2026-03-20', reference: 'INV-1001' },
    { id: 'candidate-3', amount_minor: 12600, posted_date: '2026-03-24', reference: 'INV-1001' }
  ]);

  assert.equal(result.status, 'matched');
  assert.equal(result.matched_candidate_id, 'candidate-1');
});

test('auto-match remains unmatched when reference exists but no reference match (prevents aggressive matching)', () => {
  const { bankConnectorService } = createBankConnectorService();

  const transaction = bankConnectorService.mapToBankTransaction('tenant-1', {
    external_id: 'tx-auto-2',
    account_id: 'ops',
    posted_at: '2026-03-24',
    amount_minor: 10000,
    currency: 'USD',
    reference: 'INV-404'
  });

  const result = bankConnectorService.autoMatchTransaction('tenant-1', transaction, [
    { id: 'candidate-1', amount_minor: 10000, posted_date: '2026-03-24', reference: 'INV-001' },
    { id: 'candidate-2', amount_minor: 10000, posted_date: '2026-03-24', reference: null }
  ]);

  assert.equal(result.status, 'unmatched');
  assert.equal(result.matched_candidate_id, null);
});

test('auto-match supports per-tenant configs and threshold tuning', () => {
  const { bankConnectorService } = createBankConnectorService();

  const transaction = bankConnectorService.mapToBankTransaction('tenant-strict', {
    external_id: 'tx-auto-3',
    account_id: 'ops',
    posted_at: '2026-03-24',
    amount_minor: 10000,
    currency: 'USD',
    reference: null
  });

  const tenantRules = {
    'tenant-strict': {
      date_within_threshold: { enabled: true, threshold_days: 0 },
      minimum_rules_to_match: 2
    },
    'tenant-relaxed': {
      date_within_threshold: { enabled: true, threshold_days: 5 },
      minimum_rules_to_match: 1
    }
  };

  const candidates = [{ id: 'candidate-1', amount_minor: 10000, posted_date: '2026-03-22', reference: null }];

  const strictResult = bankConnectorService.autoMatchTransaction('tenant-strict', transaction, candidates, tenantRules);
  const relaxedResult = bankConnectorService.autoMatchTransaction('tenant-relaxed', transaction, candidates, tenantRules);

  assert.equal(strictResult.status, 'unmatched');
  assert.equal(relaxedResult.status, 'matched');
  assert.equal(relaxedResult.matched_candidate_id, 'candidate-1');
});

test('auto-match respects priority when multiple candidates satisfy minimum rules', () => {
  const { bankConnectorService } = createBankConnectorService();

  const transaction = bankConnectorService.mapToBankTransaction('tenant-priority', {
    external_id: 'tx-auto-4',
    account_id: 'ops',
    posted_at: '2026-03-24',
    amount_minor: 10000,
    currency: 'USD',
    reference: 'INV-777'
  });

  const candidates = [
    { id: 'candidate-ref', amount_minor: 10000, posted_date: '2026-03-30', reference: 'INV-777' },
    { id: 'candidate-date', amount_minor: 10000, posted_date: '2026-03-24', reference: 'INV-000' }
  ];

  const referenceFirst = bankConnectorService.autoMatchTransaction('tenant-priority', transaction, candidates, {
    'tenant-priority': {
      reference_match: { enabled: true, require_when_transaction_has_reference: false },
      date_within_threshold: { enabled: true, threshold_days: 0 },
      minimum_rules_to_match: 1,
      priority: ['reference_match', 'date_within_threshold', 'exact_amount_match']
    }
  });

  const dateFirst = bankConnectorService.autoMatchTransaction('tenant-priority', transaction, candidates, {
    'tenant-priority': {
      reference_match: { enabled: true, require_when_transaction_has_reference: false },
      date_within_threshold: { enabled: true, threshold_days: 0 },
      minimum_rules_to_match: 1,
      priority: ['date_within_threshold', 'reference_match', 'exact_amount_match']
    }
  });

  assert.equal(referenceFirst.status, 'matched');
  assert.equal(referenceFirst.matched_candidate_id, 'candidate-ref');
  assert.equal(dateFirst.status, 'matched');
  assert.equal(dateFirst.matched_candidate_id, 'candidate-date');
});
