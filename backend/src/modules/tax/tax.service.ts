import { BadRequestException } from '@nestjs/common';
import { createHash } from 'crypto';
import { InvoicesRepository } from '../invoices/invoices.repository';
import { JournalEntryEntity } from '../ledger/entities/journal-entry.entity';
import { LedgerRepository } from '../ledger/ledger.repository';
import { TaxRepository } from './tax.repository';
import { TaxDocumentCalculationResult, TaxLineCalculationInput, TaxLineCalculationResult, TaxRateEntity, TaxSummaryReport } from './tax.types';

const TAX_LIABILITY_ACCOUNT_CODE = '2100';

export class TaxService {
  constructor(
    private readonly invoicesRepository: InvoicesRepository = new InvoicesRepository(),
    private readonly ledgerRepository: LedgerRepository = new LedgerRepository(),
    private readonly taxRepository: TaxRepository = new TaxRepository()
  ) {}

  upsertTaxRate(rate: Omit<TaxRateEntity, 'id' | 'created_at' | 'updated_at'> & { id?: string }): TaxRateEntity {
    if (!rate.tenant_id?.trim()) {
      throw new BadRequestException('tenant_id is required');
    }
    if (!rate.tax_code?.trim()) {
      throw new BadRequestException('tax_code is required');
    }
    if (!rate.jurisdiction?.trim()) {
      throw new BadRequestException('jurisdiction is required');
    }
    if (!Number.isInteger(rate.rate_basis_points) || rate.rate_basis_points < 0 || rate.rate_basis_points > 100000) {
      throw new BadRequestException('rate_basis_points must be an integer between 0 and 100000');
    }
    return this.taxRepository.upsertRate({
      ...rate,
      tax_code: rate.tax_code.trim().toUpperCase(),
      jurisdiction: rate.jurisdiction.trim().toUpperCase()
    });
  }

  calculateDocumentTaxes(input: {
    tenant_id: string;
    jurisdiction: string;
    currency_code: string;
    lines: TaxLineCalculationInput[];
    effective_at: string;
  }): TaxDocumentCalculationResult {
    const jurisdiction = input.jurisdiction.trim().toUpperCase();
    const results = input.lines.map((line, index) => this.calculateLineTax(input.tenant_id, jurisdiction, line, input.effective_at, String(index + 1)));
    const subtotal = results.reduce((sum, line) => sum + line.taxable_base_minor, 0);
    const tax = results.reduce((sum, line) => sum + line.tax_minor, 0);
    const total = results.reduce((sum, line) => sum + line.total_minor, 0);
    const byTaxCodeMap = new Map<string, { tax_code: string; rate_basis_points: number; tax_minor: number; taxable_base_minor: number }>();
    for (const line of results) {
      if (!line.tax_code || line.tax_minor === 0) {
        continue;
      }
      const key = `${line.tax_code}:${line.rate_basis_points}`;
      const current = byTaxCodeMap.get(key) ?? { tax_code: line.tax_code, rate_basis_points: line.rate_basis_points, tax_minor: 0, taxable_base_minor: 0 };
      current.tax_minor += line.tax_minor;
      current.taxable_base_minor += line.taxable_base_minor;
      byTaxCodeMap.set(key, current);
    }

    return {
      jurisdiction,
      currency_code: input.currency_code.trim().toUpperCase(),
      subtotal_minor: subtotal,
      tax_minor: tax,
      total_minor: total,
      lines: results,
      by_tax_code: Array.from(byTaxCodeMap.values()).sort((a, b) => a.tax_code.localeCompare(b.tax_code) || a.rate_basis_points - b.rate_basis_points)
    };
  }

