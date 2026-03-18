import { ConflictException, Injectable } from '@nestjs/common';
import { randomUUID } from 'crypto';
import { PaymentAllocationEntity } from './entities/payment-allocation.entity';
import { PaymentEntity } from './entities/payment.entity';

@Injectable()
export class PaymentsRepository {
  private readonly payments = new Map<string, PaymentEntity>();
  private readonly allocations = new Map<string, PaymentAllocationEntity>();

  listAll(): PaymentEntity[] {
    return [...this.payments.values()].map((payment) => this.clone(payment));
  }

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
    if (payment.payment_reference) {
      const duplicate = [...this.payments.values()].find(
        (existing) =>
          existing.tenant_id === payment.tenant_id &&
          existing.payment_reference !== null &&
          existing.payment_reference === payment.payment_reference
      );

      if (duplicate) {
        throw new ConflictException('Unique constraint violation for (tenant_id, payment_reference)');
      }
    }

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

    if (patch.payment_reference && patch.payment_reference !== existing.payment_reference) {
      const duplicate = [...this.payments.values()].find(
        (payment) =>
          payment.tenant_id === tenantId &&
          payment.payment_reference === patch.payment_reference &&
          payment.id !== paymentId
      );
      if (duplicate) {
        throw new ConflictException('Unique constraint violation for (tenant_id, payment_reference)');
      }
    }

    const updated: PaymentEntity = {
      ...existing,
      ...patch,
      updated_at: new Date().toISOString()
    };

    this.payments.set(paymentId, updated);
    return updated;
  }

  createAllocation(allocation: Omit<PaymentAllocationEntity, 'id' | 'created_at' | 'updated_at'>): PaymentAllocationEntity {
    const payment = this.payments.get(allocation.payment_id);
    if (!payment || payment.tenant_id !== allocation.tenant_id) {
      throw new ConflictException('Foreign key violation for payment_id');
    }

    const duplicate = [...this.allocations.values()].find(
      (existing) =>
        existing.tenant_id === allocation.tenant_id &&
        existing.payment_id === allocation.payment_id &&
        existing.invoice_id === allocation.invoice_id &&
        existing.allocated_minor === allocation.allocated_minor &&
        existing.allocation_date === allocation.allocation_date
    );

    if (duplicate) {
      throw new ConflictException('Unique constraint violation for duplicate payment allocation tuple');
    }

    const now = new Date().toISOString();
    const created: PaymentAllocationEntity = {
      ...allocation,
      id: randomUUID(),
      created_at: now,
      updated_at: now
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
    return this.listAllocationsByPayment(tenantId, paymentId).reduce((sum, item) => sum + item.allocated_minor, 0);
  }

  sumAllocatedForInvoice(tenantId: string, invoiceId: string): number {
    return this.listAllocationsByInvoice(tenantId, invoiceId).reduce((sum, item) => sum + item.allocated_minor, 0);
  }

  deleteAllocationsByPayment(tenantId: string, paymentId: string): PaymentAllocationEntity[] {
    const existing = this.listAllocationsByPayment(tenantId, paymentId);
    for (const allocation of existing) {
      this.allocations.delete(allocation.id);
    }

    return existing;
  }

  createSnapshot(): { payments: Map<string, PaymentEntity>; allocations: Map<string, PaymentAllocationEntity> } {
    return {
      payments: new Map([...this.payments.entries()].map(([id, payment]) => [id, this.clone(payment)])),
      allocations: new Map([...this.allocations.entries()].map(([id, allocation]) => [id, this.clone(allocation)]))
    };
  }

  restoreSnapshot(snapshot: { payments: Map<string, PaymentEntity>; allocations: Map<string, PaymentAllocationEntity> }): void {
    this.payments.clear();
    this.allocations.clear();

    for (const [id, payment] of snapshot.payments.entries()) {
      this.payments.set(id, this.clone(payment));
    }

    for (const [id, allocation] of snapshot.allocations.entries()) {
      this.allocations.set(id, this.clone(allocation));
    }
  }

  private clone<T>(value: T): T {
    return JSON.parse(JSON.stringify(value)) as T;
  }
}
