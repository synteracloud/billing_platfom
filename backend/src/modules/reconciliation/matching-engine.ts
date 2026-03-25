export interface MatchableInvoice {
  id: string;
  tenant_id: string;
  currency_code: string;
  invoice_date: string;
  amount_minor: number;
  reference_id?: string | null;
}

export interface MatchablePayment {
  id: string;
  tenant_id: string;
  currency_code: string;
  payment_date: string;
  amount_minor: number;
  reference_id?: string | null;
}

export interface MatchableBankTransaction {
  id: string;
  tenant_id: string;
  currency_code: string;
  transaction_date: string;
  amount_minor: number;
  direction: 'credit' | 'debit';
  reference_id?: string | null;
}

export interface MatchingEngineOptions {
  maxDateDistanceDays?: number;
  partialMaxDateDistanceDays?: number;
}

export interface MatchedPair {
  from_id: string;
  to_id: string;
  matched_amount_minor: number;
  date_distance_days: number;
  reference_match: boolean;
  rule: 'reference_id' | 'amount_date' | 'amount_date_partial';
}

export interface MatchException {
  entity: 'invoice' | 'payment' | 'bank_transaction';
  entity_id: string;
  reason: 'unmatched' | 'ambiguous';
}

export interface MatchingRunResult {
  invoice_payment_matches: MatchedPair[];
  payment_bank_transaction_matches: MatchedPair[];
  exceptions: MatchException[];
}

interface BaseRecord {
  id: string;
  tenant_id: string;
  currency_code: string;
  amount_minor: number;
  date: string;
  reference_id?: string | null;
}

interface WorkingRecord extends BaseRecord {
  remaining_minor: number;
  entity: MatchException['entity'];
}

const DEFAULTS: Required<MatchingEngineOptions> = {
  maxDateDistanceDays: 5,
  partialMaxDateDistanceDays: 2
};

export class MatchingEngine {
  private readonly options: Required<MatchingEngineOptions>;

  constructor(options: MatchingEngineOptions = {}) {
    this.options = {
      maxDateDistanceDays: options.maxDateDistanceDays ?? DEFAULTS.maxDateDistanceDays,
      partialMaxDateDistanceDays: options.partialMaxDateDistanceDays ?? DEFAULTS.partialMaxDateDistanceDays
    };
  }

  run(input: {
    invoices: MatchableInvoice[];
    payments: MatchablePayment[];
    bank_transactions: MatchableBankTransaction[];
  }): MatchingRunResult {
    const invoiceRecords = input.invoices.map((item) => this.createWorkingRecord(item, item.invoice_date, 'invoice'));
    const paymentRecords = input.payments.map((item) => this.createWorkingRecord(item, item.payment_date, 'payment'));
    const bankTransactionRecords = input.bank_transactions
      .filter((item) => item.direction === 'credit')
      .map((item) => this.createWorkingRecord(item, item.transaction_date, 'bank_transaction'));

    const invoicePayment = this.match(invoiceRecords, paymentRecords);
    const paymentBank = this.match(paymentRecords, bankTransactionRecords);

    return {
      invoice_payment_matches: invoicePayment.matches,
      payment_bank_transaction_matches: paymentBank.matches,
      exceptions: [...invoicePayment.exceptions, ...paymentBank.exceptions]
    };
  }

