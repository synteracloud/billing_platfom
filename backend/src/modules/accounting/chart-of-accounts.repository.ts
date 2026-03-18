import { Injectable } from '@nestjs/common';
import { randomUUID } from 'crypto';
import { AccountDefinition, TenantAccount } from './entities/chart-of-account.entity';

@Injectable()
export class ChartOfAccountsRepository {
  private readonly accountsByTenant = new Map<string, TenantAccount[]>();

  findByTenant(tenantId: string): TenantAccount[] {
    return [...(this.accountsByTenant.get(tenantId) ?? [])];
  }

  replaceForTenant(tenantId: string, definitions: AccountDefinition[]): TenantAccount[] {
    const now = new Date().toISOString();
    const nextAccounts = definitions.map((definition) => ({
      id: randomUUID(),
      tenant_id: tenantId,
      ...definition,
      created_at: now,
      updated_at: now
    }));

    this.accountsByTenant.set(tenantId, nextAccounts);
    return this.findByTenant(tenantId);
  }
}
