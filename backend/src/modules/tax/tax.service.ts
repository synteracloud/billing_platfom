import { Injectable } from '@nestjs/common';
import { InvoicesRepository } from '../invoices/invoices.repository';
import { LedgerRepository } from '../ledger/ledger.repository';

const SALES_TAX_ACCOUNT_CODE = '2100';
const VERIFIED_INVOICE_EVENTS = new Set(['billing.invoice.created.v1', 'billing.invoice.issued.v1']);

interface PeriodWindow {
  period_from: string;
  period_to: string;
}

interface VerifiedTaxRecord {
  invoice_id: string;
  invoice_number: string;
  issue_date: string;
  tax_minor: number;
  ledger_entry_id: string;
  ledger_source_event_id: string;
}

export interface TaxPayableSummary extends PeriodWindow {
  opening_tax_payable_minor: number;
  tax_collected_minor: number;
  tax_paid_minor: number;
  adjustments_minor: number;
  closing_tax_payable_minor: number;
  reproducibility: {
    ledger_entry_count: number;
    verified_taxable_invoice_count: number;
    source_hash: string;
  };
}

export interface TaxCollectedVsPaid extends PeriodWindow {
  tax_collected_minor: number;
  tax_paid_minor: number;
  net_liability_change_minor: number;
  liability_view: {
    liability_increase_minor: number;
    liability_decrease_minor: number;
    closing_liability_minor: number;
  };
}

export interface PeriodTaxReportExportModel extends PeriodWindow {
  generated_at: string;
  verified_data_only: true;
  totals: {
    taxable_invoice_count: number;
    tax_collected_minor: number;
    tax_paid_minor: number;
    tax_payable_end_minor: number;
  };
  records: Array<{
    kind: 'tax_collected' | 'tax_paid';
    date: string;
    source_document_id: string;
    source_document_number: string | null;
    ledger_entry_id: string;
    ledger_source_event_id: string;
    amount_minor: number;
  }>;
  quality_checks: {
    missing_taxable_record_ids: string[];
    tax_records_match_ledger: boolean;
    period_slicing_valid: boolean;
  };
}

@Injectable()
export class TaxService {
  constructor(
    private readonly invoicesRepository: InvoicesRepository,
    private readonly ledgerRepository: LedgerRepository
  ) {}

  getTaxPayableSummary(tenantId: string, periodFrom: string, periodTo: string): TaxPayableSummary {
    const window = this.normalizeWindow(periodFrom, periodTo);
    const scopedEntries = this.listPeriodEntries(tenantId, window.period_from, window.period_to);

    const openingTaxPayable = this.getLiabilityBalanceAt(tenantId, this.previousDate(window.period_from));
    const closingTaxPayable = this.getLiabilityBalanceAt(tenantId, window.period_to);

    const verifiedTaxRecords = this.listVerifiedTaxRecords(tenantId, window.period_from, window.period_to);
    const taxCollected = verifiedTaxRecords.reduce((sum, record) => sum + record.tax_minor, 0);
    const taxPaid = this.sumTaxPaid(scopedEntries);

    return {
      ...window,
      opening_tax_payable_minor: openingTaxPayable,
      tax_collected_minor: taxCollected,
      tax_paid_minor: taxPaid,
      adjustments_minor: closingTaxPayable - openingTaxPayable - taxCollected + taxPaid,
      closing_tax_payable_minor: closingTaxPayable,
      reproducibility: {
        ledger_entry_count: scopedEntries.length,
        verified_taxable_invoice_count: verifiedTaxRecords.length,
        source_hash: `${window.period_from}:${window.period_to}:${scopedEntries.map((entry) => entry.id).join('|')}`
      }
    };
  }

