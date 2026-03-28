const fs = require('fs');
const path = require('path');
const ts = require('/root/.nvm/versions/node/v22.21.1/lib/node_modules/typescript');

const srcRoot = path.resolve(__dirname);
const sourceDir = path.join(srcRoot, 'src');
const outRoot = path.join(srcRoot, '.tmp-test-dist');

function walk(dir) {
  const out = [];
  for (const entry of fs.readdirSync(dir, { withFileTypes: true })) {
    const full = path.join(dir, entry.name);
    if (entry.isDirectory()) {
      out.push(...walk(full));
      continue;
    }
    if (entry.isFile() && full.endsWith('.ts')) {
      out.push(full);
    }
  }
  return out;
}

fs.rmSync(outRoot, { recursive: true, force: true });

for (const inputPath of walk(sourceDir)) {
  const relativeFile = path.relative(srcRoot, inputPath).replace(/\\/g, '/');
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
require('./test/final.qc4.hardening-supervisor-audit.spec.js');
