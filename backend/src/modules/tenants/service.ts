import { Injectable, NotFoundException } from '@nestjs/common';
import { ChartOfAccountsService } from '../accounting/chart-of-accounts.service';
import { CreateTenantDto } from './dto/create-tenant.dto';
import { UpdateTenantDto } from './dto/update-tenant.dto';
import { TenantEntity } from './entity/tenant.entity';
import { ChartOfAccountsResponseDto } from '../accounting/dto/chart-validation-response.dto';
import { TenantsRepository } from './repository';

@Injectable()
export class TenantsService {
  constructor(
    private readonly tenantsRepository: TenantsRepository,
    private readonly chartOfAccountsService: ChartOfAccountsService
  ) {}

  createTenant(data: CreateTenantDto): TenantEntity {
    const tenant = this.tenantsRepository.create(data);
    this.chartOfAccountsService.initializeForTenant(tenant.id);
    return tenant;
  }

  getTenant(id: string): TenantEntity {
    const tenant = this.tenantsRepository.findById(id);
    if (!tenant) {
      throw new NotFoundException('Tenant not found');
    }

    return tenant;
  }


  getTenantChartOfAccounts(id: string): ChartOfAccountsResponseDto {
    this.getTenant(id);

    const accounts = this.chartOfAccountsService.initializeForTenant(id);
    const validation = this.chartOfAccountsService.validateTenantChart(id);

    return {
      tenant_id: id,
      accounts,
      validation
    };
  }

  updateTenant(id: string, data: UpdateTenantDto): TenantEntity {
    const tenant = this.tenantsRepository.update(id, data);
    if (!tenant) {
      throw new NotFoundException('Tenant not found');
    }

    return tenant;
  }
}
