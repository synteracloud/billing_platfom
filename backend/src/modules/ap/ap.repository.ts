import { Injectable } from '@nestjs/common';

export interface PayableBillPosition {
  bill_id: string;
  vendor_id: string;
  currency_code: string;
  approved_at: string;
  due_date: string | null;
  total_minor: number;
  open_amount_minor: number;
  paid_amount_minor: number;
  status: 'open' | 'closed' | 'void';
  updated_at: string;
}

export interface VendorPayableState {
  vendor_id: string;
  currency_code: string;
  total_open_amount_minor: number;
  total_paid_amount_minor: number;
  bill_count_open: number;
  bill_count_total: number;
  bills: PayableBillPosition[];
  updated_at: string | null;
}

@Injectable()
export class ApRepository {
  private readonly positions = new Map<string, Map<string, PayableBillPosition>>();
  private readonly appliedEventKeys = new Set<string>();

  upsertBill(tenantId: string, position: PayableBillPosition): PayableBillPosition {
    const tenantPositions = this.positions.get(tenantId) ?? new Map<string, PayableBillPosition>();
    this.positions.set(tenantId, tenantPositions);
    tenantPositions.set(position.bill_id, position);
    return position;
  }

  findBill(tenantId: string, billId: string): PayableBillPosition | null {
    const tenantPositions = this.positions.get(tenantId);
    if (!tenantPositions) {
      return null;
    }

    return tenantPositions.get(billId) ?? null;
  }

  listBillsByVendor(tenantId: string, vendorId: string): PayableBillPosition[] {
    const tenantPositions = this.positions.get(tenantId);
    if (!tenantPositions) {
      return [];
    }

    return Array.from(tenantPositions.values()).filter((position) => position.vendor_id === vendorId);
  }

  listBills(tenantId: string): PayableBillPosition[] {
    const tenantPositions = this.positions.get(tenantId);
    if (!tenantPositions) {
      return [];
    }

    return Array.from(tenantPositions.values());
  }

  markEventApplied(tenantId: string, scope: string, eventId: string): boolean {
    const normalizedEventId = eventId.trim();
    if (!normalizedEventId) {
      return true;
    }

    const key = `${tenantId}::${scope}::${normalizedEventId}`;
    if (this.appliedEventKeys.has(key)) {
      return false;
    }

    this.appliedEventKeys.add(key);
    return true;
  }
}
