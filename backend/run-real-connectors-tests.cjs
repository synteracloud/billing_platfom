const fs = require('fs');
const path = require('path');
const ts = require('/root/.nvm/versions/node/v22.21.1/lib/node_modules/typescript');

const sourceFiles = [
  'src/modules/integrations/interfaces/connector.types.ts',
  'src/modules/integrations/interfaces/connector.interface.ts',
  'src/modules/integrations/providers/provider-transport.interface.ts',
  'src/modules/integrations/providers/base-transport.connector.ts',
  'src/modules/integrations/providers/shopify.transport.ts',
  'src/modules/integrations/providers/shopify.connector.ts',
  'src/modules/integrations/providers/quickbooks.transport.ts',
  'src/modules/integrations/providers/quickbooks.connector.ts'
];

const srcRoot = path.resolve(__dirname);
const outRoot = path.join(srcRoot, '.tmp-test-dist');

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
require('./test/integrations.real-connectors.spec.js');
