const fs = require('fs');
const path = require('path');
const ts = require('/root/.nvm/versions/node/v22.21.1/lib/node_modules/typescript');

const sourceFiles = [
  'src/common/transactions/financial-state.validator.ts',
  'src/common/transactions/financial-transaction.manager.ts',
  'src/modules/customers/entities/customer.entity.ts',
  'src/modules/customers/customers.repository.ts',
  'src/modules/customers/customers.service.ts',
  'src/modules/invoices/entities/invoice.entity.ts',
  'src/modules/invoices/entities/invoice-line.entity.ts',
  'src/modules/invoices/dto/create-invoice.dto.ts',
  'src/modules/invoices/dto/add-line.dto.ts',
  'src/modules/invoices/dto/update-invoice.dto.ts',
  'src/modules/invoices/invoices.repository.ts',
  'src/modules/tax/tax.types.ts',
  'src/modules/tax/tax.repository.ts',
  'src/modules/tax/tax.service.ts',
  'src/modules/invoices/invoices.service.ts',
  'src/modules/payments/entities/payment.entity.ts',
  'src/modules/payments/entities/payment-allocation.entity.ts',
  'src/modules/payments/dto/create-payment.dto.ts',
  'src/modules/payments/dto/allocate-payment.dto.ts',
  'src/modules/payments/payments.repository.ts',
  'src/modules/payments/payments.service.ts',
  'src/modules/statements/statements.service.ts',
  'src/modules/idempotency/entities/idempotency-key.entity.ts',
  'src/modules/idempotency/idempotency.repository.ts',
  'src/modules/idempotency/idempotency.service.ts',
  'src/modules/idempotency/event-consumer-idempotency.service.ts',
  'src/modules/events/entities/event.entity.ts',
  'src/modules/events/domain-event.validator.ts',
  'src/modules/events/dto/query-events.dto.ts',
  'src/modules/events/events.repository.ts',
  'src/modules/events/events.service.ts',
  'src/modules/events/queue/event-queue.types.ts',
  'src/modules/events/queue/in-memory-queue.driver.ts',
  'src/modules/events/queue/queue.constants.ts',
  'src/modules/events/queue/event-queue.publisher.ts'
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
require('./test/customer.statement.spec.js');
