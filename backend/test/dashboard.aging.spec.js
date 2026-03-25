const test = require('node:test');
const assert = require('node:assert/strict');

const { buildInvoiceAgingBuckets } = require('../.tmp-test-dist/modules/dashboard/dashboard.service');

test('assigns invoices into aging buckets without double counting and excludes closed states', () => {
  const asOfDate = '2026-03-25';

  const buckets = buildInvoiceAgingBuckets(
    [
      { status: 'issued', due_date: '2026-03-30', amount_due_minor: 1000 },
      { status: 'issued', due_date: '2026-03-10', amount_due_minor: 2000 },
      { status: 'partially_paid', due_date: '2026-02-20', amount_due_minor: 3000 },
      { status: 'issued', due_date: '2026-01-10', amount_due_minor: 4000 },
      { status: 'draft', due_date: '2026-01-01', amount_due_minor: 5000 },
      { status: 'void', due_date: '2026-02-01', amount_due_minor: 6000 },
      { status: 'paid', due_date: '2026-03-01', amount_due_minor: 7000 },
      { status: 'issued', due_date: null, amount_due_minor: 800 },
      { status: 'issued', due_date: '2026-03-15', amount_due_minor: 0 }
    ],
    asOfDate
  );

  assert.deepEqual(buckets, {
    current: 1800,
    days_30: 2000,
    days_60: 3000,
    days_90_plus: 4000,
  });

  const total = buckets.current + buckets.days_30 + buckets.days_60 + buckets.days_90_plus;
  assert.equal(total, 10800);
});

test('moves balances across buckets as invoices age over time', () => {
  const invoices = [
    { status: 'issued', due_date: '2026-03-20', amount_due_minor: 1000 },
    { status: 'partially_paid', due_date: '2026-02-20', amount_due_minor: 2000 },
  ];

  const onMarch25 = buildInvoiceAgingBuckets(invoices, '2026-03-25');
  assert.deepEqual(onMarch25, {
    current: 0,
    days_30: 1000,
    days_60: 2000,
    days_90_plus: 0,
  });

  const onMay25 = buildInvoiceAgingBuckets(invoices, '2026-05-25');
  assert.deepEqual(onMay25, {
    current: 0,
    days_30: 0,
    days_60: 0,
    days_90_plus: 3000,
  });
});
