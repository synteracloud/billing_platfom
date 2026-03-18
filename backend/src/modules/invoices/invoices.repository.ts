import { ConflictException, Injectable } from '@nestjs/common';
import { randomUUID } from 'crypto';
import { InvoiceEntity } from './entities/invoice.entity';
import { InvoiceLineEntity } from './entities/invoice-line.entity';

@Injectable()
export class InvoicesRepository {
  private readonly invoices = new Map<string, InvoiceEntity>();
  private readonly invoiceLines = new Map<string, InvoiceLineEntity>();

  listByTenant(tenantId: string): InvoiceEntity[] {
    return [...this.invoices.values()]
      .filter((invoice) => invoice.tenant_id === tenantId)
      .sort((a, b) => b.created_at.localeCompare(a.created_at));
  }

  findById(tenantId: string, invoiceId: string): InvoiceEntity | undefined {
    const invoice = this.invoices.get(invoiceId);
    if (!invoice || invoice.tenant_id !== tenantId) {
      return undefined;
    }

    return invoice;
  }

  create(invoice: Omit<InvoiceEntity, 'id' | 'created_at' | 'updated_at'>): InvoiceEntity {
    const duplicate = [...this.invoices.values()].find(
      (existing) => existing.tenant_id === invoice.tenant_id && existing.invoice_number === invoice.invoice_number
    );
    if (duplicate) {
      throw new ConflictException('Unique constraint violation for (tenant_id, invoice_number)');
    }

    const now = new Date().toISOString();
    const created: InvoiceEntity = {
      ...invoice,
      id: randomUUID(),
      created_at: now,
      updated_at: now
    };

    this.invoices.set(created.id, created);
    return created;
  }

  update(
    tenantId: string,
    invoiceId: string,
    patch: Partial<Omit<InvoiceEntity, 'id' | 'tenant_id' | 'created_at'>>
  ): InvoiceEntity | undefined {
    const existing = this.findById(tenantId, invoiceId);
    if (!existing) {
      return undefined;
    }

    if (patch.invoice_number && patch.invoice_number !== existing.invoice_number) {
      const duplicate = [...this.invoices.values()].find(
        (invoice) => invoice.tenant_id === tenantId && invoice.invoice_number === patch.invoice_number && invoice.id !== invoiceId
      );
      if (duplicate) {
        throw new ConflictException('Unique constraint violation for (tenant_id, invoice_number)');
      }
    }

    const updated: InvoiceEntity = {
      ...existing,
      ...patch,
      updated_at: new Date().toISOString()
    };

    this.invoices.set(invoiceId, updated);
    return updated;
  }

  createLine(line: Omit<InvoiceLineEntity, 'id' | 'created_at' | 'updated_at'>): InvoiceLineEntity {
    const invoice = this.invoices.get(line.invoice_id);
    if (!invoice || invoice.tenant_id !== line.tenant_id) {
      throw new ConflictException('Foreign key violation for invoice_id');
    }

    const now = new Date().toISOString();
    const created: InvoiceLineEntity = {
      ...line,
      id: randomUUID(),
      created_at: now,
      updated_at: now
    };

    this.invoiceLines.set(created.id, created);
    return created;
  }

  listLines(tenantId: string, invoiceId: string): InvoiceLineEntity[] {
    return [...this.invoiceLines.values()]
      .filter((line) => line.tenant_id === tenantId && line.invoice_id === invoiceId)
      .sort((a, b) => a.created_at.localeCompare(b.created_at));
  }

  findLineById(tenantId: string, invoiceId: string, lineId: string): InvoiceLineEntity | undefined {
    const line = this.invoiceLines.get(lineId);
    if (!line || line.tenant_id !== tenantId || line.invoice_id !== invoiceId) {
      return undefined;
    }

    return line;
  }

  deleteLine(tenantId: string, invoiceId: string, lineId: string): boolean {
    const line = this.findLineById(tenantId, invoiceId, lineId);
    if (!line) {
      return false;
    }

    this.invoiceLines.delete(lineId);
    return true;
  }

  countByTenant(tenantId: string): number {
    return [...this.invoices.values()].filter((invoice) => invoice.tenant_id === tenantId).length;
  }

  createSnapshot(): { invoices: Map<string, InvoiceEntity>; invoiceLines: Map<string, InvoiceLineEntity> } {
    return {
      invoices: new Map([...this.invoices.entries()].map(([id, invoice]) => [id, this.clone(invoice)])),
      invoiceLines: new Map([...this.invoiceLines.entries()].map(([id, line]) => [id, this.clone(line)]))
    };
  }

  restoreSnapshot(snapshot: { invoices: Map<string, InvoiceEntity>; invoiceLines: Map<string, InvoiceLineEntity> }): void {
    this.invoices.clear();
    this.invoiceLines.clear();

    for (const [id, invoice] of snapshot.invoices.entries()) {
      this.invoices.set(id, this.clone(invoice));
    }

    for (const [id, line] of snapshot.invoiceLines.entries()) {
      this.invoiceLines.set(id, this.clone(line));
    }
  }

  private clone<T>(value: T): T {
    return JSON.parse(JSON.stringify(value)) as T;
  }
}
