import assert from 'assert';
import { BillsRepository } from '../src/modules/bills/bills.repository';
import { BillsService } from '../src/modules/bills/bills.service';
import { VendorsRepository } from '../src/modules/vendors/vendors.repository';
import { VendorsService } from '../src/modules/vendors/vendors.service';

async function main() {
  const vendorsRepository = new VendorsRepository();
  const billsRepository = new BillsRepository();
  const vendorsService = new VendorsService(vendorsRepository);
  const billsService = new BillsService(billsRepository, vendorsRepository);

  const tenantId = 'tenant-a';
  const otherTenantId = 'tenant-b';

  const vendor = vendorsService.createVendor(tenantId, {
    name: 'Paper Supply Co',
    contact_email: 'ap@paper.example',
    currency_code: 'usd',
    status: 'active'
  });

  const bill = billsService.createBill(tenantId, {
    vendor_id: vendor.id,
    total_amount_minor: 250000,
    currency_code: 'usd',
    status: 'approved',
    issued_at: '2026-03-01',
    due_at: '2026-03-31'
  });

  assert.equal(bill.vendor_id, vendor.id, 'bill must be linked to created vendor');

  const vendorBills = billsService.listBills(tenantId, vendor.id);
  assert.equal(vendorBills.length, 1, 'vendor bill query should return linked bill');
  assert.equal(vendorBills[0]?.id, bill.id, 'vendor bill query should include created bill');

  assert.throws(
    () =>
      billsService.createBill(tenantId, {
        vendor_id: 'missing-vendor',
        total_amount_minor: 100,
        currency_code: 'USD'
      }),
    /vendor_id must reference an existing vendor in tenant scope/,
    'bill creation should fail when vendor does not exist'
  );

  const vendorInOtherTenant = vendorsService.createVendor(otherTenantId, {
    name: 'Other Tenant Vendor',
    currency_code: 'USD'
  });

  assert.throws(
    () =>
      billsService.createBill(tenantId, {
        vendor_id: vendorInOtherTenant.id,
        total_amount_minor: 100,
        currency_code: 'USD'
      }),
    /vendor_id must reference an existing vendor in tenant scope/,
    'bill creation should enforce tenant isolation for vendor references'
  );

  console.log('vendor-bill-linking test passed');
}

main().catch((error) => {
  console.error(error);
  process.exitCode = 1;
});
