import { Injectable } from '@nestjs/common';

interface BalanceMutationResult {
  balance_minor: number;
  applied: boolean;
}

@Injectable()
export class CustomerBalanceRepository {
  private readonly balances = new Map<string, number>();
  private readonly processedEvents = new Set<string>();

  applyEventDelta(
    tenantId: string,
    customerId: string,
    consumerEventKey: string,
    deltaMinor: number
  ): BalanceMutationResult {
    const processedKey = this.processedEventKey(tenantId, customerId, consumerEventKey);
    if (this.processedEvents.has(processedKey)) {
      return {
        balance_minor: this.getBalance(tenantId, customerId),
        applied: false
      };
    }

    const balanceKey = this.balanceKey(tenantId, customerId);
    const currentBalance = this.balances.get(balanceKey) ?? 0;
    const nextBalance = currentBalance + deltaMinor;

    this.balances.set(balanceKey, nextBalance);
    this.processedEvents.add(processedKey);

    return {
      balance_minor: nextBalance,
      applied: true
    };
  }

  getBalance(tenantId: string, customerId: string): number {
    return this.balances.get(this.balanceKey(tenantId, customerId)) ?? 0;
  }

  private balanceKey(tenantId: string, customerId: string): string {
    return `${tenantId}:${customerId}`;
  }

  private processedEventKey(tenantId: string, customerId: string, consumerEventKey: string): string {
    return `${tenantId}:${customerId}:${consumerEventKey}`;
  }
}
