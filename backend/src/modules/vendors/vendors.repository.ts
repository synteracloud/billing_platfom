import { Injectable } from '@nestjs/common';
import { randomUUID } from 'crypto';
import { VendorEntity } from './entities/vendor.entity';

@Injectable()
export class VendorsRepository {
  private readonly vendors = new Map<string, VendorEntity>();

  create(
    vendor: Omit<VendorEntity, 'id' | 'created_at' | 'updated_at' | 'deleted_at'>
  ): VendorEntity {
    const now = new Date().toISOString();
    const created: VendorEntity = {
      ...vendor,
      id: randomUUID(),
      created_at: now,
      updated_at: now,
      deleted_at: null
    };

    this.vendors.set(created.id, created);
    return created;
  }

  findById(tenantId: string, vendorId: string): VendorEntity | undefined {
    const vendor = this.vendors.get(vendorId);
    if (!vendor || vendor.tenant_id !== tenantId || vendor.deleted_at !== null) {
      return undefined;
    }

    return vendor;
  }

  listByTenant(tenantId: string): VendorEntity[] {
    return [...this.vendors.values()]
      .filter((vendor) => vendor.tenant_id === tenantId && vendor.deleted_at === null)
      .sort((a, b) => b.created_at.localeCompare(a.created_at));
  }

  update(
    tenantId: string,
    vendorId: string,
    patch: Partial<Omit<VendorEntity, 'id' | 'tenant_id' | 'created_at' | 'deleted_at'>>
  ): VendorEntity | undefined {
    const existing = this.findById(tenantId, vendorId);
    if (!existing) {
      return undefined;
    }

    const updated: VendorEntity = {
      ...existing,
      ...patch,
      updated_at: new Date().toISOString()
    };

    this.vendors.set(vendorId, updated);
    return updated;
  }

  softDelete(tenantId: string, vendorId: string): boolean {
    const existing = this.findById(tenantId, vendorId);
    if (!existing) {
      return false;
    }

    const now = new Date().toISOString();
    this.vendors.set(vendorId, {
      ...existing,
      updated_at: now,
      deleted_at: now
    });

    return true;
  }
}
