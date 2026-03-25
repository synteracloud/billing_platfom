const fs = require('fs');
const path = require('path');
const ts = require('/root/.nvm/versions/node/v22.21.1/lib/node_modules/typescript');

const sourceFiles = [
  'src/common/transactions/financial-transaction.manager.ts',
  'src/modules/events/entities/event.entity.ts',
  'src/modules/events/domain-event.validator.ts',
  'src/modules/events/dto/query-events.dto.ts',
  'src/modules/events/events.repository.ts',
  'src/modules/events/events.service.ts',
  'src/modules/events/queue/queue.constants.ts',
  'src/modules/events/queue/event-queue.types.ts',
  'src/modules/events/queue/event-queue.publisher.ts',
  'src/modules/events/queue/in-memory-queue.driver.ts',
  'src/modules/idempotency/entities/idempotency-key.entity.ts',
  'src/modules/idempotency/idempotency.repository.ts',
  'src/modules/idempotency/idempotency.service.ts',
  'src/modules/idempotency/event-consumer-idempotency.service.ts',
  'src/modules/ledger/entities/journal-entry.entity.ts',
  'src/modules/ledger/entities/journal-line.entity.ts',
  'src/modules/ledger/ledger.repository.ts',
  'src/modules/reconciliation/entities/manual-reconciliation.entity.ts',
  'src/modules/reconciliation/reconciliation.repository.ts',
  'src/modules/reconciliation/reconciliation.service.ts',
  'tests/manual-reconciliation-override.test.ts'
];

const srcRoot = path.resolve(__dirname);
const outRoot = path.join(srcRoot, '.tmp-test-dist-reconciliation');
fs.rmSync(outRoot, { recursive: true, force: true });

for (const relativeFile of sourceFiles) {
  const inputPath = path.join(srcRoot, relativeFile);
  const outputPath = path.join(outRoot, relativeFile.replace(/\.ts$/, '.js'));
  const source = fs.readFileSync(inputPath, 'utf8');
  const result = ts.transpileModule(source, {
    compilerOptions: {
      module: ts.ModuleKind.CommonJS,
      target: ts.ScriptTarget.ES2022,
      experimentalDecorators: true,
      emitDecoratorMetadata: true,
      esModuleInterop: true
    },
    fileName: inputPath,
    reportDiagnostics: false
  });

  fs.mkdirSync(path.dirname(outputPath), { recursive: true });
  fs.writeFileSync(outputPath, result.outputText);
}

require(path.join(outRoot, 'tests/manual-reconciliation-override.test.js'));
