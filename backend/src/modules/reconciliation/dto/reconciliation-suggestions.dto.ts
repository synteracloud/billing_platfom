export interface ReconciliationSuggestionTransactionDto {
  id: string;
  tenant_id: string;
  currency_code: string;
  amount_minor: number;
  occurred_at: string;
  reference_id?: string | null;
  counterparty_name?: string | null;
}

export interface ReconciliationSuggestionCandidateDto {
  id: string;
  tenant_id: string;
  currency_code: string;
  amount_minor: number;
  occurred_at: string;
  reference_id?: string | null;
  counterparty_name?: string | null;
}

export interface CreateReconciliationSuggestionsDto {
  unmatched_transactions: ReconciliationSuggestionTransactionDto[];
  matching_candidates: ReconciliationSuggestionCandidateDto[];
}