  getTaxCollectedVsPaid(tenantId: string, periodFrom: string, periodTo: string): TaxCollectedVsPaid {
    const window = this.normalizeWindow(periodFrom, periodTo);
    const scopedEntries = this.listPeriodEntries(tenantId, window.period_from, window.period_to);
    const taxCollected = this.listVerifiedTaxRecords(tenantId, window.period_from, window.period_to)
      .reduce((sum, record) => sum + record.tax_minor, 0);
    const taxPaid = this.sumTaxPaid(scopedEntries);
    const liabilityIncrease = this.sumTaxCollectedFromLedger(scopedEntries);
    const liabilityDecrease = taxPaid;

    return {
      ...window,
      tax_collected_minor: taxCollected,
      tax_paid_minor: taxPaid,
      net_liability_change_minor: taxCollected - taxPaid,
      liability_view: {
        liability_increase_minor: liabilityIncrease,
        liability_decrease_minor: liabilityDecrease,
        closing_liability_minor: this.getLiabilityBalanceAt(tenantId, window.period_to)
      }
    };
  }

  getPeriodTaxReportExportModel(tenantId: string, periodFrom: string, periodTo: string): PeriodTaxReportExportModel {
    const window = this.normalizeWindow(periodFrom, periodTo);
    const scopedEntries = this.listPeriodEntries(tenantId, window.period_from, window.period_to);
    const verifiedTaxRecords = this.listVerifiedTaxRecords(tenantId, window.period_from, window.period_to);

    const paidRecords = scopedEntries
      .flatMap((entry) => entry.lines
        .filter((line) => line.account_code === SALES_TAX_ACCOUNT_CODE && line.direction === 'debit')
        .map((line) => ({
          kind: 'tax_paid' as const,
          date: entry.entry_date,
          source_document_id: entry.source_id,
          source_document_number: null,
          ledger_entry_id: entry.id,
          ledger_source_event_id: entry.source_event_id,
          amount_minor: line.amount_minor
        })))
      .sort((left, right) => left.date.localeCompare(right.date) || left.ledger_entry_id.localeCompare(right.ledger_entry_id));

    const collectedRecords = verifiedTaxRecords.map((record) => ({
      kind: 'tax_collected' as const,
      date: record.issue_date,
      source_document_id: record.invoice_id,
      source_document_number: record.invoice_number,
      ledger_entry_id: record.ledger_entry_id,
      ledger_source_event_id: record.ledger_source_event_id,
      amount_minor: record.tax_minor
    }));

    const records = [...collectedRecords, ...paidRecords]
      .sort((left, right) => left.date.localeCompare(right.date) || left.ledger_entry_id.localeCompare(right.ledger_entry_id));

    const taxableInvoices = this.invoicesRepository
      .listByTenant(tenantId)
      .filter((invoice) => this.isInWindow(invoice.issue_date, window.period_from, window.period_to) && invoice.tax_minor > 0 && invoice.status !== 'void');
    const verifiedIds = new Set(verifiedTaxRecords.map((record) => record.invoice_id));
    const missingTaxableRecordIds = taxableInvoices
      .map((invoice) => invoice.id)
      .filter((invoiceId) => !verifiedIds.has(invoiceId))
      .sort((left, right) => left.localeCompare(right));

    return {
      ...window,
      generated_at: new Date().toISOString(),
      verified_data_only: true,
      totals: {
        taxable_invoice_count: verifiedTaxRecords.length,
        tax_collected_minor: collectedRecords.reduce((sum, record) => sum + record.amount_minor, 0),
        tax_paid_minor: paidRecords.reduce((sum, record) => sum + record.amount_minor, 0),
        tax_payable_end_minor: this.getLiabilityBalanceAt(tenantId, window.period_to)
      },
      records,
      quality_checks: {
        missing_taxable_record_ids: missingTaxableRecordIds,
        tax_records_match_ledger: missingTaxableRecordIds.length === 0,
        period_slicing_valid: records.every((record) => this.isInWindow(record.date, window.period_from, window.period_to))
      }
    };
  }

