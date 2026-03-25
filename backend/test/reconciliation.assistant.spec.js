const test = require('node:test');
const assert = require('node:assert/strict');

const { ReconciliationService } = require('../.tmp-test-dist/modules/reconciliation/reconciliation.service');
const { ReconciliationRepository } = require('../.tmp-test-dist/modules/reconciliation/reconciliation.repository');

function createService() {
  return new ReconciliationService(new ReconciliationRepository());
}

test('recon assistant suggests high-confidence matches without auto-applying', () => {
  const service = createService();

  const suggestions = service.suggestMatches({
    unmatched_transactions: [
      {
        id: 'txn-1',
        tenant_id: 'tenant-1',
        currency_code: 'USD',
        amount_minor: 12500,
        occurred_at: '2026-03-20',
        reference_id: 'INV-1001',
        counterparty_name: 'Acme Corp'
      }
    ],
    matching_candidates: [
      {
        id: 'inv-1001',
        tenant_id: 'tenant-1',
        currency_code: 'USD',
        amount_minor: 12500,
        occurred_at: '2026-03-20',
        reference_id: 'inv-1001',
        counterparty_name: 'ACME CORP'
      },
      {
        id: 'inv-noise',
        tenant_id: 'tenant-1',
        currency_code: 'USD',
        amount_minor: 12000,
        occurred_at: '2026-03-28',
        reference_id: 'INV-9999',
        counterparty_name: 'Different LLC'
      }
    ]
  });

  assert.equal(suggestions.length, 1);
  assert.equal(suggestions[0].suggested_candidate_id, 'inv-1001');
  assert.equal(suggestions[0].auto_apply, false);
  assert.equal(suggestions[0].requires_manual_override, true);
  assert(suggestions[0].confidence_score >= 0.9);
  assert.deepEqual(
    suggestions[0].candidate_rankings.map((item) => item.candidate_id),
    ['inv-1001', 'inv-noise']
  );
});

test('recon assistant reduces false positives for complex ambiguous matches', () => {
  const service = createService();

  const suggestions = service.suggestMatches({
    unmatched_transactions: [
      {
        id: 'txn-ambiguous',
        tenant_id: 'tenant-1',
        currency_code: 'USD',
        amount_minor: 10000,
        occurred_at: '2026-03-25',
        reference_id: null,
        counterparty_name: 'Global Stores'
      }
    ],
    matching_candidates: [
      {
        id: 'cand-1',
        tenant_id: 'tenant-1',
        currency_code: 'USD',
        amount_minor: 10000,
        occurred_at: '2026-03-24',
        reference_id: null,
        counterparty_name: 'Global Stores East'
      },
      {
        id: 'cand-2',
        tenant_id: 'tenant-1',
        currency_code: 'USD',
        amount_minor: 10000,
        occurred_at: '2026-03-24',
        reference_id: null,
        counterparty_name: 'Global Stores West'
      }
    ]
  });

  assert.equal(suggestions.length, 1);
  assert.equal(suggestions[0].suggested_candidate_id, null);
  assert.equal(suggestions[0].auto_apply, false);
  assert.equal(suggestions[0].requires_manual_override, true);
  assert.equal(suggestions[0].candidate_rankings.length, 2);
  assert.equal(suggestions[0].candidate_rankings[0].confidence_score, suggestions[0].candidate_rankings[1].confidence_score);
});
