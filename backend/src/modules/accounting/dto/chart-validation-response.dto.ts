import { TenantAccount } from '../entities/chart-of-account.entity';

export interface ChartOfAccountsResponseDto {
  tenant_id: string;
  accounts: TenantAccount[];
  validation: {
    valid: boolean;
    duplicateKeys: string[];
    duplicateCodes: string[];
    missingAccounts: string[];
    misclassifiedAccounts: Array<{
      key: string;
      expected: string[];
      actual: string;
    }>;
    uncoveredFlows: string[];
  };
}
