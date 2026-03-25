import { Injectable } from '@nestjs/common';
import { createHash, randomUUID } from 'crypto';
import { BankTransactionsRepository } from './bank-transactions.repository';
import {
  AutoMatchCandidate,
  AutoMatchResult,
  AutoMatchRule,
  AutoMatchRulesConfig,
  BankTransaction,
  InboundBankTransaction
} from './entities/bank-transaction.entity';

export interface IngestBankTransactionsResult {
  ingested: BankTransaction[];
  duplicates: BankTransaction[];
}

@Injectable()
export class BankConnectorService {
  private static readonly DEFAULT_AUTO_MATCH_CONFIG: AutoMatchRulesConfig = {
    exact_amount_match: true,
    date_within_threshold: {
      enabled: true,
      threshold_days: 2
    },
    reference_match: {
      enabled: true,
      require_when_transaction_has_reference: true
    },
    minimum_rules_to_match: 2,
    priority: ['reference_match', 'exact_amount_match', 'date_within_threshold']
  };

  constructor(private readonly bankTransactionsRepository: BankTransactionsRepository) {}

  ingestTransactions(tenantId: string, inboundTransactions: InboundBankTransaction[]): IngestBankTransactionsResult {
    const ingested: BankTransaction[] = [];
    const duplicates: BankTransaction[] = [];

    for (const inbound of inboundTransactions) {
      const mapped = this.mapToBankTransaction(tenantId, inbound);
      const { transaction, inserted } = this.bankTransactionsRepository.upsert(mapped);

      if (inserted) {
        ingested.push(transaction);
      } else {
        duplicates.push(transaction);
      }
    }

    return { ingested, duplicates };
  }

  mapToBankTransaction(tenantId: string, inbound: InboundBankTransaction): BankTransaction {
    const externalId = this.normalizeText(inbound.external_id ?? inbound.transaction_id, true) ?? this.generateFallbackExternalId(inbound);
    const accountId = this.normalizeText(inbound.account_id, true) ?? 'unassigned';
    const postedDate = this.normalizeDate(inbound.posted_at ?? inbound.booked_at);
    const currency = this.normalizeCurrency(inbound.currency);
    const amountMinor = this.normalizeAmountMinor(inbound.amount_minor, inbound.amount);
    const direction: 'credit' | 'debit' = amountMinor >= 0 ? 'credit' : 'debit';
    const description = this.normalizeText(inbound.description, false) ?? '';
    const counterpartyName = this.normalizeText(inbound.counterparty_name, false);
    const reference = this.normalizeText(inbound.reference, true);

    const dedupeKey = this.computeDedupeKey({
      tenantId,
      externalId,
      accountId,
      postedDate,
      amountMinor,
      currency,
      reference
    });

    const now = new Date().toISOString();

    return {
      id: randomUUID(),
      tenant_id: tenantId,
      dedupe_key: dedupeKey,
      external_id: externalId,
      account_id: accountId,
      posted_date: postedDate,
      amount_minor: amountMinor,
      currency,
      direction,
      description,
      counterparty_name: counterpartyName,
      reference,
      metadata: inbound.metadata ?? {},
      raw_payload: this.cloneInbound(inbound),
      created_at: now,
      updated_at: now
    };
  }

