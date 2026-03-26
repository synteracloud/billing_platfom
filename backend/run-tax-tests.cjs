const fs = require('fs');
const path = require('path');
const ts = require('/root/.nvm/versions/node/v22.21.1/lib/node_modules/typescript');

const sourceFiles = [
  'src/modules/invoices/entities/invoice.entity.ts',
  'src/modules/invoices/entities/invoice-line.entity.ts',
  'src/modules/invoices/invoices.repository.ts',
  'src/modules/ledger/entities/journal-entry.entity.ts',
  'src/modules/ledger/entities/journal-line.entity.ts',
  'src/modules/ledger/ledger.repository.ts',
  'src/modules/tax/tax.service.ts'
];

const srcRoot = path.resolve(__dirname);
const outRoot = path.join(srcRoot, '.tmp-test-dist');
fs.rmSync(outRoot, { recursive: true, force: true });

for (const relativeFile of sourceFiles) {
  const inputPath = path.join(srcRoot, relativeFile);
  const outputPath = path.join(outRoot, relativeFile.replace(/^src\//, '').replace(/\.ts$/, '.js'));
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

require('node:test');
require('./test/tax.reports.spec.js');
