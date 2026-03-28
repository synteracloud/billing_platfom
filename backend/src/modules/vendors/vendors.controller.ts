import { Body, Controller, Delete, Get, HttpCode, HttpStatus, Param, Patch, Post } from '@nestjs/common';
import { Req } from '@nestjs/common/decorators';
import { randomUUID } from 'crypto';
import { AuthenticatedRequest } from '../../common/interfaces/authenticated-request.interface';
import { CreateVendorDto } from './dto/create-vendor.dto';
import { UpdateVendorDto } from './dto/update-vendor.dto';
import { VendorEntity } from './entities/vendor.entity';
import { VendorsService } from './vendors.service';

interface SuccessResponse<T> {
  data: T;
  meta: { request_id: string };
  error: null;
}

@Controller('api/v1/vendors')
export class VendorsController {
  constructor(private readonly vendorsService: VendorsService) {}

  @Get()
  listVendors(@Req() req: AuthenticatedRequest): SuccessResponse<VendorEntity[]> {
    return {
      data: this.vendorsService.listVendors(req.auth!.tenant_id),
      meta: { request_id: this.getRequestId() },
      error: null
    };
  }

  @Post()
  @HttpCode(HttpStatus.CREATED)
  createVendor(@Req() req: AuthenticatedRequest, @Body() body: CreateVendorDto): SuccessResponse<VendorEntity> {
    return {
      data: this.vendorsService.createVendor(req.auth!.tenant_id, body),
      meta: { request_id: this.getRequestId() },
      error: null
    };
  }

  @Get(':id')
  getVendor(@Req() req: AuthenticatedRequest, @Param('id') id: string): SuccessResponse<VendorEntity> {
    return {
      data: this.vendorsService.getVendor(req.auth!.tenant_id, id),
      meta: { request_id: this.getRequestId() },
      error: null
    };
  }

  @Patch(':id')
  updateVendor(
    @Req() req: AuthenticatedRequest,
    @Param('id') id: string,
    @Body() body: UpdateVendorDto
  ): SuccessResponse<VendorEntity> {
    return {
      data: this.vendorsService.updateVendor(req.auth!.tenant_id, id, body),
      meta: { request_id: this.getRequestId() },
      error: null
    };
  }

  @Delete(':id')
  @HttpCode(HttpStatus.NO_CONTENT)
  deleteVendor(@Req() req: AuthenticatedRequest, @Param('id') id: string): void {
    this.vendorsService.deleteVendor(req.auth!.tenant_id, id);
  }

  private getRequestId(): string {
    return randomUUID();
  }
}
