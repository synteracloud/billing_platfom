const test = require('node:test');
const assert = require('node:assert/strict');
const fs = require('node:fs');
const path = require('node:path');

const repoRoot = path.resolve(__dirname, '..');
const modulesRoot = path.join(repoRoot, 'src', 'modules');
const frontendRoot = path.join(repoRoot, '..', 'frontend');

function read(filePath) {
  return fs.readFileSync(filePath, 'utf8');
}

function walk(dir, predicate = () => true) {
  const out = [];
  for (const entry of fs.readdirSync(dir, { withFileTypes: true })) {
    const full = path.join(dir, entry.name);
    if (entry.isDirectory()) {
      out.push(...walk(full, predicate));
      continue;
    }
    if (predicate(full)) {
      out.push(full);
    }
  }
  return out;
}

function relative(filePath) {
  return path.relative(repoRoot, filePath).replace(/\\/g, '/');
}

test('QC 10/10: financial architecture guardrails are enforced in code', () => {
  const serviceFiles = walk(modulesRoot, (file) => file.endsWith('.service.ts'));
  const violations = [];

  for (const filePath of serviceFiles) {
    const source = read(filePath);
    const rel = relative(filePath);

    const importMatches = [...source.matchAll(/import\s+\{\s*([A-Za-z0-9_]+Repository)\s*\}\s+from\s+'\.\.\/([^']+)'/g)];
    for (const match of importMatches) {
      const className = match[1];
      const importedModulePath = match[2];
      const importedModule = importedModulePath.split('/')[0];
      const currentModule = rel.split('/')[2];

      if (importedModule === currentModule) {
        continue;
      }

      const propertyPattern = new RegExp(`readonly\\s+(\\w+)\\s*:\\s*${className}`, 'g');
      const propertyMatches = [...source.matchAll(propertyPattern)];
      const readOnlyMethods = new Set([
        'findById',
        'findByExternalId',
        'findByPeriod',
        'findByTenantAndType',
        'listByTenant',
        'listByCustomer',
        'listByVendor',
        'listByInvoice',
        'listByPayment',
        'listInvoices',
        'listBills',
        'listEntries',
        'listEntriesByAccount',
        'listLines',
        'listEvents',
        'listOpenItems',
        'listOpenPayables',
        'listOpenReceivables',
        'getBalance',
        'createSnapshot',
        'restoreSnapshot'
      ]);

      for (const propertyMatch of propertyMatches) {
        const propertyName = propertyMatch[1];
        const callPattern = new RegExp(`\\b${propertyName}\\.(\\w+)\\(`, 'g');
        for (const callMatch of source.matchAll(callPattern)) {
          const methodName = callMatch[1];
          if (!readOnlyMethods.has(methodName)) {
            violations.push(`${rel}: cross-module repository mutation via ${propertyName}.${methodName}()`);
          }
        }
      }
    }
  }

  const mutationPaths = [
    path.join(modulesRoot, 'invoices', 'invoices.service.ts'),
    path.join(modulesRoot, 'payments', 'payments.service.ts'),
    path.join(modulesRoot, 'ledger', 'ledger.service.ts'),
    path.join(modulesRoot, 'bills', 'bills.service.ts')
  ];

  for (const filePath of mutationPaths) {
    const source = read(filePath);
    const rel = relative(filePath);
    assert.match(source, /logMutation\(/, `${rel} must produce audit mutations for financial actions`);
  }

  const ledgerService = read(path.join(modulesRoot, 'ledger', 'ledger.service.ts'));
  assert.match(ledgerService, /\bpost\(/, 'ledger posting API must exist');
  const directCreateUsage = [...ledgerService.matchAll(/ledgerRepository\.create\(/g)].length;
  assert.equal(directCreateUsage, 1, 'ledgerRepository.create must remain encapsulated in ledger.post() transaction flow');

  const projectionRebuild = read(path.join(modulesRoot, 'events', 'replay-rebuild.tooling.service.ts'));
  assert.match(projectionRebuild, /replayProjectionStreams\(/, 'replay rebuild from events must exist');
  assert.match(projectionRebuild, /rebuildAndVerifyConsistency\(/, 'replay consistency verification must exist');

  const reconciliationService = read(path.join(modulesRoot, 'reconciliation', 'reconciliation.service.ts'));
  assert.doesNotMatch(
    reconciliationService,
    /ledgerRepository\.(create|update|save|delete|softDelete)\(/,
    'reconciliation must not mutate ledger truth'
  );

  const integrationProviderFiles = walk(path.join(modulesRoot, 'integrations', 'providers'), (file) => file.endsWith('.ts'));
  for (const filePath of integrationProviderFiles) {
    const source = read(filePath);
    const rel = relative(filePath);
    assert.doesNotMatch(source, /ledger\.post\(|ledgerService\.post\(/, `${rel} must not post financial entries`);
    assert.doesNotMatch(source, /calculate|reconcile|recognize|amortize/i, `${rel} should stay transport-focused without business accounting logic`);
  }

  const aiController = read(path.join(modulesRoot, 'analytics', 'ai.controller.ts'));
  const aiSafetyService = read(path.join(modulesRoot, 'ai-safety', 'ai-safety.service.ts'));
  assert.match(aiController, /grounded_only:\s*true/, 'AI endpoints must enforce grounded_only');
  assert.match(aiController, /data_source:\s*'approved_read_models'/, 'AI endpoints must declare verified read model sources');
  assert.match(aiSafetyService, /source_ids/, 'AI safety service must return source ids tied to verified manifests');

  const frontendFiles = walk(frontendRoot, (file) => file.endsWith('.tsx') || file.endsWith('.ts'));
  for (const filePath of frontendFiles) {
    const rel = path.relative(path.join(repoRoot, '..'), filePath).replace(/\\/g, '/');
    const source = read(filePath);

    assert.doesNotMatch(source, /ledgerService\.post\(|\/api\/v1\/ledger\/post|postJournal|manual-journal/i, `${rel} must not post journals`);
    assert.doesNotMatch(source, /\b(line_tax_minor|tax_rate_basis_points)\s*[+\-*/]|\b(amount|total|balance)_minor\s*[+\-*/]/, `${rel} must not embed client-side financial math`);
  }

  assert.deepEqual(violations, [], `architecture violations found:\n${violations.join('\n')}`);
});