  autoMatchTransaction(
    tenantId: string,
    transaction: Pick<BankTransaction, 'amount_minor' | 'posted_date' | 'reference'>,
    candidates: AutoMatchCandidate[],
    tenantRules: Record<string, Partial<AutoMatchRulesConfig>> = {}
  ): AutoMatchResult {
    const config = this.resolveAutoMatchConfig(tenantId, tenantRules);
    const transactionReference = this.normalizeText(transaction.reference, true);

    const evaluations = candidates.map((candidate) => {
      const exactAmount = candidate.amount_minor === transaction.amount_minor;
      const dateWithinThreshold = this.calculateDateDistanceDays(transaction.posted_date, candidate.posted_date) <= config.date_within_threshold.threshold_days;
      const referenceMatch = this.normalizeText(candidate.reference, true) === transactionReference;
      const matchedRules: AutoMatchRule[] = [];

      if (exactAmount) {
        matchedRules.push('exact_amount_match');
      }

      if (dateWithinThreshold) {
        matchedRules.push('date_within_threshold');
      }

      if (referenceMatch) {
        matchedRules.push('reference_match');
      }

      return {
        candidate_id: candidate.id,
        exact_amount_match: exactAmount,
        date_within_threshold: dateWithinThreshold,
        reference_match: referenceMatch,
        matched_rules: matchedRules
      };
    });

    const eligible = evaluations.filter((evaluation) => {
      if (config.exact_amount_match && !evaluation.exact_amount_match) {
        return false;
      }

      if (
        config.reference_match.enabled &&
        config.reference_match.require_when_transaction_has_reference &&
        transactionReference &&
        !evaluation.reference_match
      ) {
        return false;
      }

      const countedRules = this.countMatchedEnabledRules(evaluation, config, Boolean(transactionReference));
      return countedRules >= Math.max(1, config.minimum_rules_to_match);
    });

    if (eligible.length === 0) {
      return {
        matched_candidate_id: null,
        status: 'unmatched',
        rule_used: null,
        evaluations,
        config
      };
    }

    if (eligible.length === 1) {
      return {
        matched_candidate_id: eligible[0].candidate_id,
        status: 'matched',
        rule_used: this.selectRuleUsed(eligible[0], config.priority),
        evaluations,
        config
      };
    }

    let narrowed = eligible;
    for (const rule of config.priority) {
      const subset = narrowed.filter((candidate) => this.matchesRule(candidate, rule, config, Boolean(transactionReference)));
      if (subset.length === 1) {
        return {
          matched_candidate_id: subset[0].candidate_id,
          status: 'matched',
          rule_used: rule,
          evaluations,
          config
        };
      }

      if (subset.length > 1 && subset.length < narrowed.length) {
        narrowed = subset;
      }
    }

    return {
      matched_candidate_id: null,
      status: 'ambiguous',
      rule_used: null,
      evaluations,
      config
    };
  }

  private normalizeText(value: unknown, uppercase: boolean): string | null {
    if (typeof value !== 'string') {
      return null;
    }

    const squashed = value.replace(/\s+/g, ' ').trim();
    if (!squashed) {
      return null;
    }

    return uppercase ? squashed.toUpperCase() : squashed;
  }

  private normalizeCurrency(value: unknown): string {
    const normalized = this.normalizeText(value, true);
    return normalized ?? 'USD';
  }

  private normalizeDate(value: unknown): string {
    if (typeof value !== 'string' || value.trim().length === 0) {
      return new Date(0).toISOString().slice(0, 10);
    }

    const parsed = new Date(value);
    if (Number.isNaN(parsed.getTime())) {
      return new Date(0).toISOString().slice(0, 10);
    }

    return parsed.toISOString().slice(0, 10);
  }

  private normalizeAmountMinor(explicitMinor: unknown, amount: unknown): number {
    if (typeof explicitMinor === 'number' && Number.isFinite(explicitMinor)) {
      return Math.round(explicitMinor);
    }

    if (typeof amount === 'number' && Number.isFinite(amount)) {
      return Math.round(amount * 100);
    }

    if (typeof amount === 'string') {
      const parsed = Number.parseFloat(amount);
      if (Number.isFinite(parsed)) {
        return Math.round(parsed * 100);
      }
    }

    return 0;
  }

  private generateFallbackExternalId(inbound: InboundBankTransaction): string {
    const payloadHash = createHash('sha256')
      .update(JSON.stringify(this.cloneInbound(inbound)))
      .digest('hex')
      .slice(0, 24);

    return `FALLBACK-${payloadHash}`;
  }

  private computeDedupeKey(input: {
    tenantId: string;
    externalId: string;
    accountId: string;
    postedDate: string;
    amountMinor: number;
    currency: string;
    reference: string | null;
  }): string {
    const basis = [
      input.tenantId,
      input.externalId,
      input.accountId,
      input.postedDate,
      String(input.amountMinor),
      input.currency,
      input.reference ?? ''
    ].join('|');

    return createHash('sha256').update(basis).digest('hex');
  }

