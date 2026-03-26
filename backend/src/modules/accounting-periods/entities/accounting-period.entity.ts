export type AccountingPeriodStatus = 'open' | 'closed';

export interface AccountingPeriodEntity {
  id: string;
  tenant_id: string;
  period_key: string;
  status: AccountingPeriodStatus;
  closed_at: string | null;
  closed_by: string | null;
  reopened_at: string | null;
  reopened_by: string | null;
  created_at: string;
  updated_at: string;
}
