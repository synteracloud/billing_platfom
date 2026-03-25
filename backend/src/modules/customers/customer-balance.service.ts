import { Injectable } from '@nestjs/common';
import { CustomerBalanceRepository } from './customer-balance.repository';

@Injectable()
export class CustomerBalanceService {
  constructor(private readonly customerBalanceRepository: CustomerBalanceRepository) {}

  applyInvoiceCreated(tenantId: string, customerId: string, eventId: string, totalMinor: number): number {
    return this.customerBalanceRepository.applyEventDelta(
      tenantId,
      customerId,
      `invoice.created:${eventId}`,
      totalMinor
    ).balance_minor;
  }

  applyPaymentReceived(tenantId: string, customerId: string, eventId: string, amountMinor: number): number {
    return this.customerBalanceRepository.applyEventDelta(
      tenantId,
      customerId,
      `payment.received:${eventId}`,
      -Math.abs(amountMinor)
    ).balance_minor;
  }

  getBalance(tenantId: string, customerId: string): number {
    return this.customerBalanceRepository.getBalance(tenantId, customerId);
  }
}
