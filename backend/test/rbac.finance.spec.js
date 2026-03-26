const test = require('node:test');
const assert = require('node:assert/strict');
const fs = require('node:fs');

const permissionsSource = fs.readFileSync('backend/src/modules/auth/permissions.ts', 'utf8');

test('RBAC matrix explicitly blocks unauthorized close/reopen/manual journal actions', () => {
  assert.match(permissionsSource, /staff: new Set\(\[PERMISSIONS\.VIEW_REPORTS\]\)/);
  assert.match(permissionsSource, /read_only_auditor: new Set\(\[PERMISSIONS\.VIEW_REPORTS\]\)/);
  assert.match(permissionsSource, /finance_manager:[\s\S]*PERMISSIONS\.REOPEN_BOOKS/);
  const adminBlock = permissionsSource.match(/admin: new Set\(\[(.*?)\]\),/s);
  assert(adminBlock, 'admin permission block must exist');
  assert.doesNotMatch(adminBlock[1], /PERMISSIONS\.REOPEN_BOOKS/);
});

test('Sensitive controllers use backend permission decorators', () => {
  const ledgerController = fs.readFileSync('backend/src/modules/ledger/ledger.controller.ts', 'utf8');
  const reconciliationController = fs.readFileSync('backend/src/modules/reconciliation/reconciliation.controller.ts', 'utf8');
  const accountingController = fs.readFileSync('backend/src/modules/accounting-periods/accounting-periods.controller.ts', 'utf8');

  assert.match(ledgerController, /@RequirePermissions\(PERMISSIONS\.POST_JOURNAL_ENTRIES\)/);
  assert.match(reconciliationController, /@RequirePermissions\(PERMISSIONS\.APPROVE_RECONCILIATION_MANUAL_OVERRIDES\)/);
  assert.match(accountingController, /@RequirePermissions\(PERMISSIONS\.CLOSE_PERIODS\)/);
  assert.match(accountingController, /@RequirePermissions\(PERMISSIONS\.REOPEN_BOOKS\)/);
});
