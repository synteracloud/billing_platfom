export interface BankTransaction {
  id: string;
  tenant_id: string;
  dedupe_key: string;
  external_id: string;
  account_id: string;
  posted_date: string;
  amount_minor: number;
  currency: string;
  direction: 'credit' | 'debit';
  description: string;
  counterparty_name: string | null;
  reference: string | null;
  metadata: Record<string, unknown>;
  raw_payload: Record<string, unknown>;
  created_at: string;
  updated_at: string;
}

export interface InboundBankTransaction {
  external_id?: string | null;
  transaction_id?: string | null;
  account_id?: string | null;
  posted_at?: string | null;
  booked_at?: string | null;
  amount?: number | string | null;
  amount_minor?: number | null;
  currency?: string | null;
  description?: string | null;
  counterparty_name?: string | null;
  reference?: string | null;
  metadata?: Record<string, unknown> | null;
  [key: string]: unknown;
}

export interface AutoMatchCandidate {
  id: string;
  amount_minor: number;
  posted_date: string;
  reference?: string | null;
}

export type AutoMatchRule = 'exact_amount_match' | 'date_within_threshold' | 'reference_match';

export interface AutoMatchRulesConfig {
  exact_amount_match: boolean;
  date_within_threshold: {
    enabled: boolean;
    threshold_days: number;
  };
  reference_match: {
    enabled: boolean;
    require_when_transaction_has_reference: boolean;
  };
  minimum_rules_to_match: number;
  priority: AutoMatchRule[];
}

export interface AutoMatchEvaluation {
  candidate_id: string;
  exact_amount_match: boolean;
  date_within_threshold: boolean;
  reference_match: boolean;
  matched_rules: AutoMatchRule[];
}

export interface AutoMatchResult {
  matched_candidate_id: string | null;
  status: 'matched' | 'unmatched' | 'ambiguous';
  rule_used: AutoMatchRule | null;
  evaluations: AutoMatchEvaluation[];
  config: AutoMatchRulesConfig;
}
