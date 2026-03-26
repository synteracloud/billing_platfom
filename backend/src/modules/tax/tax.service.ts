import { BadRequestException } from '@nestjs/common';
import { JournalEntryEntity } from '../ledger/entities/journal-entry.entity';
import { TaxRepository } from './tax.repository';
import { TaxDocumentCalculationResult, TaxLineCalculationInput, TaxLineCalculationResult, TaxRateEntity, TaxSummaryReport } from './tax.types';

const TAX_LIABILITY_ACCOUNT_CODE = '2100';

export class TaxService {
  constructor(private readonly taxRepository: TaxRepository = new TaxRepository()) {}

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
}
