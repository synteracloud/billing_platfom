import { Injectable } from '@nestjs/common';

export interface ReceivableInvoicePosition {
  invoice_id: string;
  customer_id: string;
  currency_code: string;
  issue_date: string;
  due_date: string | null;
  total_minor: number;
  open_amount_minor: number;
  paid_amount_minor: number;
  status: 'open' | 'closed' | 'void';
  updated_at: string;
}

export interface CustomerFinancialState {
  customer_id: string;
  currency_code: string;
  total_open_amount_minor: number;
  total_paid_amount_minor: number;
  invoice_count_open: number;
  invoice_count_total: number;
  invoices: ReceivableInvoicePosition[];
  updated_at: string | null;
}

@Injectable()
export class ArRepository {
  private readonly positions = new Map<string, Map<string, ReceivableInvoicePosition>>();

  upsertInvoice(tenantId: string, position: ReceivableInvoicePosition): ReceivableInvoicePosition {
    const tenantPositions = this.positions.get(tenantId) ?? new Map<string, ReceivableInvoicePosition>();
    this.positions.set(tenantId, tenantPositions);
    tenantPositions.set(position.invoice_id, position);
    return position;
  }

  findInvoice(tenantId: string, invoiceId: string): ReceivableInvoicePosition | null {
    const tenantPositions = this.positions.get(tenantId);
    if (!tenantPositions) {
      return null;
    }

    return tenantPositions.get(invoiceId) ?? null;
  }


  listInvoices(tenantId: string): ReceivableInvoicePosition[] {
    const tenantPositions = this.positions.get(tenantId);
    if (!tenantPositions) {
      return [];
    }

    return Array.from(tenantPositions.values());
  }
  listInvoicesByCustomer(tenantId: string, customerId: string): ReceivableInvoicePosition[] {
    const tenantPositions = this.positions.get(tenantId);
    if (!tenantPositions) {
      return [];
    }

    return Array.from(tenantPositions.values()).filter((position) => position.customer_id === customerId);
  }
}
