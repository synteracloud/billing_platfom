const test = require('node:test');
const assert = require('node:assert/strict');

const {
  computeCurrentCashMinor,
  computeNetBurnMinor,
  computeRunwayAnalytics,
} = require('../.tmp-test-dist/modules/dashboard/dashboard.service');

test('computes runway using current_cash / net_burn where net_burn = outflows - inflows', () => {
  const currentCash = computeCurrentCashMinor([
    {
      lines: [
        { account_code: '1000', direction: 'debit', amount_minor: 12000 },
        { account_code: '4000', direction: 'credit', amount_minor: 12000 },
      ],
    },
    {
      lines: [
        { account_code: '5000', direction: 'debit', amount_minor: 2000 },
        { account_code: '1000', direction: 'credit', amount_minor: 2000 },
      ],
    },
  ]);

  const netBurn = computeNetBurnMinor(3000, 5000);
  const runway = computeRunwayAnalytics({
    current_cash_minor: currentCash,
    inflows_minor: 3000,
    outflows_minor: 5000,
  });

  assert.equal(currentCash, 10000);
  assert.equal(netBurn, 2000);
  assert.equal(runway.runway_days, 5);
  assert.equal(runway.net_burn_minor, 2000);
});

test('returns null runway when burn is zero or negative to avoid division errors', () => {
  const zeroBurn = computeRunwayAnalytics({
    current_cash_minor: 10000,
    inflows_minor: 5000,
    outflows_minor: 5000,
  });
  assert.equal(zeroBurn.net_burn_minor, 0);
  assert.equal(zeroBurn.runway_days, null);

  const negativeBurn = computeRunwayAnalytics({
    current_cash_minor: 10000,
    inflows_minor: 7000,
    outflows_minor: 5000,
  });
  assert.equal(negativeBurn.net_burn_minor, -2000);
  assert.equal(negativeBurn.runway_days, null);
});

test('returns null runway when cash is zero and simulates different burn rates', () => {
  const noCash = computeRunwayAnalytics({
    current_cash_minor: 0,
    inflows_minor: 1000,
    outflows_minor: 4000,
  });
  assert.equal(noCash.runway_days, null);

  const lowBurn = computeRunwayAnalytics({
    current_cash_minor: 20000,
    inflows_minor: 4500,
    outflows_minor: 5000,
  });
  const highBurn = computeRunwayAnalytics({
    current_cash_minor: 20000,
    inflows_minor: 1000,
    outflows_minor: 6000,
  });

  assert.ok(lowBurn.runway_days > highBurn.runway_days);
  assert.equal(lowBurn.net_burn_minor, 500);
  assert.equal(highBurn.net_burn_minor, 5000);
});
