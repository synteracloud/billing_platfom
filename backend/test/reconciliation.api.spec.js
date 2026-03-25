const test = require('node:test');
const assert = require('node:assert/strict');

const { ReconciliationService } = require('../.tmp-test-dist/modules/reconciliation/reconciliation.service');
const { ReconciliationRepository } = require('../.tmp-test-dist/modules/reconciliation/reconciliation.repository');
const { ArRepository } = require('../.tmp-test-dist/modules/ar/ar.repository');
const { ApRepository } = require('../.tmp-test-dist/modules/ap/ap.repository');
const { LedgerRepository } = require('../.tmp-test-dist/modules/ledger/ledger.repository');

function seedItem(repository, overrides = {}) {
  const base = {
    id: `item-${Math.random().toString(16).slice(2)}`,
    tenant_id: 'tenant-recon',
    source_type: 'bank_feed',
    source_ref: 'tx-1',
    currency_code: 'USD',
    amount_minor: 1000,
    occurred_at: '2026-03-20T00:00:00.000Z',
    status: 'unmatched',
    updated_at: '2026-03-20T00:00:00.000Z'
  };

  return repository.upsertItem({ ...base, ...overrides });
}

test('reconciliation APIs return unmatched items, create manual matches, and keep data consistent', () => {
  const repository = new ReconciliationRepository();
  const service = new ReconciliationService(repository);

  const itemA = seedItem(repository, { id: 'left-1', source_ref: 'txn-a', occurred_at: '2026-03-19T00:00:00.000Z' });
  const itemB = seedItem(repository, { id: 'right-1', source_type: 'ledger_entry', source_ref: 'je-10', occurred_at: '2026-03-20T00:00:00.000Z' });
  seedItem(repository, { id: 'other-tenant', tenant_id: 'tenant-other' });

  const beforeUnmatched = service.getUnmatchedItems('tenant-recon');
  assert.equal(beforeUnmatched.length, 2);
  assert.deepEqual(beforeUnmatched.map((item) => item.id), ['left-1', 'right-1']);

  const created = service.createManualMatch('tenant-recon', {
    left_item_id: itemA.id,
    right_item_id: itemB.id,
    reason: 'manual operator override'
  });

  assert.equal(created.match_type, 'manual');
  assert.equal(created.left_item_id, 'left-1');
  assert.equal(created.right_item_id, 'right-1');

  const afterUnmatched = service.getUnmatchedItems('tenant-recon');
  assert.equal(afterUnmatched.length, 0);

  const allMatches = service.getMatches('tenant-recon');
  assert.equal(allMatches.length, 1);
  assert.equal(allMatches[0].id, created.id);

  const matchesByItem = service.getMatches('tenant-recon', 'left-1');
  assert.equal(matchesByItem.length, 1);
  assert.equal(matchesByItem[0].id, created.id);
});

test('reconciliation manual match enforces constraints and handles edge cases', () => {
  const repository = new ReconciliationRepository();
  const service = new ReconciliationService(repository);

  seedItem(repository, { id: 'only-one' });

  assert.throws(
    () => service.createManualMatch('tenant-recon', { left_item_id: 'only-one', right_item_id: 'only-one' }),
    /same reconciliation item/
  );

  assert.throws(
    () => service.createManualMatch('tenant-recon', { left_item_id: 'only-one', right_item_id: 'missing' }),
    /not found/
  );

  seedItem(repository, { id: 'mismatch-currency', currency_code: 'EUR' });
  assert.throws(
    () => service.createManualMatch('tenant-recon', { left_item_id: 'only-one', right_item_id: 'mismatch-currency' }),
    /currency must match/
  );

  seedItem(repository, { id: 'mismatch-amount', amount_minor: 2000 });
  assert.throws(
    () => service.createManualMatch('tenant-recon', { left_item_id: 'only-one', right_item_id: 'mismatch-amount' }),
    /amount must be equal/
  );

  seedItem(repository, { id: 'second-valid' });
  service.createManualMatch('tenant-recon', { left_item_id: 'only-one', right_item_id: 'second-valid' });
  assert.throws(
    () => service.createManualMatch('tenant-recon', { left_item_id: 'only-one', right_item_id: 'mismatch-amount' }),
    /only be created for unmatched/
  );
});

