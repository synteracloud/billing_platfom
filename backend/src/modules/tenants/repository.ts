import { Injectable } from '@nestjs/common';
import { randomUUID } from 'crypto';
import { CreateTenantDto } from './dto/create-tenant.dto';
import { UpdateTenantDto } from './dto/update-tenant.dto';
import { TenantEntity } from './entity/tenant.entity';

@Injectable()
export class TenantsRepository {
  private readonly tenants = new Map<string, TenantEntity>();

  create(data: CreateTenantDto): TenantEntity {
    const now = new Date().toISOString();
    const tenant: TenantEntity = {
      id: randomUUID(),
      name: data.name,
      created_at: now,
      updated_at: now
    };
    this.tenants.set(tenant.id, tenant);
    return tenant;
  }

  findById(id: string): TenantEntity | undefined {
    return this.tenants.get(id);
  }

  update(id: string, data: UpdateTenantDto): TenantEntity | undefined {
    const existing = this.tenants.get(id);
    if (!existing) {
      return undefined;
    }

    const updated: TenantEntity = {
      ...existing,
      ...data,
      updated_at: new Date().toISOString()
    };

    this.tenants.set(id, updated);
    return updated;
  }
}
