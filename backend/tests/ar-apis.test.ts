import assert from 'assert';
import { ExecutionContext } from '@nestjs/common';
import { CustomersRepository } from '../src/modules/customers/customers.repository';
import { CustomersService } from '../src/modules/customers/customers.service';
import { InvoicesRepository } from '../src/modules/invoices/invoices.repository';
import { PaymentsRepository } from '../src/modules/payments/payments.repository';
import { ArReadOnlyGuard } from '../src/modules/ar/ar-readonly.guard';
import { ArService } from '../src/modules/ar/ar.service';

function buildExecutionContext(method: string): ExecutionContext {
  return {
    switchToHttp: () => ({
      getRequest: () => ({ method })
    })
  } as ExecutionContext;
}

async function main() {
  const customersService = new CustomersService(new CustomersRepository());
  const invoicesRepository = new InvoicesRepository();
  const paymentsRepository = new PaymentsRepository();
  const arService = new ArService(customersService, invoicesRepository, paymentsRepository);

  const tenantId = 'tenant-ar';
  const customer = customersService.createCustomer(tenantId, {
    legal_name: 'AR Customer',
    email: 'ar@example.com',
    billing_country: 'US'
  });

  const januaryInvoice = invoicesRepository.create({
    tenant_id: tenantId,
    customer_id: customer.id,
    subscription_id: null,
    invoice_number: 'INV-1001',
    status: 'issued',
    issue_date: '2026-01-05',
    due_date: '2026-01-20',
    currency: 'USD',
    subtotal_minor: 1_000,
    tax_minor: 0,
    discount_minor: 0,
    total_minor: 1_000,
    amount_paid_minor: 400,
    amount_due_minor: 600,
    notes: null,
    issued_at: '2026-01-05T00:00:00.000Z',
    voided_at: null,
    metadata: null
  });

  invoicesRepository.create({
    tenant_id: tenantId,
    customer_id: customer.id,
    subscription_id: null,
    invoice_number: 'INV-1002',
    status: 'issued',
    issue_date: '2026-02-01',
    due_date: '2026-02-18',
    currency: 'USD',
    subtotal_minor: 2_500,
    tax_minor: 0,
    discount_minor: 0,
    total_minor: 2_500,
    amount_paid_minor: 0,
    amount_due_minor: 2_500,
    notes: null,
    issued_at: '2026-02-01T00:00:00.000Z',
    voided_at: null,
    metadata: null
  });

  const payment = paymentsRepository.create({
    tenant_id: tenantId,
    customer_id: customer.id,
    payment_reference: 'PMT-01',
    payment_date: '2026-01-10',
    currency: 'USD',
    amount_received_minor: 400,
    allocated_minor: 400,
    unallocated_minor: 0,
    payment_method: 'bank_transfer',
    status: 'recorded',
    metadata: null
  });

  paymentsRepository.createAllocation({
    tenant_id: tenantId,
    payment_id: payment.id,
    invoice_id: januaryInvoice.id,
    allocated_minor: 400,
    allocation_date: '2026-01-10',
    metadata: null
  });

  const balance = arService.getCustomerBalance(tenantId, customer.id);
  assert.equal(balance.total_invoiced_minor, 3_500);
  assert.equal(balance.total_paid_minor, 400);
  assert.equal(balance.outstanding_balance_minor, 3_100);

  const aging = arService.getAging(tenantId, customer.id, '2026-03-01');
  assert.equal(aging.buckets.days_31_60, 600);
  assert.equal(aging.buckets.days_1_30, 2_500);
  assert.equal(aging.total_outstanding_minor, 3_100);

  const statement = arService.getStatement(tenantId, customer.id, { from: '2026-01-01', to: '2026-01-31' });
  assert.equal(statement.opening_balance_minor, 0);
  assert.equal(statement.entries.length, 2);
  assert.equal(statement.entries[0].type, 'invoice');
  assert.equal(statement.entries[1].type, 'payment');
  assert.equal(statement.closing_balance_minor, 600);

  const guard = new ArReadOnlyGuard();
  assert.equal(guard.canActivate(buildExecutionContext('GET')), true);
  assert.throws(() => guard.canActivate(buildExecutionContext('POST')));

  console.log('ar api test passed');
}

main().catch((error) => {
  console.error(error);
  process.exitCode = 1;
});
