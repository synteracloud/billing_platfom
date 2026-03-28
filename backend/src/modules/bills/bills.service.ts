import { BadRequestException, Injectable, NotFoundException } from '@nestjs/common';
import { CreateBillDto } from './dto/create-bill.dto';
import { UpdateBillDto } from './dto/update-bill.dto';
import { BillEntity } from './entities/bill.entity';
import { BillsRepository } from './bills.repository';
import { VendorsRepository } from '../vendors/vendors.repository';

@Injectable()
export class BillsService {
  constructor(
    private readonly billsRepository: BillsRepository,
    private readonly vendorsRepository: VendorsRepository
  ) {}

  createBill(tenantId: string, data: CreateBillDto): BillEntity {
    this.validateVendor(data.vendor_id);
    this.validateCurrency(data.currency_code);
    this.validateAmount(data.total_amount_minor);
    this.validateDates(data.issued_at ?? null, data.due_at ?? null);

    const vendor = this.vendorsRepository.findById(tenantId, data.vendor_id);
    if (!vendor) {
      throw new BadRequestException('vendor_id must reference an existing vendor in tenant scope');
    }

    return this.billsRepository.create({
      tenant_id: tenantId,
      vendor_id: data.vendor_id,
      total_amount_minor: data.total_amount_minor,
      currency_code: data.currency_code.toUpperCase(),
      status: data.status ?? 'draft',
      issued_at: data.issued_at ?? null,
      due_at: data.due_at ?? null,
      metadata: data.metadata ?? null
    });
  }

  getBill(tenantId: string, billId: string): BillEntity {
    const bill = this.billsRepository.findById(tenantId, billId);
    if (!bill) {
      throw new NotFoundException('Bill not found');
    }

    return bill;
  }

  listBills(tenantId: string, vendorId?: string): BillEntity[] {
    if (!vendorId) {
      return this.billsRepository.listByTenant(tenantId);
    }

    return this.listBillsByVendor(tenantId, vendorId);
  }

  listBillsByVendor(tenantId: string, vendorId: string): BillEntity[] {
    const vendor = this.vendorsRepository.findById(tenantId, vendorId);
    if (!vendor) {
      throw new NotFoundException('Vendor not found');
    }

    return this.billsRepository.listByVendor(tenantId, vendorId);
  }

  updateBill(tenantId: string, billId: string, data: UpdateBillDto): BillEntity {
    if (data.currency_code !== undefined) {
      this.validateCurrency(data.currency_code);
    }

    if (data.total_amount_minor !== undefined) {
      this.validateAmount(data.total_amount_minor);
    }

    const existing = this.getBill(tenantId, billId);
    this.validateDates(data.issued_at ?? existing.issued_at, data.due_at ?? existing.due_at);

    const updated = this.billsRepository.update(tenantId, billId, {
      ...data,
      currency_code: data.currency_code?.toUpperCase()
    });

    if (!updated) {
      throw new NotFoundException('Bill not found');
    }

    return updated;
  }

  deleteBill(tenantId: string, billId: string): void {
    const deleted = this.billsRepository.softDelete(tenantId, billId);
    if (!deleted) {
      throw new NotFoundException('Bill not found');
    }
  }

  private validateVendor(vendorId: string | undefined): void {
    if (!vendorId || vendorId.trim().length === 0) {
      throw new BadRequestException('vendor_id is required');
    }
  }

  private validateCurrency(currencyCode: string | undefined): void {
    if (!currencyCode || currencyCode.trim().length !== 3) {
      throw new BadRequestException('currency_code must be ISO-4217 alpha-3');
    }
  }

  private validateAmount(amountMinor: number | undefined): void {
    if (typeof amountMinor !== 'number' || !Number.isInteger(amountMinor) || amountMinor < 0) {
      throw new BadRequestException('total_amount_minor must be a non-negative integer');
    }
  }

  private validateDates(issuedAt: string | null, dueAt: string | null): void {
    if (!issuedAt || !dueAt) {
      return;
    }

    if (dueAt < issuedAt) {
      throw new BadRequestException('due_at cannot be earlier than issued_at');
    }
  }
}