  private cloneInbound(inbound: InboundBankTransaction): Record<string, unknown> {
    return JSON.parse(JSON.stringify(inbound)) as Record<string, unknown>;
  }

  private resolveAutoMatchConfig(tenantId: string, tenantRules: Record<string, Partial<AutoMatchRulesConfig>>): AutoMatchRulesConfig {
    const tenantConfig = tenantRules[tenantId];
    const base = BankConnectorService.DEFAULT_AUTO_MATCH_CONFIG;

    return {
      exact_amount_match: tenantConfig?.exact_amount_match ?? base.exact_amount_match,
      date_within_threshold: {
        enabled: tenantConfig?.date_within_threshold?.enabled ?? base.date_within_threshold.enabled,
        threshold_days: Math.max(
          0,
          Math.round(tenantConfig?.date_within_threshold?.threshold_days ?? base.date_within_threshold.threshold_days)
        )
      },
      reference_match: {
        enabled: tenantConfig?.reference_match?.enabled ?? base.reference_match.enabled,
        require_when_transaction_has_reference:
          tenantConfig?.reference_match?.require_when_transaction_has_reference ??
          base.reference_match.require_when_transaction_has_reference
      },
      minimum_rules_to_match: Math.max(1, Math.round(tenantConfig?.minimum_rules_to_match ?? base.minimum_rules_to_match)),
      priority: this.normalizePriority(tenantConfig?.priority ?? base.priority)
    };
  }

  private normalizePriority(priority: AutoMatchRule[]): AutoMatchRule[] {
    const defaults = BankConnectorService.DEFAULT_AUTO_MATCH_CONFIG.priority;
    const result = [...priority.filter((rule, index) => priority.indexOf(rule) === index)];

    for (const fallbackRule of defaults) {
      if (!result.includes(fallbackRule)) {
        result.push(fallbackRule);
      }
    }

    return result;
  }

  private calculateDateDistanceDays(baseDate: string, candidateDate: string): number {
    const base = Date.parse(baseDate);
    const candidate = Date.parse(candidateDate);

    if (Number.isNaN(base) || Number.isNaN(candidate)) {
      return Number.POSITIVE_INFINITY;
    }

    const millisPerDay = 24 * 60 * 60 * 1000;
    return Math.abs(base - candidate) / millisPerDay;
  }

  private countMatchedEnabledRules(
    evaluation: { exact_amount_match: boolean; date_within_threshold: boolean; reference_match: boolean },
    config: AutoMatchRulesConfig,
    hasTransactionReference: boolean
  ): number {
    let count = 0;

    if (config.exact_amount_match && evaluation.exact_amount_match) {
      count += 1;
    }

    if (config.date_within_threshold.enabled && evaluation.date_within_threshold) {
      count += 1;
    }

    if (config.reference_match.enabled && hasTransactionReference && evaluation.reference_match) {
      count += 1;
    }

    return count;
  }

  private matchesRule(
    evaluation: { exact_amount_match: boolean; date_within_threshold: boolean; reference_match: boolean },
    rule: AutoMatchRule,
    config: AutoMatchRulesConfig,
    hasTransactionReference: boolean
  ): boolean {
    if (rule === 'exact_amount_match') {
      return config.exact_amount_match && evaluation.exact_amount_match;
    }

    if (rule === 'date_within_threshold') {
      return config.date_within_threshold.enabled && evaluation.date_within_threshold;
    }

    return config.reference_match.enabled && hasTransactionReference && evaluation.reference_match;
  }

  private selectRuleUsed(
    evaluation: { exact_amount_match: boolean; date_within_threshold: boolean; reference_match: boolean },
    priority: AutoMatchRule[]
  ): AutoMatchRule | null {
    for (const rule of priority) {
      if (rule === 'exact_amount_match' && evaluation.exact_amount_match) {
        return rule;
      }

      if (rule === 'date_within_threshold' && evaluation.date_within_threshold) {
        return rule;
      }

      if (rule === 'reference_match' && evaluation.reference_match) {
        return rule;
      }
    }

    return null;
  }
}
