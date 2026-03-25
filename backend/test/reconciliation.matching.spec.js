const test = require('node:test');
const assert = require('node:assert/strict');

const { MatchingEngine } = require('../.tmp-test-dist/modules/reconciliation/matching-engine');

test('matches invoice-payment and payment-bank using reference, amount, and date proximity', () => {
  const engine = new MatchingEngine();
  const result = engine.run({
    invoices: [
      { id: 'inv-1', tenant_id: 't1', currency_code: 'USD', invoice_date: '2026-03-01', amount_minor: 10000, reference_id: 'INV-1' }
    ],
    payments: [
      { id: 'pay-1', tenant_id: 't1', currency_code: 'USD', payment_date: '2026-03-02', amount_minor: 10000, reference_id: 'inv-1' }
    ],
    bank_transactions: [
      {
        id: 'txn-1',
        tenant_id: 't1',
        currency_code: 'USD',
        transaction_date: '2026-03-03',
        amount_minor: 10000,
        direction: 'credit',
        reference_id: 'INV-1'
      }
    ]
  });

  assert.equal(result.invoice_payment_matches.length, 1);
  assert.equal(result.payment_bank_transaction_matches.length, 1);
  assert.equal(result.invoice_payment_matches[0].rule, 'reference_id');
  assert.equal(result.payment_bank_transaction_matches[0].rule, 'reference_id');
  assert.deepEqual(result.exceptions, []);
});

test('supports partial and split payment matching deterministically', () => {
  const engine = new MatchingEngine();
  const input = {
    invoices: [
      { id: 'inv-a', tenant_id: 't1', currency_code: 'USD', invoice_date: '2026-03-01', amount_minor: 10000 },
      { id: 'inv-b', tenant_id: 't1', currency_code: 'USD', invoice_date: '2026-03-02', amount_minor: 3000 }
    ],
    payments: [
      { id: 'pay-a', tenant_id: 't1', currency_code: 'USD', payment_date: '2026-03-02', amount_minor: 7000 },
      { id: 'pay-b', tenant_id: 't1', currency_code: 'USD', payment_date: '2026-03-03', amount_minor: 6000 }
    ],
    bank_transactions: [
      { id: 'txn-a', tenant_id: 't1', currency_code: 'USD', transaction_date: '2026-03-02', amount_minor: 7000, direction: 'credit' },
      { id: 'txn-b', tenant_id: 't1', currency_code: 'USD', transaction_date: '2026-03-03', amount_minor: 6000, direction: 'credit' }
    ]
  };

  const firstRun = engine.run(input);
  const secondRun = engine.run(input);

  assert.deepEqual(firstRun, secondRun, 'matching output should be deterministic for same input');

  assert.deepEqual(firstRun.invoice_payment_matches, [
    {
      from_id: 'inv-a',
      to_id: 'pay-a',
      matched_amount_minor: 7000,
      date_distance_days: 1,
      reference_match: false,
      rule: 'amount_date_partial'
    },
    {
      from_id: 'inv-a',
      to_id: 'pay-b',
      matched_amount_minor: 3000,
      date_distance_days: 2,
      reference_match: false,
      rule: 'amount_date_partial'
    },
    {
      from_id: 'inv-b',
      to_id: 'pay-b',
      matched_amount_minor: 3000,
      date_distance_days: 1,
      reference_match: false,
      rule: 'amount_date'
    }
  ]);
  assert.equal(firstRun.payment_bank_transaction_matches.length, 2);
  assert(firstRun.exceptions.every((item) => item.reason !== 'ambiguous'));
});

test('avoids false positives and flags ambiguous candidates', () => {
  const engine = new MatchingEngine();
  const result = engine.run({
    invoices: [
      { id: 'inv-ambiguous', tenant_id: 't1', currency_code: 'USD', invoice_date: '2026-03-10', amount_minor: 10000 },
      { id: 'inv-too-far', tenant_id: 't1', currency_code: 'USD', invoice_date: '2026-03-10', amount_minor: 7000 }
    ],
    payments: [
      { id: 'pay-1', tenant_id: 't1', currency_code: 'USD', payment_date: '2026-03-10', amount_minor: 10000 },
      { id: 'pay-2', tenant_id: 't1', currency_code: 'USD', payment_date: '2026-03-10', amount_minor: 10000 },
      { id: 'pay-3', tenant_id: 't1', currency_code: 'USD', payment_date: '2026-03-22', amount_minor: 7000 }
    ],
    bank_transactions: []
  });

  assert.equal(result.invoice_payment_matches.length, 0);

  assert(result.exceptions.some((item) => item.entity_id === 'inv-ambiguous' && item.reason === 'ambiguous'));
  assert(result.exceptions.some((item) => item.entity_id === 'inv-too-far' && item.reason === 'unmatched'));
});
