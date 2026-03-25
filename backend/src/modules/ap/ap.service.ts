import { Injectable, NotFoundException } from '@nestjs/common';
import { EventsService } from '../events/events.service';
import { BillCreatedPayload, PayableUpdatedPayload } from '../events/entities/event.entity';
import { ApRepository, PayableBillPosition } from './ap.repository';

interface VendorBalanceResponse {
  vendor_id: string;
  currency_code: string;
  total_open_amount_minor: number;
  total_paid_amount_minor: number;
  bill_count_open: number;
  bill_count_total: number;
  updated_at: string | null;
}

interface VendorBillsResponse {
  vendor_id: string;
  currency_code: string;
  bills: PayableBillPosition[];
}

interface DueOverdueResponse {
  vendor_id: string;
  as_of_date: string;
  currency_code: string;
  due_amount_minor: number;
  overdue_amount_minor: number;
  unknown_due_date_amount_minor: number;
  due_bill_count: number;
  overdue_bill_count: number;
  unknown_due_date_bill_count: number;
}

@Injectable()
export class ApService {
  constructor(
    private readonly apRepository: ApRepository,
    private readonly eventsService: EventsService
  ) {}

  applyBillCreated(tenantId: string, payload: BillCreatedPayload, correlationId: string | null): void {
    const now = new Date().toISOString();

    const next: PayableBillPosition = {
      bill_id: payload.bill_id,
      vendor_id: this.extractVendorId(payload),
      currency_code: payload.currency_code,
      created_at: payload.created_at,
      due_date: this.extractDueDate(payload),
      total_minor: payload.total_minor,
      open_amount_minor: payload.total_minor,
      paid_amount_minor: 0,
      status: payload.total_minor > 0 ? 'open' : 'closed',
      updated_at: now
    };

    this.apRepository.upsertBill(tenantId, next);
    this.emitPayableUpdated(tenantId, next, correlationId);
  }

  applyPayableUpdated(tenantId: string, payload: PayableUpdatedPayload, correlationId: string | null): void {
    const current = this.apRepository.findBill(tenantId, payload.payable_position_id);
    if (!current) {
      return;
    }

    const nextOpen = Math.max(0, Math.min(current.total_minor, payload.open_amount_minor));
    const next: PayableBillPosition = {
      ...current,
      vendor_id: payload.vendor_id,
      currency_code: payload.currency_code,
      open_amount_minor: nextOpen,
      paid_amount_minor: Math.max(0, current.total_minor - nextOpen),
      status: nextOpen === 0 ? 'closed' : 'open',
      updated_at: new Date().toISOString()
    };

    this.apRepository.upsertBill(tenantId, next);
    this.emitPayableUpdated(tenantId, next, correlationId);
  }

  getVendorBalance(tenantId: string, vendorId: string): VendorBalanceResponse {
    const bills = this.apRepository.listBillsByVendor(tenantId, vendorId);
    if (bills.length === 0) {
      throw new NotFoundException('Vendor balance not found');
    }

    return {
      vendor_id: vendorId,
      currency_code: bills[0].currency_code,
      total_open_amount_minor: bills.reduce((sum, item) => sum + item.open_amount_minor, 0),
      total_paid_amount_minor: bills.reduce((sum, item) => sum + item.paid_amount_minor, 0),
      bill_count_open: bills.filter((item) => item.status === 'open').length,
      bill_count_total: bills.length,
      updated_at: bills.map((item) => item.updated_at).sort().at(-1) ?? null
    };
  }

  getBills(tenantId: string, vendorId: string): VendorBillsResponse {
    const bills = this.apRepository.listBillsByVendor(tenantId, vendorId);
    if (bills.length === 0) {
      throw new NotFoundException('Vendor bills not found');
    }

    return {
      vendor_id: vendorId,
      currency_code: bills[0].currency_code,
      bills: [...bills].sort((a, b) => a.created_at.localeCompare(b.created_at) || a.bill_id.localeCompare(b.bill_id))
    };
  }

  getDueOverdue(tenantId: string, vendorId: string, asOfDate: string): DueOverdueResponse {
    const bills = this.apRepository
      .listBillsByVendor(tenantId, vendorId)
      .filter((item) => item.open_amount_minor > 0);

    if (bills.length === 0) {
      throw new NotFoundException('Vendor due/overdue state not found');
    }

    const dueBills = bills.filter((item) => item.due_date !== null && item.due_date >= asOfDate);
    const overdueBills = bills.filter((item) => item.due_date !== null && item.due_date < asOfDate);
    const unknownDueDateBills = bills.filter((item) => item.due_date === null);

    return {
      vendor_id: vendorId,
      as_of_date: asOfDate,
      currency_code: bills[0].currency_code,
      due_amount_minor: dueBills.reduce((sum, item) => sum + item.open_amount_minor, 0),
      overdue_amount_minor: overdueBills.reduce((sum, item) => sum + item.open_amount_minor, 0),
      unknown_due_date_amount_minor: unknownDueDateBills.reduce((sum, item) => sum + item.open_amount_minor, 0),
      due_bill_count: dueBills.length,
      overdue_bill_count: overdueBills.length,
      unknown_due_date_bill_count: unknownDueDateBills.length
    };
  }

  private emitPayableUpdated(tenantId: string, bill: PayableBillPosition, correlationId: string | null): void {
    this.eventsService.logEvent({
      tenant_id: tenantId,
      type: 'subledger.payable.updated.v1',
      aggregate_type: 'payable_position',
      aggregate_id: bill.bill_id,
      aggregate_version: 1,
      correlation_id: correlationId,
      idempotency_key: `subledger.payable.updated.v1:${bill.bill_id}:${bill.updated_at}:${bill.open_amount_minor}`,
      payload: {
        payable_position_id: bill.bill_id,
        vendor_id: bill.vendor_id,
        open_amount_minor: bill.open_amount_minor,
        currency_code: bill.currency_code
      }
    });
  }

  private extractVendorId(payload: BillCreatedPayload): string {
    const maybeVendorId = (payload as BillCreatedPayload & { vendor_id?: string }).vendor_id;
    return typeof maybeVendorId === 'string' && maybeVendorId.trim().length > 0 ? maybeVendorId : 'unknown-vendor';
  }

  private extractDueDate(payload: BillCreatedPayload): string | null {
    const maybeDueDate = (payload as BillCreatedPayload & { due_date?: string | null }).due_date;
    if (typeof maybeDueDate !== 'string' || maybeDueDate.trim().length === 0) {
      return null;
    }

    return maybeDueDate;
  }
}
