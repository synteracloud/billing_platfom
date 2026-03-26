import { Injectable } from '@nestjs/common';

export type AccountingPeriodStatus = 'open' | 'closed' | 'reopened';

export interface AccountingPeriodEntity {
  id: string;
  tenant_id: string;
  period_start: string;
  period_end: string;
  status: AccountingPeriodStatus;
  lock_version: number;
  closed_at: string | null;
  closed_by: string | null;
  reopened_at: string | null;
  reopened_by: string | null;
  reopen_reason: string | null;
}

@Injectable()
export class AccountingPeriodRepository {
  private readonly periods = new Map<string, AccountingPeriodEntity>();

  findByPeriod(tenantId: string, periodStart: string): AccountingPeriodEntity | undefined {
    return this.copy(this.periods.get(this.toKey(tenantId, periodStart)));
  }

  findByDate(tenantId: string, entryDate: string): AccountingPeriodEntity | undefined {
    const periodStart = `${entryDate.slice(0, 7)}-01`;
    return this.findByPeriod(tenantId, periodStart);
  }

  save(period: AccountingPeriodEntity): AccountingPeriodEntity {
    this.periods.set(this.toKey(period.tenant_id, period.period_start), this.freeze({ ...period }));
    return this.findByPeriod(period.tenant_id, period.period_start)!;
  }

  createSnapshot(): { periods: Map<string, AccountingPeriodEntity> } {
    return {
      periods: new Map([...this.periods.entries()].map(([key, value]) => [key, this.freeze({ ...value })]))
    };
  }

  restoreSnapshot(snapshot: { periods: Map<string, AccountingPeriodEntity> }): void {
    this.periods.clear();
    for (const [key, value] of snapshot.periods.entries()) {
      this.periods.set(key, this.freeze({ ...value }));
    }
  }

  private toKey(tenantId: string, periodStart: string): string {
    return `${tenantId}::${periodStart}`;
  }

  private copy(value?: AccountingPeriodEntity): AccountingPeriodEntity | undefined {
    return value ? this.freeze({ ...value }) : undefined;
  }

  private freeze<T>(value: T): T {
    if (value && typeof value === 'object' && !Object.isFrozen(value)) {
      Object.freeze(value);
    }
    return value;
  }
}
