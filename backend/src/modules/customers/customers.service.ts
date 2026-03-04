import { BadRequestException, Injectable, NotFoundException } from '@nestjs/common';
import { CreateCustomerDto } from './dto/create-customer.dto';
import { UpdateCustomerDto } from './dto/update-customer.dto';
import { CustomerEntity } from './entities/customer.entity';
import { CustomersRepository } from './customers.repository';

interface ListCustomersOptions {
  limit?: string;
  cursor?: string;
  search?: string;
}

@Injectable()
export class CustomersService {
  constructor(private readonly customersRepository: CustomersRepository) {}

  createCustomer(tenantId: string, data: CreateCustomerDto): CustomerEntity {
    this.validateLegalName(data.legal_name);
    this.validateEmail(data.email);
    this.validateCountry(data.billing_country);

    return this.customersRepository.create({
      tenant_id: tenantId,
      legal_name: data.legal_name.trim(),
      display_name: (data.display_name ?? data.legal_name).trim(),
      email: data.email ?? null,
      phone: data.phone ?? null,
      tax_id: data.tax_id ?? null,
      billing_address_line1: data.billing_address_line1 ?? null,
      billing_address_line2: data.billing_address_line2 ?? null,
      billing_city: data.billing_city ?? null,
      billing_state: data.billing_state ?? null,
      billing_postal_code: data.billing_postal_code ?? null,
      billing_country: data.billing_country?.toUpperCase() ?? null,
      metadata: data.metadata ?? null
    });
  }

  getCustomer(tenantId: string, customerId: string): CustomerEntity {
    const customer = this.customersRepository.findById(tenantId, customerId);
    if (!customer) {
      throw new NotFoundException('Customer not found');
    }

    return customer;
  }

  listCustomers(tenantId: string, options: ListCustomersOptions): {
    items: CustomerEntity[];
    cursor: { next: string | null; prev: string | null; has_more: boolean };
  } {
    const limit = this.parseLimit(options.limit);
    const offset = this.decodeCursor(options.cursor);

    const { rows, hasMore } = this.customersRepository.listByTenant(tenantId, {
      limit,
      offset,
      search: options.search
    });

    const next = hasMore ? this.encodeCursor(offset + limit) : null;
    const prev = offset > 0 ? this.encodeCursor(Math.max(offset - limit, 0)) : null;

    return {
      items: rows,
      cursor: {
        next,
        prev,
        has_more: hasMore
      }
    };
  }

  updateCustomer(tenantId: string, customerId: string, data: UpdateCustomerDto): CustomerEntity {
    if (data.legal_name !== undefined) {
      this.validateLegalName(data.legal_name);
    }

    if (data.email !== undefined) {
      this.validateEmail(data.email);
    }

    if (data.billing_country !== undefined) {
      this.validateCountry(data.billing_country);
    }

    const existing = this.getCustomer(tenantId, customerId);
    const updated = this.customersRepository.update(tenantId, customerId, {
      ...data,
      legal_name: data.legal_name?.trim(),
      display_name:
        data.display_name !== undefined
          ? (data.display_name || data.legal_name || existing.legal_name).trim()
          : existing.display_name,
      email: data.email === undefined ? existing.email : data.email,
      billing_country:
        data.billing_country === undefined ? existing.billing_country : data.billing_country?.toUpperCase() ?? null
    });

    if (!updated) {
      throw new NotFoundException('Customer not found');
    }

    return updated;
  }

  deleteCustomer(tenantId: string, customerId: string): void {
    const deleted = this.customersRepository.softDelete(tenantId, customerId);
    if (!deleted) {
      throw new NotFoundException('Customer not found');
    }
  }

  private validateLegalName(legalName: string | undefined): void {
    if (!legalName || legalName.trim().length === 0) {
      throw new BadRequestException('legal_name is required');
    }
  }

  private validateEmail(email: string | null | undefined): void {
    if (!email) {
      return;
    }

    const emailRegex = /^[^\s@]+@[^\s@]+\.[^\s@]+$/;
    if (!emailRegex.test(email)) {
      throw new BadRequestException('email must be a valid email address');
    }
  }

  private validateCountry(country: string | null | undefined): void {
    if (!country) {
      return;
    }

    if (country.length !== 2) {
      throw new BadRequestException('billing_country must be ISO-3166 alpha-2');
    }
  }

  private parseLimit(limit?: string): number {
    if (!limit) {
      return 25;
    }

    const parsed = Number(limit);
    if (!Number.isInteger(parsed) || parsed < 1) {
      throw new BadRequestException('limit must be a positive integer');
    }

    return Math.min(parsed, 100);
  }

  private decodeCursor(cursor?: string): number {
    if (!cursor) {
      return 0;
    }

    try {
      const decoded = Buffer.from(cursor, 'base64').toString('utf8');
      const [prefix, value] = decoded.split(':');
      if (prefix !== 'offset') {
        throw new Error('Invalid prefix');
      }

      const offset = Number(value);
      if (!Number.isInteger(offset) || offset < 0) {
        throw new Error('Invalid offset');
      }

      return offset;
    } catch {
      throw new BadRequestException('Invalid cursor');
    }
  }

  private encodeCursor(offset: number): string {
    return Buffer.from(`offset:${offset}`, 'utf8').toString('base64');
  }
}
