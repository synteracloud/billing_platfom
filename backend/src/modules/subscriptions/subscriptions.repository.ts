import { Injectable } from '@nestjs/common';
import { randomUUID } from 'crypto';
import { SubscriptionEntity } from './entities/subscription.entity';

@Injectable()
export class SubscriptionsRepository {
  private readonly subscriptions = new Map<string, SubscriptionEntity>();

  listByTenant(tenantId: string): SubscriptionEntity[] {
    return [...this.subscriptions.values()]
      .filter((subscription) => subscription.tenant_id === tenantId)
      .sort((a, b) => b.created_at.localeCompare(a.created_at));
  }

  findById(tenantId: string, id: string): SubscriptionEntity | undefined {
    const subscription = this.subscriptions.get(id);
    if (!subscription || subscription.tenant_id !== tenantId) {
      return undefined;
    }

    return subscription;
  }

  create(
    payload: Omit<SubscriptionEntity, 'id' | 'created_at' | 'updated_at'>
  ): SubscriptionEntity {
    const now = new Date().toISOString();
    const created: SubscriptionEntity = {
      ...payload,
      id: randomUUID(),
      created_at: now,
      updated_at: now
    };

    this.subscriptions.set(created.id, created);
    return created;
  }

  update(
    tenantId: string,
    id: string,
    patch: Partial<Omit<SubscriptionEntity, 'id' | 'tenant_id' | 'created_at'>>
  ): SubscriptionEntity | undefined {
    const existing = this.findById(tenantId, id);
    if (!existing) {
      return undefined;
    }

    const updated: SubscriptionEntity = {
      ...existing,
      ...patch,
      updated_at: new Date().toISOString()
    };

    this.subscriptions.set(id, updated);
    return updated;
  }

  listDue(asOf: Date): SubscriptionEntity[] {
    const asOfMs = asOf.getTime();

    return [...this.subscriptions.values()]
      .filter((subscription) => subscription.status === 'active')
      .filter((subscription) => subscription.next_billing_date !== null)
      .filter((subscription) => new Date(subscription.next_billing_date).getTime() <= asOfMs)
      .filter((subscription) => new Date(subscription.start_date).getTime() <= asOfMs)
      .filter((subscription) => {
        if (!subscription.end_date) {
          return true;
        }

        return new Date(subscription.end_date).getTime() >= asOfMs;
      })
      .sort((a, b) => a.next_billing_date.localeCompare(b.next_billing_date));
  }
}
