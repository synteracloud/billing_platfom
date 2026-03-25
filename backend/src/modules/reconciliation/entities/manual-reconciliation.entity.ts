export type ReconciliationClassification = 'match' | 'partial_match' | 'mismatch';

export interface ReconciliationCandidate {
  candidate_id: string;
  source_ref: string;
  amount_minor: number;
}

export interface ReconciliationResult {
  id: string;
  tenant_id: string;
  reconciliation_run_id: string;
  source_record_id: string;
  classification: ReconciliationClassification;
  system_suggested_candidate_id: string | null;
  selected_candidate_id: string | null;
  status: 'suggested' | 'manually_matched';
  override_reason: string | null;
  overridden_by: string | null;
  overridden_at: string | null;
  candidates: ReconciliationCandidate[];
  created_at: string;
  updated_at: string;
}

export interface CreateReconciliationResultInput {
  tenant_id: string;
  reconciliation_run_id: string;
  source_record_id: string;
  classification: ReconciliationClassification;
  system_suggested_candidate_id: string | null;
  candidates: ReconciliationCandidate[];
}

export interface ManualOverrideInput {
  tenant_id: string;
  reconciliation_result_id: string;
  selected_candidate_id: string;
  user_id: string;
  reason: string;
  correlation_id?: string;
}
