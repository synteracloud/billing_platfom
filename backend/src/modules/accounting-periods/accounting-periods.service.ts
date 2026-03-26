import { BadRequestException, Injectable } from '@nestjs/common';
import { EventsService } from '../events/events.service';
import { AccountingPeriodsRepository } from './accounting-periods.repository';

@Injectable()
export class AccountingPeriodsService {
  constructor(
    private readonly accountingPeriodsRepository: AccountingPeriodsRepository,
    private readonly eventsService: EventsService
  ) {}

  closePeriod(tenantId: string, periodKey: string, actorUserId: string) {
    const normalizedPeriodKey = this.normalizePeriodKey(periodKey);
    const actedAt = new Date().toISOString();
    const closed = this.accountingPeriodsRepository.closePeriod(tenantId, normalizedPeriodKey, actorUserId, actedAt);

    this.eventsService.logEvent({
      tenant_id: tenantId,
      type: 'audit.accounting_period.closed.v1',
      aggregate_type: 'accounting_period',
      aggregate_id: closed.id,
      aggregate_version: 1,
      actor_type: 'user',
      actor_id: actorUserId,
      event_category: 'audit',
      payload: {
        period_key: normalizedPeriodKey,
        status: closed.status,
        closed_at: closed.closed_at
      }
    });

    return closed;
  }

  reopenBooks(tenantId: string, periodKey: string, actorUserId: string) {
    const normalizedPeriodKey = this.normalizePeriodKey(periodKey);
    const actedAt = new Date().toISOString();
    const reopened = this.accountingPeriodsRepository.reopenPeriod(tenantId, normalizedPeriodKey, actorUserId, actedAt);

    this.eventsService.logEvent({
      tenant_id: tenantId,
      type: 'audit.accounting_period.reopened.v1',
      aggregate_type: 'accounting_period',
      aggregate_id: reopened.id,
      aggregate_version: 1,
      actor_type: 'user',
      actor_id: actorUserId,
      event_category: 'audit',
      payload: {
        period_key: normalizedPeriodKey,
        status: reopened.status,
        reopened_at: reopened.reopened_at
      }
    });

    return reopened;
  }

  private normalizePeriodKey(periodKey: string): string {
    const normalized = periodKey?.trim();
    if (!/^\d{4}-\d{2}$/.test(normalized)) {
      throw new BadRequestException('period_key must be in YYYY-MM format');
    }

    return normalized;
  }
}
