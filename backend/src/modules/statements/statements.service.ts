import { Injectable } from '@nestjs/common';
import { CustomersService } from '../customers/customers.service';
import { InvoicesService } from '../invoices/invoices.service';
import { PaymentsService } from '../payments/payments.service';

interface StatementEntry {
  kind: 'invoice' | 'payment_allocation' | 'payment_unallocated';
  transaction_id: string;
  effective_at: string;
  created_at: string;
  description: string;
  debit_minor: number;
  credit_minor: number;
  ar_delta_minor: number;
  running_balance_minor: number;
  trace: {
    source: 'invoice' | 'payment';
    source_id: string;
    linked_invoice_id: string | null;
    linked_payment_id: string | null;
  };
}

@Injectable()
export class StatementsService {
  constructor(
    private readonly customersService: CustomersService,
    private readonly invoicesService: InvoicesService,
    private readonly paymentsService: PaymentsService
  ) {}

  getCustomerStatement(tenantId: string, customerId: string): {
    customer_id: string;
    entries: StatementEntry[];
    opening_balance_minor: number;
    closing_balance_minor: number;
  } {
    this.customersService.getCustomer(tenantId, customerId);

    const invoices = this.invoicesService
      .listInvoices(tenantId)
      .filter((invoice) => invoice.customer_id === customerId)
      .filter((invoice) => invoice.status !== 'draft' && invoice.status !== 'void');

    const payments = this.paymentsService
      .listPayments(tenantId)
      .filter((payment) => payment.customer_id === customerId)
      .filter((payment) => payment.status !== 'void');

    const rows: Omit<StatementEntry, 'running_balance_minor'>[] = [];

    for (const invoice of invoices) {
      rows.push({
        kind: 'invoice',
        transaction_id: invoice.id,
        effective_at: invoice.issue_date ?? invoice.created_at.slice(0, 10),
        created_at: invoice.created_at,
        description: `Invoice ${invoice.invoice_number}`,
        debit_minor: invoice.total_minor,
        credit_minor: 0,
        ar_delta_minor: invoice.total_minor,
        trace: {
          source: 'invoice',
          source_id: invoice.id,
          linked_invoice_id: invoice.id,
          linked_payment_id: null
        }
      });
    }

    for (const payment of payments) {
      if (payment.allocations.length === 0) {
        rows.push({
          kind: 'payment_unallocated',
          transaction_id: payment.id,
          effective_at: payment.payment_date,
          created_at: payment.created_at,
          description: `Payment ${payment.payment_reference ?? payment.id} (unallocated)`,
          debit_minor: 0,
          credit_minor: 0,
          ar_delta_minor: 0,
          trace: {
            source: 'payment',
            source_id: payment.id,
            linked_invoice_id: null,
            linked_payment_id: payment.id
          }
        });
        continue;
      }

      for (const allocation of payment.allocations) {
        rows.push({
          kind: 'payment_allocation',
          transaction_id: allocation.id,
          effective_at: allocation.allocation_date,
          created_at: allocation.created_at,
          description: `Payment allocation ${payment.payment_reference ?? payment.id}`,
          debit_minor: 0,
          credit_minor: allocation.allocated_minor,
          ar_delta_minor: -allocation.allocated_minor,
          trace: {
            source: 'payment',
            source_id: payment.id,
            linked_invoice_id: allocation.invoice_id,
            linked_payment_id: payment.id
          }
        });
      }
    }

    const sortedRows = rows
      .sort((left, right) => {
        const byDate = left.effective_at.localeCompare(right.effective_at);
        if (byDate !== 0) {
          return byDate;
        }

        const byCreatedAt = left.created_at.localeCompare(right.created_at);
        if (byCreatedAt !== 0) {
          return byCreatedAt;
        }

        if (left.kind === right.kind) {
          return left.transaction_id.localeCompare(right.transaction_id);
        }

        if (left.kind === 'invoice') {
          return -1;
        }

        if (right.kind === 'invoice') {
          return 1;
        }

        return left.transaction_id.localeCompare(right.transaction_id);
      })


    let runningBalance = 0;
    const entries = sortedRows.map((row) => {
      runningBalance += row.ar_delta_minor;
      return {
        ...row,
        running_balance_minor: runningBalance
      };
    });

    const closingBalance = runningBalance;
    const expectedArFromTransactions =
      invoices.reduce((sum, invoice) => sum + invoice.total_minor, 0) -
      payments.reduce((sum, payment) => sum + payment.allocations.reduce((inner, allocation) => inner + allocation.allocated_minor, 0), 0);

    if (closingBalance !== expectedArFromTransactions) {
      throw new Error('Statement trace mismatch: running balance does not reconcile to ledger-traceable AR');
    }

    return {
      customer_id: customerId,
      entries,
      opening_balance_minor: 0,
      closing_balance_minor: closingBalance
    };
  }
}
