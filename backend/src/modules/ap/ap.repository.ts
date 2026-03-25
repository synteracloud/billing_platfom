import { Injectable } from '@nestjs/common';

export type PayableBillStatus = 'open' | 'closed';

export interface PayableBillPosition {
  bill_id: string;
  vendor_id: string;
  currency_code: string;
  created_at: string;
  due_date: string | null;
  total_minor: number;
  open_amount_minor: number;
  paid_amount_minor: number;
  status: PayableBillStatus;
  updated_at: string;
}

@Injectable()
export class ApRepository {
  private readonly billsByTenant = new Map<string, Map<string, PayableBillPosition>>();
  private readonly billIdsByVendor = new Map<string, Map<string, Set<string>>>();

  upsertBill(tenantId: string, bill: PayableBillPosition): PayableBillPosition {
    const tenantBills = this.billsByTenant.get(tenantId) ?? new Map<string, PayableBillPosition>();
    this.billsByTenant.set(tenantId, tenantBills);

    const previous = tenantBills.get(bill.bill_id);
    tenantBills.set(bill.bill_id, bill);

    const vendorIndex = this.billIdsByVendor.get(tenantId) ?? new Map<string, Set<string>>();
    this.billIdsByVendor.set(tenantId, vendorIndex);

    if (previous && previous.vendor_id !== bill.vendor_id) {
      vendorIndex.get(previous.vendor_id)?.delete(previous.bill_id);
    }

    const vendorBillIds = vendorIndex.get(bill.vendor_id) ?? new Set<string>();
    vendorIndex.set(bill.vendor_id, vendorBillIds);
    vendorBillIds.add(bill.bill_id);

    return bill;
  }

  findBill(tenantId: string, billId: string): PayableBillPosition | null {
    return this.billsByTenant.get(tenantId)?.get(billId) ?? null;
  }

  listBillsByVendor(tenantId: string, vendorId: string): PayableBillPosition[] {
    const tenantBills = this.billsByTenant.get(tenantId);
    const vendorBillIds = this.billIdsByVendor.get(tenantId)?.get(vendorId);

    if (!tenantBills || !vendorBillIds || vendorBillIds.size === 0) {
      return [];
    }

    const bills: PayableBillPosition[] = [];
    for (const billId of vendorBillIds) {
      const bill = tenantBills.get(billId);
      if (bill) {
        bills.push(bill);
      }
    }

    return bills;
  }
}