  buildTaxSummary(input: {
    salesTaxDocuments: Array<{ jurisdiction: string; tax_minor: number }>;
    purchaseTaxDocuments: Array<{ jurisdiction: string; tax_minor: number }>;
    ledgerEntries: JournalEntryEntity[];
  }): TaxSummaryReport {
    const byJurisdiction = new Map<string, { tax_collected_minor: number; tax_paid_minor: number }>();

    for (const doc of input.salesTaxDocuments) {
      const key = doc.jurisdiction.toUpperCase();
      const current = byJurisdiction.get(key) ?? { tax_collected_minor: 0, tax_paid_minor: 0 };
      current.tax_collected_minor += Math.max(0, doc.tax_minor);
      byJurisdiction.set(key, current);
    }
    for (const doc of input.purchaseTaxDocuments) {
      const key = doc.jurisdiction.toUpperCase();
      const current = byJurisdiction.get(key) ?? { tax_collected_minor: 0, tax_paid_minor: 0 };
      current.tax_paid_minor += Math.max(0, doc.tax_minor);
      byJurisdiction.set(key, current);
    }

    const reportLines = Array.from(byJurisdiction.entries())
      .sort(([a], [b]) => a.localeCompare(b))
      .map(([jurisdiction, value]) => ({
        jurisdiction,
        tax_collected_minor: value.tax_collected_minor,
        tax_paid_minor: value.tax_paid_minor,
        net_tax_liability_minor: value.tax_collected_minor - value.tax_paid_minor
      }));

    const taxCollected = reportLines.reduce((sum, line) => sum + line.tax_collected_minor, 0);
    const taxPaid = reportLines.reduce((sum, line) => sum + line.tax_paid_minor, 0);
    const net = taxCollected - taxPaid;

    const ledgerTaxLiability = input.ledgerEntries.reduce((sum, entry) => {
      return sum + entry.lines.reduce((lineSum, line) => {
        if (line.account_code !== TAX_LIABILITY_ACCOUNT_CODE) {
          return lineSum;
        }
        return lineSum + (line.direction === 'credit' ? line.amount_minor : -line.amount_minor);
      }, 0);
    }, 0);

    if (ledgerTaxLiability !== net) {
      throw new BadRequestException(`Tax summary mismatch against ledger liability account 2100: expected ${net}, got ${ledgerTaxLiability}`);
    }

    return {
      tax_collected_minor: taxCollected,
      tax_paid_minor: taxPaid,
      net_tax_liability_minor: net,
      by_jurisdiction: reportLines
    };
  }

  private calculateLineTax(
    tenantId: string,
    jurisdiction: string,
    line: TaxLineCalculationInput,
    effectiveAt: string,
    fallbackLineId: string
  ): TaxLineCalculationResult {
    const lineId = line.line_id ?? fallbackLineId;
    const quantity = line.quantity ?? 1;
    if (!Number.isFinite(quantity) || quantity <= 0) {
      throw new BadRequestException('quantity must be greater than 0');
    }

    const extendedAmount = Math.round(line.amount_minor * quantity);
    if (!Number.isInteger(extendedAmount) || extendedAmount < 0) {
      throw new BadRequestException('amount_minor must resolve to a non-negative integer');
    }

    const resolvedRate = this.resolveRate(tenantId, jurisdiction, line.tax_code ?? null, effectiveAt);
    const rateBasisPoints = line.tax_rate_basis_points ?? resolvedRate?.rate_basis_points ?? 0;
    const inclusive = line.tax_inclusive ?? resolvedRate?.inclusive ?? false;

    const taxableBase = inclusive ? Math.round((extendedAmount * 10000) / (10000 + rateBasisPoints)) : extendedAmount;
    const taxMinor = inclusive ? extendedAmount - taxableBase : Math.round((taxableBase * rateBasisPoints) / 10000);
    const totalMinor = inclusive ? extendedAmount : taxableBase + taxMinor;

    return {
      line_id: lineId,
      tax_code: line.tax_code?.toUpperCase() ?? resolvedRate?.tax_code ?? null,
      rate_basis_points: rateBasisPoints,
      inclusive,
      taxable_base_minor: taxableBase,
      tax_minor: taxMinor,
      total_minor: totalMinor
    };
  }

  private resolveRate(tenantId: string, jurisdiction: string, taxCode: string | null, effectiveAt: string): TaxRateEntity | null {
    if (!taxCode) {
      return null;
    }

    return this.taxRepository.listRates(tenantId).find((rate) => {
      if (rate.tax_code !== taxCode.toUpperCase()) {
        return false;
      }
      if (rate.jurisdiction !== jurisdiction) {
        return false;
      }
      if (rate.effective_from > effectiveAt) {
        return false;
      }
      if (rate.effective_to && rate.effective_to < effectiveAt) {
        return false;
      }
      return true;
    }) ?? null;
  }

  getTaxPayableSummary(tenantId: string, dateFrom: string, dateTo: string): {
    opening_tax_payable_minor: number;
    tax_collected_minor: number;
    tax_paid_minor: number;
    closing_tax_payable_minor: number;
    reproducibility: { source_hash: string; ledger_entry_count: number };
  } {
    this.assertDateRange(dateFrom, dateTo);
    const allEntries = this.ledgerRepository.listEntries(tenantId);
    const openingEntries = allEntries.filter((entry) => entry.entry_date < dateFrom);
    const periodEntries = allEntries.filter((entry) => entry.entry_date >= dateFrom && entry.entry_date <= dateTo);
    const opening = this.sumTaxLiability(openingEntries);
    const taxCollected = this.sumTaxLiabilityCredits(periodEntries);
    const taxPaid = this.sumTaxLiabilityDebits(periodEntries);
    const closing = opening + taxCollected - taxPaid;

    const reproducibilitySource = JSON.stringify({
      tenantId,
      dateFrom,
      dateTo,
      opening,
      taxCollected,
      taxPaid,
      entryIds: periodEntries.map((entry) => entry.id).sort()
    });

    return {
      opening_tax_payable_minor: opening,
      tax_collected_minor: taxCollected,
      tax_paid_minor: taxPaid,
      closing_tax_payable_minor: closing,
      reproducibility: {
        source_hash: createHash('sha256').update(reproducibilitySource).digest('hex'),
        ledger_entry_count: periodEntries.length
      }
    };
  }

