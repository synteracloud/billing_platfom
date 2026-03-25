import { Injectable, NotFoundException } from '@nestjs/common';
import { EventsService } from '../events/events.service';
import { ApRepository, PayableBillPosition, VendorPayableState } from './ap.repository';

export type BillApprovedPayload = {
  bill_id: string;
  vendor_id: string;
  approved_at: string;
  due_date: string | null;
  total_minor: number;
  currency_code: string;
};

export type BillPaidPayload = {
  bill_id: string;
  paid_at: string;
  amount_paid_minor: number;
};

@Injectable()
export class ApService {
  constructor(
    private readonly apRepository: ApRepository,
    private readonly eventsService: EventsService
  ) {}

  applyBillApproved(tenantId: string, payload: BillApprovedPayload, correlationId: string | null): void {
    const now = new Date().toISOString();
    const previous = this.apRepository.findBill(tenantId, payload.bill_id);
    const baseOpenAmount = previous ? previous.open_amount_minor : payload.total_minor;

    const next: PayableBillPosition = {
      bill_id: payload.bill_id,
      vendor_id: payload.vendor_id,
      currency_code: payload.currency_code,
      approved_at: payload.approved_at,
      due_date: payload.due_date,
      total_minor: payload.total_minor,
      open_amount_minor: Math.max(0, Math.min(payload.total_minor, baseOpenAmount)),
      paid_amount_minor: Math.max(0, payload.total_minor - Math.max(0, Math.min(payload.total_minor, baseOpenAmount))),
      status: baseOpenAmount <= 0 ? 'closed' : 'open',
      updated_at: now
    };

    this.apRepository.upsertBill(tenantId, next);
    this.emitPayableUpdated(tenantId, next, correlationId);
  }

  applyBillPaid(tenantId: string, payload: BillPaidPayload, correlationId: string | null): void {
    const bill = this.apRepository.findBill(tenantId, payload.bill_id);
    if (!bill || bill.status === 'void') {
      return;
    }

    const paymentDelta = Math.max(0, payload.amount_paid_minor);
    const nextOpen = Math.max(0, Math.min(bill.total_minor, bill.open_amount_minor - paymentDelta));
    const next: PayableBillPosition = {
      ...bill,
      open_amount_minor: nextOpen,
      paid_amount_minor: Math.max(0, bill.total_minor - nextOpen),
      status: nextOpen === 0 ? 'closed' : 'open',
      updated_at: new Date().toISOString()
    };

    this.apRepository.upsertBill(tenantId, next);
    this.emitPayableUpdated(tenantId, next, correlationId);
  }

  getVendorPayableState(tenantId: string, vendorId: string): VendorPayableState {
    const bills = this.apRepository.listBillsByVendor(tenantId, vendorId);
    if (bills.length === 0) {
      throw new NotFoundException('Vendor payable state not found');
    }

    return {
      vendor_id: vendorId,
      currency_code: bills[0].currency_code,
      total_open_amount_minor: bills.reduce((sum, item) => sum + item.open_amount_minor, 0),
      total_paid_amount_minor: bills.reduce((sum, item) => sum + item.paid_amount_minor, 0),
      bill_count_open: bills.filter((item) => item.status === 'open').length,
      bill_count_total: bills.length,
      bills: [...bills].sort((a, b) => a.approved_at.localeCompare(b.approved_at) || a.bill_id.localeCompare(b.bill_id)),
      updated_at: bills.map((item) => item.updated_at).sort().at(-1) ?? null
    };
  }

  private emitPayableUpdated(tenantId: string, position: PayableBillPosition, correlationId: string | null): void {
    this.eventsService.logEvent({
      tenant_id: tenantId,
      type: 'subledger.payable.updated.v1',
      aggregate_type: 'payable_position',
      aggregate_id: position.bill_id,
      aggregate_version: 1,
      correlation_id: correlationId,
      idempotency_key: `subledger.payable.updated.v1:${position.bill_id}:${position.updated_at}:${position.open_amount_minor}`,
      payload: {
        payable_position_id: position.bill_id,
        vendor_id: position.vendor_id,
        open_amount_minor: position.open_amount_minor,
        currency_code: position.currency_code
      }
    });
  }
}
