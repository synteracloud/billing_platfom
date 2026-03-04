import { Injectable } from '@nestjs/common';
import { randomUUID } from 'crypto';
import { CustomerEntity } from './entities/customer.entity';

interface ListByTenantOptions {
  limit: number;
  offset: number;
  search?: string;
}

@Injectable()
export class CustomersRepository {
  private readonly customers = new Map<string, CustomerEntity>();

  create(
    customer: Omit<CustomerEntity, 'id' | 'created_at' | 'updated_at' | 'deleted_at'>
  ): CustomerEntity {
    const now = new Date().toISOString();
    const created: CustomerEntity = {
      ...customer,
      id: randomUUID(),
      created_at: now,
      updated_at: now,
      deleted_at: null
    };

    this.customers.set(created.id, created);
    return created;
  }

  findById(tenantId: string, customerId: string): CustomerEntity | undefined {
    const customer = this.customers.get(customerId);
    if (!customer || customer.tenant_id !== tenantId || customer.deleted_at !== null) {
      return undefined;
    }

    return customer;
  }

  listByTenant(
    tenantId: string,
    options: ListByTenantOptions
  ): { rows: CustomerEntity[]; hasMore: boolean } {
    const searchLower = options.search?.toLowerCase().trim();
    const scoped = [...this.customers.values()]
      .filter((customer) => customer.tenant_id === tenantId && customer.deleted_at === null)
      .filter((customer) => {
        if (!searchLower) {
          return true;
        }

        const nameMatch =
          customer.legal_name.toLowerCase().includes(searchLower) ||
          customer.display_name.toLowerCase().includes(searchLower);
        const emailMatch = customer.email?.toLowerCase().includes(searchLower) ?? false;
        return nameMatch || emailMatch;
      })
      .sort((a, b) => b.created_at.localeCompare(a.created_at));

    const rows = scoped.slice(options.offset, options.offset + options.limit);
    const hasMore = options.offset + options.limit < scoped.length;

    return { rows, hasMore };
  }

  update(
    tenantId: string,
    customerId: string,
    patch: Partial<Omit<CustomerEntity, 'id' | 'tenant_id' | 'created_at' | 'deleted_at'>>
  ): CustomerEntity | undefined {
    const existing = this.findById(tenantId, customerId);
    if (!existing) {
      return undefined;
    }

    const updated: CustomerEntity = {
      ...existing,
      ...patch,
      updated_at: new Date().toISOString()
    };

    this.customers.set(customerId, updated);
    return updated;
  }

  softDelete(tenantId: string, customerId: string): boolean {
    const existing = this.findById(tenantId, customerId);
    if (!existing) {
      return false;
    }

    const now = new Date().toISOString();
    this.customers.set(customerId, {
      ...existing,
      updated_at: now,
      deleted_at: now
    });

    return true;
  }
}
