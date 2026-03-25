import { Injectable } from '@nestjs/common';
import { BankTransaction } from './entities/bank-transaction.entity';

@Injectable()
export class BankTransactionsRepository {
  private readonly byTenant = new Map<string, Map<string, BankTransaction>>();

  upsert(transaction: BankTransaction): { transaction: BankTransaction; inserted: boolean } {
    const tenantStore = this.byTenant.get(transaction.tenant_id) ?? new Map<string, BankTransaction>();
    const existing = tenantStore.get(transaction.dedupe_key);

    if (existing) {
      return { transaction: existing, inserted: false };
    }

    tenantStore.set(transaction.dedupe_key, transaction);
    this.byTenant.set(transaction.tenant_id, tenantStore);
    return { transaction, inserted: true };
  }

  listByTenant(tenantId: string): BankTransaction[] {
    return [...(this.byTenant.get(tenantId)?.values() ?? [])].sort((a, b) => a.created_at.localeCompare(b.created_at));
  }
}
