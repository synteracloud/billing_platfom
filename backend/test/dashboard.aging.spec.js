const test = require('node:test');
const assert = require('node:assert/strict');

const { buildInvoiceAgingBuckets, trackBillDueStates } = require('../.tmp-test-dist/modules/dashboard/dashboard.service');

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

test('tracks due and overdue bills from bill state without duplicate tracking', () => {
  const tracking = trackBillDueStates(
    [
      { id: 'bill-1', status: 'issued', due_date: '2026-03-25', amount_due_minor: 500 },
      { id: 'bill-1', status: 'issued', due_date: '2026-03-25', amount_due_minor: 500 },
      { id: 'bill-2', status: 'partially_paid', due_date: '2026-03-20', amount_due_minor: 1000 },
      { id: 'bill-3', status: 'paid', due_date: '2026-03-10', amount_due_minor: 0 },
      { id: 'bill-4', status: 'void', due_date: '2026-03-10', amount_due_minor: 300 },
      { id: 'bill-5', status: 'issued', due_date: null, amount_due_minor: 200 }
    ],
    '2026-03-25'
  );

  assert.equal(tracking.due.length, 2);
  assert.deepEqual(tracking.due, [
    { bill_id: 'bill-1', due_date: '2026-03-25', overdue: false, days_overdue: 0 },
    { bill_id: 'bill-2', due_date: '2026-03-20', overdue: true, days_overdue: 5 },
  ]);
  assert.deepEqual(tracking.overdue, [
    { bill_id: 'bill-2', due_date: '2026-03-20', overdue: true, days_overdue: 5 },
  ]);
});

test('updates overdue detection when bill transitions from due to overdue', () => {
  const bills = [
    { bill_id: 'bill-transition', status: 'issued', due_date: '2026-03-25', amount_due_minor: 900 },
  ];

  const onDueDate = trackBillDueStates(bills, '2026-03-25');
  assert.equal(onDueDate.overdue.length, 0);

  const afterDueDate = trackBillDueStates(bills, '2026-03-26');
  assert.equal(afterDueDate.overdue.length, 1);
  assert.deepEqual(afterDueDate.overdue[0], {
    bill_id: 'bill-transition',
    due_date: '2026-03-25',
    overdue: true,
    days_overdue: 1,
  });
});
