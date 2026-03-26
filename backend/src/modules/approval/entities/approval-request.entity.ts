export type SensitiveActionType =
  | 'manual_journal_entry'
  | 'reconciliation_override'
  | 'period_reopen'
  | 'large_bill_exception'
  | 'large_payment_exception';

export type ApprovalStatus = 'pending' | 'approved' | 'rejected' | 'consumed';

export interface ApprovalThreshold {
  requires_approval_over_minor: number;
}

export interface ApprovalStep {
  id: string;
  status: 'requested' | 'approved' | 'rejected' | 'consumed';
  actor_id: string;
  actor_type: 'system' | 'user';
  at: string;
  note: string | null;
}

export interface ApprovalRequestEntity {
  id: string;
  tenant_id: string;
  action_type: SensitiveActionType;
  amount_minor: number | null;
  status: ApprovalStatus;
  requested_by: string;
  approved_by: string | null;
  rejected_by: string | null;
  rejected_reason: string | null;
  consumed_by: string | null;
  correlation_id: string | null;
  context: Record<string, unknown>;
  created_at: string;
  updated_at: string;
  steps: ApprovalStep[];
}
