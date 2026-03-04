import { Body, Controller, Get, Param, Patch, Post } from '@nestjs/common';
import { CreateTenantDto } from './dto/create-tenant.dto';
import { UpdateTenantDto } from './dto/update-tenant.dto';
import { TenantEntity } from './entity/tenant.entity';
import { TenantsService } from './service';

@Controller('api/v1/tenants')
export class TenantsController {
  constructor(private readonly tenantsService: TenantsService) {}

  @Post()
  createTenant(@Body() body: CreateTenantDto): TenantEntity {
    return this.tenantsService.createTenant(body);
  }

  @Get(':id')
  getTenant(@Param('id') id: string): TenantEntity {
    return this.tenantsService.getTenant(id);
  }

  @Patch(':id')
  updateTenant(@Param('id') id: string, @Body() body: UpdateTenantDto): TenantEntity {
    return this.tenantsService.updateTenant(id, body);
  }
}
