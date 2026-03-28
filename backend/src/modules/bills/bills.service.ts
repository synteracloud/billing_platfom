import { BadRequestException, Injectable, NotFoundException } from '@nestjs/common';
import { CreateBillDto } from './dto/create-bill.dto';
import { UpdateBillDto } from './dto/update-bill.dto';
import { BillEntity } from './entities/bill.entity';
import { BillsRepository } from './bills.repository';
import { VendorsRepository } from '../vendors/vendors.repository';
import { EventsService } from '../events/events.service';

@Injectable()
export class BillsService {
  constructor(
    private readonly billsRepository: BillsRepository,
    private readonly vendorsRepository: VendorsRepository,
    private readonly eventsService: EventsService
  ) {}

  createBill(tenantId: string, data: CreateBillDto, actorId = 'system', idempotencyKey?: string): BillEntity {
    this.validateVendor(data.vendor_id);
    this.validateCurrency(data.currency_code);
    this.validateAmount(data.total_amount_minor);
    this.validateDates(data.issued_at ?? null, data.due_at ?? null);

    const vendor = this.vendorsRepository.findById(tenantId, data.vendor_id);
    if (!vendor) {
      throw new BadRequestException('vendor_id must reference an existing vendor in tenant scope');
    }

    const created = this.billsRepository.create({
      tenant_id: tenantId,
      vendor_id: data.vendor_id,
      total_amount_minor: data.total_amount_minor,
      currency_code: data.currency_code.toUpperCase(),
      status: data.status ?? 'draft',
      issued_at: data.issued_at ?? null,
      due_at: data.due_at ?? null,
      metadata: data.metadata ?? null
    });

    this.eventsService.logMutation({
      tenant_id: tenantId,
      entity_type: 'bill',
      entity_id: created.id,
      action: 'created',
      actor_type: 'user',
      actor_id: actorId,
      aggregate_version: 1,
      correlation_id: created.id,
      idempotency_key: idempotencyKey ? `${idempotencyKey}:audit:bill:create` : undefined,
      payload: { after: created }
    });

    return created;
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

  updateBill(tenantId: string, billId: string, data: UpdateBillDto, actorId = 'system', idempotencyKey?: string): BillEntity {
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

    this.eventsService.logMutation({
      tenant_id: tenantId,
      entity_type: 'bill',
      entity_id: updated.id,
      action: 'updated',
      actor_type: 'user',
      actor_id: actorId,
      aggregate_version: 2,
      correlation_id: updated.id,
      idempotency_key: idempotencyKey ? `${idempotencyKey}:audit:bill:update` : undefined,
      payload: { before: existing, after: updated }
    });

    return updated;
  }

  deleteBill(tenantId: string, billId: string, actorId = 'system', idempotencyKey?: string): void {
    const existing = this.getBill(tenantId, billId);
    const deleted = this.billsRepository.softDelete(tenantId, billId);
    if (!deleted) {
      throw new NotFoundException('Bill not found');
    }

    this.eventsService.logMutation({
      tenant_id: tenantId,
      entity_type: 'bill',
      entity_id: billId,
      action: 'deleted',
      actor_type: 'user',
      actor_id: actorId,
      aggregate_version: 3,
      correlation_id: billId,
      idempotency_key: idempotencyKey ? `${idempotencyKey}:audit:bill:delete` : undefined,
      payload: { before: existing, after: null }
    });
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
