export type AccountType = 'asset' | 'liability' | 'revenue' | 'expense' | 'contra_revenue';

export interface AccountDefinition {
  key: string;
  code: string;
  name: string;
  type: AccountType;
  description: string;
  system: boolean;
}

export interface TenantAccount extends AccountDefinition {
  id: string;
  tenant_id: string;
  created_at: string;
  updated_at: string;
}

export interface PostingRuleExpectation {
  eventType: string;
  requiredAccounts: Array<{
    key: string;
    allowedTypes: AccountType[];
    rationale: string;
  }>;
}

export interface ChartValidationResult {
  valid: boolean;
  duplicateKeys: string[];
  duplicateCodes: string[];
  missingAccounts: string[];
  misclassifiedAccounts: Array<{
    key: string;
    expected: AccountType[];
    actual: AccountType;
  }>;
  uncoveredFlows: string[];
}
