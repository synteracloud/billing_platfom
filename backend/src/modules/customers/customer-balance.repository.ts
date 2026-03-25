import { Injectable } from '@nestjs/common';

interface BalanceMutationResult {
  balance_minor: number;
  applied: boolean;
}

interface EventDelta {
  tenant_id: string;
  customer_id: string;
  event_key: string;
  delta_minor: number;
}

@Injectable()
export class CustomerBalanceRepository {
  private readonly eventDeltas = new Map<string, EventDelta>();

  applyEventDelta(
    tenantId: string,
    customerId: string,
    consumerEventKey: string,
    deltaMinor: number
  ): BalanceMutationResult {
    const processedKey = this.processedEventKey(tenantId, customerId, consumerEventKey);
    if (this.eventDeltas.has(processedKey)) {
      return {
        balance_minor: this.getBalance(tenantId, customerId),
        applied: false
      };
    }

    this.eventDeltas.set(processedKey, {
      tenant_id: tenantId,
      customer_id: customerId,
      event_key: consumerEventKey,
      delta_minor: deltaMinor
    });

    return {
      balance_minor: this.getBalance(tenantId, customerId),
      applied: true
    };
  }

  getBalance(tenantId: string, customerId: string): number {
    let balance = 0;
    for (const eventDelta of this.eventDeltas.values()) {
      if (eventDelta.tenant_id !== tenantId || eventDelta.customer_id !== customerId) {
        continue;
      }

      balance += eventDelta.delta_minor;
    }

    return balance;
  }

  private processedEventKey(tenantId: string, customerId: string, consumerEventKey: string): string {
    return `${tenantId}:${customerId}:${consumerEventKey}`;
  }
}
