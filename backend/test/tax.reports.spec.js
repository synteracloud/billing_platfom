const test = require('node:test');
const assert = require('node:assert/strict');

const { InvoicesRepository } = require('../.tmp-test-dist/modules/invoices/invoices.repository');
const { LedgerRepository } = require('../.tmp-test-dist/modules/ledger/ledger.repository');
const { TaxService } = require('../.tmp-test-dist/modules/tax/tax.service');

function createFixture() {
  const invoicesRepository = new InvoicesRepository();
  const ledgerRepository = new LedgerRepository();
  const taxService = new TaxService(invoicesRepository, ledgerRepository);

  return { invoicesRepository, ledgerRepository, taxService };
}

test('tax reports are period-aware, verified-only, and reproducible', () => {
  const { invoicesRepository, ledgerRepository, taxService } = createFixture();
  const tenantId = 'tenant-tax';

  const inv1 = invoicesRepository.create({
    tenant_id: tenantId,
    customer_id: 'cust-1',
    subscription_id: null,
    invoice_number: 'INV-TAX-001',
    status: 'issued',
    issue_date: '2026-01-05',
    due_date: '2026-01-20',
    currency: 'USD',
    subtotal_minor: 1000,
    tax_minor: 100,
    discount_minor: 0,
    total_minor: 1100,
    amount_paid_minor: 0,
    amount_due_minor: 1100,
    notes: null,
    issued_at: '2026-01-05T00:00:00.000Z',
    voided_at: null,
    metadata: null
  });

  const inv2 = invoicesRepository.create({
    tenant_id: tenantId,
    customer_id: 'cust-1',
    subscription_id: null,
    invoice_number: 'INV-TAX-002',
    status: 'issued',
    issue_date: '2026-02-03',
    due_date: '2026-02-20',
    currency: 'USD',
    subtotal_minor: 2000,
    tax_minor: 200,
    discount_minor: 0,
    total_minor: 2200,
    amount_paid_minor: 0,
    amount_due_minor: 2200,
    notes: null,
    issued_at: '2026-02-03T00:00:00.000Z',
    voided_at: null,
    metadata: null
  });

  invoicesRepository.create({
    tenant_id: tenantId,
    customer_id: 'cust-1',
    subscription_id: null,
    invoice_number: 'INV-TAX-003',
    status: 'issued',
    issue_date: '2026-02-15',
    due_date: '2026-02-28',
    currency: 'USD',
    subtotal_minor: 500,
    tax_minor: 50,
    discount_minor: 0,
    total_minor: 550,
    amount_paid_minor: 0,
    amount_due_minor: 550,
    notes: null,
    issued_at: '2026-02-15T00:00:00.000Z',
    voided_at: null,
    metadata: null
  });

  ledgerRepository.create(
    {
      id: 'je-tax-1', tenant_id: tenantId, source_type: 'invoice', source_id: inv1.id, source_event_id: 'evt-tax-1', event_name: 'billing.invoice.issued.v1', rule_version: '1', entry_date: '2026-01-05', currency_code: 'USD', description: null, created_at: '2026-01-05T00:00:00.000Z'
    },
    [
      { id: 'je-tax-1-l1', tenant_id: tenantId, journal_entry_id: 'je-tax-1', line_number: 1, account_code: '1100', account_name: 'AR', direction: 'debit', amount_minor: 1100, currency_code: 'USD', created_at: '2026-01-05T00:00:00.000Z' },
      { id: 'je-tax-1-l2', tenant_id: tenantId, journal_entry_id: 'je-tax-1', line_number: 2, account_code: '4000', account_name: 'Revenue', direction: 'credit', amount_minor: 1000, currency_code: 'USD', created_at: '2026-01-05T00:00:00.000Z' },
      { id: 'je-tax-1-l3', tenant_id: tenantId, journal_entry_id: 'je-tax-1', line_number: 3, account_code: '2100', account_name: 'Sales Tax Payable', direction: 'credit', amount_minor: 100, currency_code: 'USD', created_at: '2026-01-05T00:00:00.000Z' }
    ]
  );

  ledgerRepository.create(
    {
      id: 'je-tax-2', tenant_id: tenantId, source_type: 'invoice', source_id: inv2.id, source_event_id: 'evt-tax-2', event_name: 'billing.invoice.issued.v1', rule_version: '1', entry_date: '2026-02-03', currency_code: 'USD', description: null, created_at: '2026-02-03T00:00:00.000Z'
    },
    [
      { id: 'je-tax-2-l1', tenant_id: tenantId, journal_entry_id: 'je-tax-2', line_number: 1, account_code: '1100', account_name: 'AR', direction: 'debit', amount_minor: 2200, currency_code: 'USD', created_at: '2026-02-03T00:00:00.000Z' },
      { id: 'je-tax-2-l2', tenant_id: tenantId, journal_entry_id: 'je-tax-2', line_number: 2, account_code: '4000', account_name: 'Revenue', direction: 'credit', amount_minor: 2000, currency_code: 'USD', created_at: '2026-02-03T00:00:00.000Z' },
      { id: 'je-tax-2-l3', tenant_id: tenantId, journal_entry_id: 'je-tax-2', line_number: 3, account_code: '2100', account_name: 'Sales Tax Payable', direction: 'credit', amount_minor: 200, currency_code: 'USD', created_at: '2026-02-03T00:00:00.000Z' }
    ]
  );

  ledgerRepository.create(
    {
      id: 'je-tax-remit-1', tenant_id: tenantId, source_type: 'tax_payment', source_id: 'tax-remit-1', source_event_id: 'evt-tax-remit-1', event_name: 'billing.bill.paid.v1', rule_version: '1', entry_date: '2026-02-20', currency_code: 'USD', description: null, created_at: '2026-02-20T00:00:00.000Z'
    },
    [
      { id: 'je-tax-remit-1-l1', tenant_id: tenantId, journal_entry_id: 'je-tax-remit-1', line_number: 1, account_code: '2100', account_name: 'Sales Tax Payable', direction: 'debit', amount_minor: 150, currency_code: 'USD', created_at: '2026-02-20T00:00:00.000Z' },
      { id: 'je-tax-remit-1-l2', tenant_id: tenantId, journal_entry_id: 'je-tax-remit-1', line_number: 2, account_code: '1000', account_name: 'Cash', direction: 'credit', amount_minor: 150, currency_code: 'USD', created_at: '2026-02-20T00:00:00.000Z' }
    ]
  );

  const january = taxService.getTaxPayableSummary(tenantId, '2026-01-01', '2026-01-31');
  assert.equal(january.opening_tax_payable_minor, 0);
  assert.equal(january.tax_collected_minor, 100);
  assert.equal(january.tax_paid_minor, 0);
  assert.equal(january.closing_tax_payable_minor, 100);

  const february = taxService.getTaxCollectedVsPaid(tenantId, '2026-02-01', '2026-02-28');
  assert.equal(february.tax_collected_minor, 200);
  assert.equal(february.tax_paid_minor, 150);
  assert.equal(february.net_liability_change_minor, 50);
  assert.equal(february.liability_view.liability_increase_minor, 200);
  assert.equal(february.liability_view.closing_liability_minor, 150);

  const exportModel = taxService.getPeriodTaxReportExportModel(tenantId, '2026-02-01', '2026-02-28');
  assert.equal(exportModel.verified_data_only, true);
  assert.equal(exportModel.totals.taxable_invoice_count, 1, 'unmatched taxable invoice should not be exported as verified');
  assert.equal(exportModel.quality_checks.missing_taxable_record_ids.length, 1);
  assert.equal(exportModel.quality_checks.tax_records_match_ledger, false);
  assert.equal(exportModel.quality_checks.period_slicing_valid, true);

  const repeat = taxService.getTaxPayableSummary(tenantId, '2026-01-01', '2026-01-31');
  assert.equal(repeat.reproducibility.source_hash, january.reproducibility.source_hash);
});
