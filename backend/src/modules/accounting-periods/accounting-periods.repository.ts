import { ConflictException, Injectable, NotFoundException } from '@nestjs/common';
import { randomUUID } from 'crypto';
import { AccountingPeriodEntity } from './entities/accounting-period.entity';

@Injectable()
export class AccountingPeriodsRepository {
  private readonly periods = new Map<string, AccountingPeriodEntity>();

  closePeriod(tenantId: string, periodKey: string, actorUserId: string, actedAt: string): AccountingPeriodEntity {
    const existing = this.findByPeriodKey(tenantId, periodKey);
    if (existing && existing.status === 'closed') {
      throw new ConflictException(`period ${periodKey} is already closed`);
    }

    const base: AccountingPeriodEntity = existing ?? {
      id: randomUUID(),
      tenant_id: tenantId,
      period_key: periodKey,
      status: 'open',
      closed_at: null,
      closed_by: null,
      reopened_at: null,
      reopened_by: null,
      created_at: actedAt,
      updated_at: actedAt
    };

    const closed: AccountingPeriodEntity = {
      ...base,
      status: 'closed',
      closed_at: actedAt,
      closed_by: actorUserId,
      updated_at: actedAt
    };

    this.periods.set(this.key(tenantId, periodKey), Object.freeze({ ...closed }));
    return this.findByPeriodKeyOrThrow(tenantId, periodKey);
  }

  reopenPeriod(tenantId: string, periodKey: string, actorUserId: string, actedAt: string): AccountingPeriodEntity {
    const existing = this.findByPeriodKey(tenantId, periodKey);
    if (!existing) {
      throw new NotFoundException(`period ${periodKey} not found`);
    }

    if (existing.status !== 'closed') {
      throw new ConflictException(`period ${periodKey} is not closed`);
    }

    const reopened: AccountingPeriodEntity = {
      ...existing,
      status: 'open',
      reopened_at: actedAt,
      reopened_by: actorUserId,
      updated_at: actedAt
    };

    this.periods.set(this.key(tenantId, periodKey), Object.freeze({ ...reopened }));
    return this.findByPeriodKeyOrThrow(tenantId, periodKey);
  }

  findByPeriodKey(tenantId: string, periodKey: string): AccountingPeriodEntity | undefined {
    const period = this.periods.get(this.key(tenantId, periodKey));
    return period ? Object.freeze({ ...period }) : undefined;
  }

  private findByPeriodKeyOrThrow(tenantId: string, periodKey: string): AccountingPeriodEntity {
    const period = this.findByPeriodKey(tenantId, periodKey);
    if (!period) {
      throw new NotFoundException(`period ${periodKey} not found`);
    }

    return period;
  }

  private key(tenantId: string, periodKey: string): string {
    return `${tenantId}::${periodKey}`;
  }
}
