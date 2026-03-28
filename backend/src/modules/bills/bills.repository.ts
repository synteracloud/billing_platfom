import { Injectable } from '@nestjs/common';
import { randomUUID } from 'crypto';
import { BillEntity } from './entities/bill.entity';

@Injectable()
export class BillsRepository {
  private readonly bills = new Map<string, BillEntity>();

  create(
    bill: Omit<BillEntity, 'id' | 'created_at' | 'updated_at' | 'deleted_at'>
  ): BillEntity {
    const now = new Date().toISOString();
    const created: BillEntity = {
      ...bill,
      id: randomUUID(),
      created_at: now,
      updated_at: now,
      deleted_at: null
    };

    this.bills.set(created.id, created);
    return created;
  }

  findById(tenantId: string, billId: string): BillEntity | undefined {
    const bill = this.bills.get(billId);
    if (!bill || bill.tenant_id !== tenantId || bill.deleted_at !== null) {
      return undefined;
    }

    return bill;
  }

  listByTenant(tenantId: string): BillEntity[] {
    return [...this.bills.values()]
      .filter((bill) => bill.tenant_id === tenantId && bill.deleted_at === null)
      .sort((a, b) => b.created_at.localeCompare(a.created_at));
  }

  listByVendor(tenantId: string, vendorId: string): BillEntity[] {
    return this.listByTenant(tenantId).filter((bill) => bill.vendor_id === vendorId);
  }

  update(
    tenantId: string,
    billId: string,
    patch: Partial<Omit<BillEntity, 'id' | 'tenant_id' | 'vendor_id' | 'created_at' | 'deleted_at'>>
  ): BillEntity | undefined {
    const existing = this.findById(tenantId, billId);
    if (!existing) {
      return undefined;
    }

    const updated: BillEntity = {
      ...existing,
      ...patch,
      updated_at: new Date().toISOString()
    };

    this.bills.set(billId, updated);
    return updated;
  }

  softDelete(tenantId: string, billId: string): boolean {
    const existing = this.findById(tenantId, billId);
    if (!existing) {
      return false;
    }

    const now = new Date().toISOString();
    this.bills.set(billId, {
      ...existing,
      updated_at: now,
      deleted_at: now
    });

    return true;
  }
}
