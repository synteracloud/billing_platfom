import { Injectable } from '@nestjs/common';
import { randomUUID } from 'crypto';
import { PaymentAllocationEntity } from './entities/payment-allocation.entity';
import { PaymentEntity } from './entities/payment.entity';

@Injectable()
export class PaymentsRepository {
  private readonly payments = new Map<string, PaymentEntity>();
  private readonly allocations = new Map<string, PaymentAllocationEntity>();

  listByTenant(tenantId: string): PaymentEntity[] {
    return [...this.payments.values()]
      .filter((payment) => payment.tenant_id === tenantId)
      .sort((a, b) => b.created_at.localeCompare(a.created_at));
  }

  findById(tenantId: string, paymentId: string): PaymentEntity | undefined {
    const payment = this.payments.get(paymentId);
    if (!payment || payment.tenant_id !== tenantId) {
      return undefined;
    }

    return payment;
  }

  create(payment: Omit<PaymentEntity, 'id' | 'created_at' | 'updated_at'>): PaymentEntity {
    const now = new Date().toISOString();
    const created: PaymentEntity = {
      ...payment,
      id: randomUUID(),
      created_at: now,
      updated_at: now
    };

    this.payments.set(created.id, created);
    return created;
  }

  update(
    tenantId: string,
    paymentId: string,
    patch: Partial<Omit<PaymentEntity, 'id' | 'tenant_id' | 'created_at'>>
  ): PaymentEntity | undefined {
    const existing = this.findById(tenantId, paymentId);
    if (!existing) {
      return undefined;
    }

    const updated: PaymentEntity = {
      ...existing,
      ...patch,
      updated_at: new Date().toISOString()
    };

    this.payments.set(paymentId, updated);
    return updated;
  }

  createAllocation(allocation: Omit<PaymentAllocationEntity, 'id' | 'created_at'>): PaymentAllocationEntity {
    const created: PaymentAllocationEntity = {
      ...allocation,
      id: randomUUID(),
      created_at: new Date().toISOString()
    };

    this.allocations.set(created.id, created);
    return created;
  }

  listAllocationsByPayment(tenantId: string, paymentId: string): PaymentAllocationEntity[] {
    return [...this.allocations.values()]
      .filter((allocation) => allocation.tenant_id === tenantId && allocation.payment_id === paymentId)
      .sort((a, b) => a.created_at.localeCompare(b.created_at));
  }

  listAllocationsByInvoice(tenantId: string, invoiceId: string): PaymentAllocationEntity[] {
    return [...this.allocations.values()]
      .filter((allocation) => allocation.tenant_id === tenantId && allocation.invoice_id === invoiceId)
      .sort((a, b) => a.created_at.localeCompare(b.created_at));
  }

  sumAllocatedForPayment(tenantId: string, paymentId: string): number {
    return this.listAllocationsByPayment(tenantId, paymentId).reduce((sum, item) => sum + item.allocated_amount_minor, 0);
  }

  sumAllocatedForInvoice(tenantId: string, invoiceId: string): number {
    return this.listAllocationsByInvoice(tenantId, invoiceId).reduce((sum, item) => sum + item.allocated_amount_minor, 0);
  }

  deleteAllocationsByPayment(tenantId: string, paymentId: string): PaymentAllocationEntity[] {
    const existing = this.listAllocationsByPayment(tenantId, paymentId);
    for (const allocation of existing) {
      this.allocations.delete(allocation.id);
    }

    return existing;
  }
}