  getTaxCollectedVsPaid(tenantId: string, dateFrom: string, dateTo: string): {
    tax_collected_minor: number;
    tax_paid_minor: number;
    net_liability_change_minor: number;
    liability_view: { liability_increase_minor: number; liability_decrease_minor: number; closing_liability_minor: number };
  } {
    const payable = this.getTaxPayableSummary(tenantId, dateFrom, dateTo);
    return {
      tax_collected_minor: payable.tax_collected_minor,
      tax_paid_minor: payable.tax_paid_minor,
      net_liability_change_minor: payable.tax_collected_minor - payable.tax_paid_minor,
      liability_view: {
        liability_increase_minor: payable.tax_collected_minor,
        liability_decrease_minor: payable.tax_paid_minor,
        closing_liability_minor: payable.closing_tax_payable_minor
      }
    };
  }

  getPeriodTaxReportExportModel(tenantId: string, dateFrom: string, dateTo: string): {
    verified_data_only: true;
    totals: { taxable_invoice_count: number };
    quality_checks: { missing_taxable_record_ids: string[]; tax_records_match_ledger: boolean; period_slicing_valid: boolean };
  } {
    this.assertDateRange(dateFrom, dateTo);
    const invoices = this.invoicesRepository
      .listByTenant(tenantId, {})
      .filter((invoice) => invoice.issue_date >= dateFrom && invoice.issue_date <= dateTo && invoice.tax_minor > 0);
    const ledgerEntries = this.ledgerRepository.listEntries(tenantId);
    const matchedInvoiceIds = new Set<string>();

    for (const entry of ledgerEntries) {
      if (entry.entry_date < dateFrom || entry.entry_date > dateTo) {
        continue;
      }
      if (entry.source_type !== 'invoice') {
        continue;
      }
      const taxCredit = entry.lines
        .filter((line) => line.account_code === TAX_LIABILITY_ACCOUNT_CODE && line.direction === 'credit')
        .reduce((sum, line) => sum + line.amount_minor, 0);
      if (taxCredit <= 0) {
        continue;
      }
      const invoice = invoices.find((candidate) => candidate.id === entry.source_id);
      if (invoice && invoice.tax_minor === taxCredit) {
        matchedInvoiceIds.add(invoice.id);
      }
    }

    const missing = invoices
      .filter((invoice) => !matchedInvoiceIds.has(invoice.id))
      .map((invoice) => invoice.id)
      .sort((a, b) => a.localeCompare(b));

    return {
      verified_data_only: true,
      totals: { taxable_invoice_count: matchedInvoiceIds.size },
      quality_checks: {
        missing_taxable_record_ids: missing,
        tax_records_match_ledger: missing.length === 0,
        period_slicing_valid: true
      }
    };
  }

  private sumTaxLiability(entries: Array<JournalEntryEntity & { lines: JournalEntryEntity['lines'] }>): number {
    return entries.reduce((sum, entry) => {
      return sum + entry.lines.reduce((lineSum, line) => {
        if (line.account_code !== TAX_LIABILITY_ACCOUNT_CODE) {
          return lineSum;
        }
        return lineSum + (line.direction === 'credit' ? line.amount_minor : -line.amount_minor);
      }, 0);
    }, 0);
  }

  private sumTaxLiabilityCredits(entries: Array<JournalEntryEntity & { lines: JournalEntryEntity['lines'] }>): number {
    return entries.reduce((sum, entry) => sum + entry.lines
      .filter((line) => line.account_code === TAX_LIABILITY_ACCOUNT_CODE && line.direction === 'credit')
      .reduce((lineSum, line) => lineSum + line.amount_minor, 0), 0);
  }

  private sumTaxLiabilityDebits(entries: Array<JournalEntryEntity & { lines: JournalEntryEntity['lines'] }>): number {
    return entries.reduce((sum, entry) => sum + entry.lines
      .filter((line) => line.account_code === TAX_LIABILITY_ACCOUNT_CODE && line.direction === 'debit')
      .reduce((lineSum, line) => lineSum + line.amount_minor, 0), 0);
  }

  private assertDateRange(dateFrom: string, dateTo: string): void {
    if (!/^\d{4}-\d{2}-\d{2}$/.test(dateFrom) || !/^\d{4}-\d{2}-\d{2}$/.test(dateTo)) {
      throw new BadRequestException('date_from and date_to must be in YYYY-MM-DD format');
    }
    if (dateFrom > dateTo) {
      throw new BadRequestException('date_from must be less than or equal to date_to');
    }
  }
}
