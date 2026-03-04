import { Injectable, NotFoundException } from '@nestjs/common';
import { CreateTenantDto } from './dto/create-tenant.dto';
import { UpdateTenantDto } from './dto/update-tenant.dto';
import { TenantEntity } from './entity/tenant.entity';
import { TenantsRepository } from './repository';

@Injectable()
export class TenantsService {
  constructor(private readonly tenantsRepository: TenantsRepository) {}

  createTenant(data: CreateTenantDto): TenantEntity {
    return this.tenantsRepository.create(data);
  }

  getTenant(id: string): TenantEntity {
    const tenant = this.tenantsRepository.findById(id);
    if (!tenant) {
      throw new NotFoundException('Tenant not found');
    }

    return tenant;
  }

  updateTenant(id: string, data: UpdateTenantDto): TenantEntity {
    const tenant = this.tenantsRepository.update(id, data);
    if (!tenant) {
      throw new NotFoundException('Tenant not found');
    }

    return tenant;
  }
}