test('reconciliation operations do not mutate financial state repositories', () => {
  const reconciliationRepository = new ReconciliationRepository();
  const service = new ReconciliationService(reconciliationRepository);

  const arRepository = new ArRepository();
  arRepository.upsertInvoice('tenant-recon', {
    invoice_id: 'inv-1',
    customer_id: 'cust-1',
    currency_code: 'USD',
    issue_date: '2026-03-10',
    due_date: '2026-03-20',
    total_minor: 1000,
    open_amount_minor: 1000,
    paid_amount_minor: 0,
    status: 'open',
    updated_at: '2026-03-10T00:00:00.000Z'
  });

  const apRepository = new ApRepository();
  apRepository.upsertBill('tenant-recon', {
    bill_id: 'bill-1',
    vendor_id: 'vendor-1',
    currency_code: 'USD',
    approved_at: '2026-03-10',
    due_date: '2026-03-25',
    total_minor: 2000,
    open_amount_minor: 500,
    paid_amount_minor: 1500,
    status: 'open',
    updated_at: '2026-03-10T00:00:00.000Z'
  });

  const ledgerRepository = new LedgerRepository();
  const entry = ledgerRepository.create(
    {
      id: 'je-1',
      tenant_id: 'tenant-recon',
      source_type: 'test',
      source_id: 'seed-1',
      source_event_id: 'evt-seed-1',
      event_name: 'seed.event.v1',
      rule_version: 'seed-r1',
      entry_date: '2026-03-10',
      currency_code: 'USD',
      description: 'seed',
      created_at: '2026-03-10T00:00:00.000Z'
    },
    [
      {
        id: 'jl-1',
        tenant_id: 'tenant-recon',
        journal_entry_id: 'je-1',
        line_number: 1,
        account_code: '1000',
        account_name: 'Cash',
        direction: 'debit',
        amount_minor: 1000,
        currency_code: 'USD',
        created_at: '2026-03-10T00:00:00.000Z'
      },
      {
        id: 'jl-2',
        tenant_id: 'tenant-recon',
        journal_entry_id: 'je-1',
        line_number: 2,
        account_code: '1100',
        account_name: 'AR',
        direction: 'credit',
        amount_minor: 1000,
        currency_code: 'USD',
        created_at: '2026-03-10T00:00:00.000Z'
      }
    ]
  );

  const financialSnapshot = {
    arOpen: arRepository.findInvoice('tenant-recon', 'inv-1').open_amount_minor,
    apOpen: apRepository.findBill('tenant-recon', 'bill-1').open_amount_minor,
    ledgerEntries: ledgerRepository.listEntries('tenant-recon').length,
    ledgerEntryId: entry.id
  };

  seedItem(reconciliationRepository, { id: 'state-left' });
  seedItem(reconciliationRepository, { id: 'state-right', source_type: 'ledger_entry', source_ref: 'je-state' });

  service.getUnmatchedItems('tenant-recon');
  service.createManualMatch('tenant-recon', { left_item_id: 'state-left', right_item_id: 'state-right' });
  service.getMatches('tenant-recon');

  assert.equal(arRepository.findInvoice('tenant-recon', 'inv-1').open_amount_minor, financialSnapshot.arOpen);
  assert.equal(apRepository.findBill('tenant-recon', 'bill-1').open_amount_minor, financialSnapshot.apOpen);
  assert.equal(ledgerRepository.listEntries('tenant-recon').length, financialSnapshot.ledgerEntries);
  assert.equal(ledgerRepository.listEntries('tenant-recon')[0].id, financialSnapshot.ledgerEntryId);
});
