import { BadRequestException } from '@nestjs/common';
import { InvoicesRepository } from '../../modules/invoices/invoices.repository';
import { PaymentsRepository } from '../../modules/payments/payments.repository';

export class FinancialStateValidator {
  constructor(
    private readonly invoicesRepository: InvoicesRepository,
    private readonly paymentsRepository?: PaymentsRepository
  ) {}

  validate(): void {
    this.validatePayments();
    this.validateInvoices();
  }

  private validatePayments(): void {
    if (!this.paymentsRepository) {
      return;
    }

    const payments = this.paymentsRepository.listAll();

    for (const payment of payments) {
      this.requireNonNegative(payment.amount_received_minor, `payment.amount_received_minor:${payment.id}`);
      this.requireNonNegative(payment.allocated_minor, `payment.allocated_minor:${payment.id}`);
      this.requireNonNegative(payment.unallocated_minor, `payment.unallocated_minor:${payment.id}`);

      const allocationTotal = this.paymentsRepository
        .listAllocationsByPayment(payment.tenant_id, payment.id)
        .reduce((sum, allocation) => {
          this.requireNonNegative(allocation.allocated_minor, `payment_allocation.allocated_minor:${allocation.id}`);
          return sum + allocation.allocated_minor;
        }, 0);

      if (payment.allocated_minor !== allocationTotal) {
        throw new BadRequestException(`Payment allocation imbalance detected for payment ${payment.id}`);
      }

      if (payment.amount_received_minor !== payment.allocated_minor + payment.unallocated_minor) {
        throw new BadRequestException(`Payment balance mismatch detected for payment ${payment.id}`);
      }
    }
  }

  private validateInvoices(): void {
    const invoices = this.invoicesRepository.listAll();

    for (const invoice of invoices) {
      this.requireNonNegative(invoice.subtotal_minor, `invoice.subtotal_minor:${invoice.id}`);
      this.requireNonNegative(invoice.tax_minor, `invoice.tax_minor:${invoice.id}`);
      this.requireNonNegative(invoice.discount_minor, `invoice.discount_minor:${invoice.id}`);
      this.requireNonNegative(invoice.total_minor, `invoice.total_minor:${invoice.id}`);
      this.requireNonNegative(invoice.amount_paid_minor, `invoice.amount_paid_minor:${invoice.id}`);
      this.requireNonNegative(invoice.amount_due_minor, `invoice.amount_due_minor:${invoice.id}`);

      if (invoice.amount_paid_minor > invoice.total_minor) {
        throw new BadRequestException(`Invoice overpayment state detected for invoice ${invoice.id}`);
      }

      if (invoice.amount_due_minor !== invoice.total_minor - invoice.amount_paid_minor) {
        throw new BadRequestException(`Invoice due balance mismatch detected for invoice ${invoice.id}`);
      }

      if (!this.paymentsRepository) {
        continue;
      }

      const allocationTotal = this.paymentsRepository
        .listAllocationsByInvoice(invoice.tenant_id, invoice.id)
        .reduce((sum, allocation) => {
          this.requireNonNegative(allocation.allocated_minor, `payment_allocation.allocated_minor:${allocation.id}`);
          return sum + allocation.allocated_minor;
        }, 0);

      if (invoice.amount_paid_minor !== allocationTotal) {
        throw new BadRequestException(`Invoice payment imbalance detected for invoice ${invoice.id}`);
      }
    }
  }

  private requireNonNegative(value: number, label: string): void {
    if (!Number.isFinite(value) || value < 0) {
      throw new BadRequestException(`${label} must be greater than or equal to 0`);
    }
  }
}