  private listVerifiedTaxRecords(tenantId: string, periodFrom: string, periodTo: string): VerifiedTaxRecord[] {
    const invoices = this.invoicesRepository
      .listByTenant(tenantId)
      .filter((invoice) => this.isInWindow(invoice.issue_date, periodFrom, periodTo) && invoice.tax_minor > 0 && invoice.status !== 'void');
    const entries = this.ledgerRepository.listEntries(tenantId);

    return invoices
      .map((invoice) => {
        const ledgerEntry = entries
          .filter((entry) => entry.source_id === invoice.id && VERIFIED_INVOICE_EVENTS.has(entry.event_name))
          .sort((left, right) => left.entry_date.localeCompare(right.entry_date) || left.id.localeCompare(right.id))[0];

        if (!ledgerEntry) {
          return null;
        }

        const liabilityTaxCredit = ledgerEntry.lines
          .filter((line) => line.account_code === SALES_TAX_ACCOUNT_CODE && line.direction === 'credit')
          .reduce((sum, line) => sum + line.amount_minor, 0);

        if (liabilityTaxCredit <= 0 || liabilityTaxCredit !== invoice.tax_minor) {
          return null;
        }

        return {
          invoice_id: invoice.id,
          invoice_number: invoice.invoice_number,
          issue_date: invoice.issue_date!,
          tax_minor: invoice.tax_minor,
          ledger_entry_id: ledgerEntry.id,
          ledger_source_event_id: ledgerEntry.source_event_id
        };
      })
      .filter((record): record is VerifiedTaxRecord => Boolean(record))
      .sort((left, right) => left.issue_date.localeCompare(right.issue_date) || left.invoice_id.localeCompare(right.invoice_id));
  }

  private listPeriodEntries(tenantId: string, periodFrom: string, periodTo: string) {
    return this.ledgerRepository
      .listEntries(tenantId)
      .filter((entry) => this.isInWindow(entry.entry_date, periodFrom, periodTo))
      .sort((left, right) => left.entry_date.localeCompare(right.entry_date) || left.id.localeCompare(right.id));
  }

  private sumTaxPaid(entries: ReturnType<LedgerRepository['listEntries']>): number {
    return entries.reduce((sum, entry) => sum + entry.lines
      .filter((line) => line.account_code === SALES_TAX_ACCOUNT_CODE && line.direction === 'debit')
      .reduce((lineSum, line) => lineSum + line.amount_minor, 0), 0);
  }

  private sumTaxCollectedFromLedger(entries: ReturnType<LedgerRepository['listEntries']>): number {
    return entries.reduce((sum, entry) => sum + entry.lines
      .filter((line) => line.account_code === SALES_TAX_ACCOUNT_CODE && line.direction === 'credit')
      .reduce((lineSum, line) => lineSum + line.amount_minor, 0), 0);
  }

  private getLiabilityBalanceAt(tenantId: string, asOfDate: string): number {
    const entries = this.ledgerRepository
      .listEntries(tenantId)
      .filter((entry) => entry.entry_date <= asOfDate);

    return entries.reduce((sum, entry) => sum + entry.lines.reduce((lineSum, line) => {
      if (line.account_code !== SALES_TAX_ACCOUNT_CODE) {
        return lineSum;
      }

      return lineSum + (line.direction === 'credit' ? line.amount_minor : -line.amount_minor);
    }, 0), 0);
  }

  private normalizeWindow(periodFrom: string, periodTo: string): PeriodWindow {
    const normalizedFrom = periodFrom.slice(0, 10);
    const normalizedTo = periodTo.slice(0, 10);
    if (normalizedFrom > normalizedTo) {
      return { period_from: normalizedTo, period_to: normalizedFrom };
    }

    return { period_from: normalizedFrom, period_to: normalizedTo };
  }

  private previousDate(date: string): string {
    const d = new Date(`${date}T00:00:00.000Z`);
    d.setUTCDate(d.getUTCDate() - 1);
    return d.toISOString().slice(0, 10);
  }

  private isInWindow(date: string | null, periodFrom: string, periodTo: string): boolean {
    return Boolean(date && date >= periodFrom && date <= periodTo);
  }
}
