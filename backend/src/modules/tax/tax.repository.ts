import { randomUUID } from 'crypto';
import { TaxRateEntity } from './tax.types';

export class TaxRepository {
  private readonly rates = new Map<string, TaxRateEntity>();

  upsertRate(input: Omit<TaxRateEntity, 'id' | 'created_at' | 'updated_at'> & { id?: string }): TaxRateEntity {
    const now = new Date().toISOString();
    const id = input.id ?? randomUUID();
    const next: TaxRateEntity = {
      ...input,
      id,
      created_at: this.rates.get(id)?.created_at ?? now,
      updated_at: now
    };
    this.rates.set(id, next);
    return { ...next };
  }

  listRates(tenantId: string): TaxRateEntity[] {
    return Array.from(this.rates.values())
      .filter((rate) => rate.tenant_id === tenantId)
      .map((rate) => ({ ...rate }))
      .sort((a, b) => a.tax_code.localeCompare(b.tax_code) || b.effective_from.localeCompare(a.effective_from));
  }
}