  private match(fromInput: WorkingRecord[], toInput: WorkingRecord[]): { matches: MatchedPair[]; exceptions: MatchException[] } {
    const fromRecords = this.cloneAndSort(fromInput);
    const toRecords = this.cloneAndSort(toInput);
    const matches: MatchedPair[] = [];
    const exceptions: MatchException[] = [];

    for (const from of fromRecords) {
      let hasMatchedCurrentFrom = false;
      while (from.remaining_minor > 0) {
        const candidates = toRecords
          .filter((to) => this.canConsiderPair(from, to))
          .map((to) => this.scorePair(from, to, hasMatchedCurrentFrom))
          .filter((item) => item !== null)
          .sort((a, b) => {
            if (b.score !== a.score) {
              return b.score - a.score;
            }
            if (a.dateDistanceDays !== b.dateDistanceDays) {
              return a.dateDistanceDays - b.dateDistanceDays;
            }
            if (b.allocatableAmount !== a.allocatableAmount) {
              return b.allocatableAmount - a.allocatableAmount;
            }
            return a.to.id.localeCompare(b.to.id);
          });

        if (candidates.length === 0) {
          break;
        }

        const best = candidates[0];
        const second = candidates[1];
        if (
          second &&
          second.score === best.score &&
          second.dateDistanceDays === best.dateDistanceDays &&
          second.allocatableAmount === best.allocatableAmount
        ) {
          exceptions.push({
            entity: from.entity,
            entity_id: from.id,
            reason: 'ambiguous'
          });
          break;
        }

        if (best.allocatableAmount <= 0) {
          break;
        }

        from.remaining_minor -= best.allocatableAmount;
        best.to.remaining_minor -= best.allocatableAmount;

        hasMatchedCurrentFrom = true;

        matches.push({
          from_id: from.id,
          to_id: best.to.id,
          matched_amount_minor: best.allocatableAmount,
          date_distance_days: best.dateDistanceDays,
          reference_match: best.referenceMatch,
          rule: best.rule
        });
      }

      if (from.remaining_minor > 0 && !exceptions.some((item) => item.entity_id === from.id && item.entity === from.entity)) {
        exceptions.push({
          entity: from.entity,
          entity_id: from.id,
          reason: 'unmatched'
        });
      }
    }

    for (const to of toRecords) {
      if (to.remaining_minor > 0) {
        exceptions.push({
          entity: to.entity,
          entity_id: to.id,
          reason: 'unmatched'
        });
      }
    }

    return { matches, exceptions };
  }

  private canConsiderPair(from: WorkingRecord, to: WorkingRecord): boolean {
    return (
      from.tenant_id === to.tenant_id &&
      from.currency_code === to.currency_code &&
      from.remaining_minor > 0 &&
      to.remaining_minor > 0
    );
  }

  private scorePair(from: WorkingRecord, to: WorkingRecord, allowPartial: boolean): {
    to: WorkingRecord;
    score: number;
    dateDistanceDays: number;
    allocatableAmount: number;
    referenceMatch: boolean;
    rule: MatchedPair['rule'];
  } | null {
    const dateDistanceDays = this.diffInDays(from.date, to.date);
    const allocatableAmount = Math.min(from.remaining_minor, to.remaining_minor);
    const referenceMatch = this.sameReference(from.reference_id, to.reference_id);
    const exactAmount = from.remaining_minor === to.remaining_minor;

    if (allocatableAmount <= 0) {
      return null;
    }

    if (referenceMatch) {
      const proximityBonus = Math.max(0, this.options.maxDateDistanceDays - Math.min(dateDistanceDays, this.options.maxDateDistanceDays));
      return {
        to,
        score: 1000 + proximityBonus,
        dateDistanceDays,
        allocatableAmount,
        referenceMatch,
        rule: 'reference_id'
      };
    }

    if (dateDistanceDays > this.options.maxDateDistanceDays) {
      return null;
    }

    if (exactAmount) {
      return {
        to,
        score: 500 + (this.options.maxDateDistanceDays - dateDistanceDays),
        dateDistanceDays,
        allocatableAmount,
        referenceMatch,
        rule: 'amount_date'
      };
    }

    const canUsePartial = allowPartial || from.remaining_minor > to.remaining_minor;
    if (canUsePartial && dateDistanceDays <= this.options.partialMaxDateDistanceDays) {
      return {
        to,
        score: 100 + (this.options.partialMaxDateDistanceDays - dateDistanceDays),
        dateDistanceDays,
        allocatableAmount,
        referenceMatch,
        rule: 'amount_date_partial'
      };
    }

    return null;
  }

  private sameReference(left?: string | null, right?: string | null): boolean {
    if (!left || !right) {
      return false;
    }

    return left.trim().toLowerCase() === right.trim().toLowerCase();
  }

  private diffInDays(left: string, right: string): number {
    const leftTime = Date.parse(left);
    const rightTime = Date.parse(right);

    if (!Number.isFinite(leftTime) || !Number.isFinite(rightTime)) {
      return Number.MAX_SAFE_INTEGER;
    }

    const dayMs = 24 * 60 * 60 * 1000;
    return Math.abs(Math.round((leftTime - rightTime) / dayMs));
  }

  private createWorkingRecord(item: Omit<BaseRecord, 'date'>, date: string, entity: WorkingRecord['entity']): WorkingRecord {
    return {
      ...item,
      date,
      entity,
      remaining_minor: item.amount_minor
    };
  }

  private cloneAndSort(records: WorkingRecord[]): WorkingRecord[] {
    return records
      .map((record) => ({ ...record }))
      .sort((a, b) => {
        if (a.date !== b.date) {
          return a.date.localeCompare(b.date);
        }

        return a.id.localeCompare(b.id);
      });
  }
}
