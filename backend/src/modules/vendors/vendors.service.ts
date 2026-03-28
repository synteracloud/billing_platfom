import { BadRequestException, Injectable, NotFoundException } from '@nestjs/common';
import { CreateVendorDto } from './dto/create-vendor.dto';
import { UpdateVendorDto } from './dto/update-vendor.dto';
import { VendorEntity } from './entities/vendor.entity';
import { VendorsRepository } from './vendors.repository';

@Injectable()
export class VendorsService {
  constructor(private readonly vendorsRepository: VendorsRepository) {}

  createVendor(tenantId: string, data: CreateVendorDto): VendorEntity {
    this.validateName(data.name);
    this.validateCurrency(data.currency_code);
    this.validateEmail(data.contact_email);

    return this.vendorsRepository.create({
      tenant_id: tenantId,
      name: data.name.trim(),
      contact_name: data.contact_name ?? null,
      contact_email: data.contact_email ?? null,
      contact_phone: data.contact_phone ?? null,
      currency_code: data.currency_code.toUpperCase(),
      status: data.status ?? 'active',
      metadata: data.metadata ?? null
    });
  }

  getVendor(tenantId: string, vendorId: string): VendorEntity {
    const vendor = this.vendorsRepository.findById(tenantId, vendorId);
    if (!vendor) {
      throw new NotFoundException('Vendor not found');
    }

    return vendor;
  }

  listVendors(tenantId: string): VendorEntity[] {
    return this.vendorsRepository.listByTenant(tenantId);
  }

  updateVendor(tenantId: string, vendorId: string, data: UpdateVendorDto): VendorEntity {
    if (data.name !== undefined) {
      this.validateName(data.name);
    }

    if (data.currency_code !== undefined) {
      this.validateCurrency(data.currency_code);
    }

    if (data.contact_email !== undefined) {
      this.validateEmail(data.contact_email);
    }

    const updated = this.vendorsRepository.update(tenantId, vendorId, {
      ...data,
      name: data.name?.trim(),
      currency_code: data.currency_code?.toUpperCase()
    });

    if (!updated) {
      throw new NotFoundException('Vendor not found');
    }

    return updated;
  }

  deleteVendor(tenantId: string, vendorId: string): void {
    const deleted = this.vendorsRepository.softDelete(tenantId, vendorId);
    if (!deleted) {
      throw new NotFoundException('Vendor not found');
    }
  }

  private validateName(name: string | undefined): void {
    if (!name || name.trim().length === 0) {
      throw new BadRequestException('name is required');
    }
  }

  private validateCurrency(currencyCode: string | undefined): void {
    if (!currencyCode || currencyCode.trim().length !== 3) {
      throw new BadRequestException('currency_code must be ISO-4217 alpha-3');
    }
  }

  private validateEmail(email: string | null | undefined): void {
    if (!email) {
      return;
    }

    const emailRegex = /^[^\s@]+@[^\s@]+\.[^\s@]+$/;
    if (!emailRegex.test(email)) {
      throw new BadRequestException('contact_email must be a valid email address');
    }
  }
}
