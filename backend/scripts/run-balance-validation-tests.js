const assert = require('node:assert/strict');
const { BadRequestException } = require('@nestjs/common');

class InvoicesRepository {
  constructor() { this.invoices = new Map(); }
  listAll() { return [...this.invoices.values()].map((invoice) => JSON.parse(JSON.stringify(invoice))); }
}

class PaymentsRepository {
  constructor() { this.payments = new Map(); this.byPayment = new Map(); this.byInvoice = new Map(); }
  listAll() { return [...this.payments.values()].map((payment) => JSON.parse(JSON.stringify(payment))); }
  listAllocationsByPayment(_tenantId, paymentId) { return (this.byPayment.get(paymentId) ?? []).map((v) => JSON.parse(JSON.stringify(v))); }
  listAllocationsByInvoice(_tenantId, invoiceId) { return (this.byInvoice.get(invoiceId) ?? []).map((v) => JSON.parse(JSON.stringify(v))); }
}

class FinancialStateValidator {
  constructor(invoicesRepository, paymentsRepository) { this.invoicesRepository = invoicesRepository; this.paymentsRepository = paymentsRepository; }
  validate() {
    const payments = this.paymentsRepository.listAll();
    for (const payment of payments) {
      for (const [label, value] of [['payment.amount_received_minor', payment.amount_received_minor], ['payment.allocated_minor', payment.allocated_minor], ['payment.unallocated_minor', payment.unallocated_minor]]) {
        if (!Number.isFinite(value) || value < 0) throw new BadRequestException(`${label}:${payment.id} must be greater than or equal to 0`);
      }
      const paymentAllocations = this.paymentsRepository.listAllocationsByPayment(payment.tenant_id, payment.id);
      const paymentTotal = paymentAllocations.reduce((sum, allocation) => {
        if (!Number.isFinite(allocation.allocated_minor) || allocation.allocated_minor < 0) throw new BadRequestException(`payment_allocation.allocated_minor:${allocation.id} must be greater than or equal to 0`);
        return sum + allocation.allocated_minor;
      }, 0);
      if (payment.allocated_minor !== paymentTotal) throw new BadRequestException(`Payment allocation imbalance detected for payment ${payment.id}`);
      if (payment.amount_received_minor !== payment.allocated_minor + payment.unallocated_minor) throw new BadRequestException(`Payment balance mismatch detected for payment ${payment.id}`);
    }
    const invoices = this.invoicesRepository.listAll();
    for (const invoice of invoices) {
      for (const [label, value] of [['invoice.subtotal_minor', invoice.subtotal_minor], ['invoice.tax_minor', invoice.tax_minor], ['invoice.discount_minor', invoice.discount_minor], ['invoice.total_minor', invoice.total_minor], ['invoice.amount_paid_minor', invoice.amount_paid_minor], ['invoice.amount_due_minor', invoice.amount_due_minor]]) {
        if (!Number.isFinite(value) || value < 0) throw new BadRequestException(`${label}:${invoice.id} must be greater than or equal to 0`);
      }
      const invoiceAllocations = this.paymentsRepository.listAllocationsByInvoice(invoice.tenant_id, invoice.id);
      const invoiceTotal = invoiceAllocations.reduce((sum, allocation) => {
        if (!Number.isFinite(allocation.allocated_minor) || allocation.allocated_minor < 0) throw new BadRequestException(`payment_allocation.allocated_minor:${allocation.id} must be greater than or equal to 0`);
        return sum + allocation.allocated_minor;
      }, 0);
      if (invoice.amount_paid_minor !== invoiceTotal) throw new BadRequestException(`Invoice payment imbalance detected for invoice ${invoice.id}`);
      if (invoice.amount_paid_minor > invoice.total_minor) throw new BadRequestException(`Invoice overpayment state detected for invoice ${invoice.id}`);
      if (invoice.amount_due_minor !== invoice.total_minor - invoice.amount_paid_minor) throw new BadRequestException(`Invoice due balance mismatch detected for invoice ${invoice.id}`);
    }
  }
}

class FinancialTransactionManager {
  constructor() { this.active = null; }
  async wrapper(fn, participants) {
    this.active = { depth: 1, rolledBack: false, snapshots: new Map(), validators: new Map() };
    for (const participant of participants) {
      this.active.snapshots.set(participant.key, { restore: participant.restore, value: participant.snapshot() });
      if (participant.validate) this.active.validators.set(participant.key, participant.validate);
    }
    try {
      const result = await fn();
      for (const validator of this.active.validators.values()) validator();
      this.active = null;
      return result;
    } catch (error) {
      if (this.active && !this.active.rolledBack) {
        this.active.rolledBack = true;
        for (const snapshot of this.active.snapshots.values()) snapshot.restore(snapshot.value);
      }
      this.active = null;
      throw error;
    }
  }
}

function makeParticipants(invoicesRepository, paymentsRepository, validator) {
  return [
    { key: 'invoices', snapshot: () => new Map(invoicesRepository.invoices), restore: (snapshot) => { invoicesRepository.invoices = new Map(snapshot); } },
    { key: 'payments', snapshot: () => ({ payments: new Map(paymentsRepository.payments), byPayment: new Map(paymentsRepository.byPayment), byInvoice: new Map(paymentsRepository.byInvoice) }), restore: (snapshot) => { paymentsRepository.payments = new Map(snapshot.payments); paymentsRepository.byPayment = new Map(snapshot.byPayment); paymentsRepository.byInvoice = new Map(snapshot.byInvoice); } },
    { key: 'financial-state-validator', snapshot: () => null, restore: () => undefined, validate: () => validator.validate() }
  ];
}

(async () => {
  {
    const invoicesRepository = new InvoicesRepository();
    const paymentsRepository = new PaymentsRepository();
    const validator = new FinancialStateValidator(invoicesRepository, paymentsRepository);
    const manager = new FinancialTransactionManager();

    invoicesRepository.invoices.set('inv-1', { id: 'inv-1', tenant_id: 't-1', subtotal_minor: 100, tax_minor: 0, discount_minor: 0, total_minor: 100, amount_paid_minor: 0, amount_due_minor: 100 });
    paymentsRepository.payments.set('pay-1', { id: 'pay-1', tenant_id: 't-1', amount_received_minor: 100, allocated_minor: 0, unallocated_minor: 100 });

    await assert.rejects(
      () => manager.wrapper(async () => {
        paymentsRepository.payments.set('pay-1', { id: 'pay-1', tenant_id: 't-1', amount_received_minor: 100, allocated_minor: 80, unallocated_minor: 20 });
        paymentsRepository.byPayment.set('pay-1', [{ id: 'alloc-1', tenant_id: 't-1', payment_id: 'pay-1', invoice_id: 'inv-1', allocated_minor: 70 }]);
        paymentsRepository.byInvoice.set('inv-1', [{ id: 'alloc-1', tenant_id: 't-1', payment_id: 'pay-1', invoice_id: 'inv-1', allocated_minor: 70 }]);
        invoicesRepository.invoices.set('inv-1', { id: 'inv-1', tenant_id: 't-1', subtotal_minor: 100, tax_minor: 0, discount_minor: 0, total_minor: 100, amount_paid_minor: 70, amount_due_minor: 30 });
      }, makeParticipants(invoicesRepository, paymentsRepository, validator)),
      (error) => error instanceof BadRequestException && error.message.includes('Payment allocation imbalance detected')
    );

    assert.equal(paymentsRepository.payments.get('pay-1').allocated_minor, 0);
    assert.equal(paymentsRepository.byPayment.size, 0);
  }

  {
    const invoicesRepository = new InvoicesRepository();
    const paymentsRepository = new PaymentsRepository();
    const validator = new FinancialStateValidator(invoicesRepository, paymentsRepository);
    const manager = new FinancialTransactionManager();

    invoicesRepository.invoices.set('inv-2', { id: 'inv-2', tenant_id: 't-1', subtotal_minor: 100, tax_minor: 0, discount_minor: 0, total_minor: 100, amount_paid_minor: 0, amount_due_minor: 100 });
    paymentsRepository.payments.set('pay-2', { id: 'pay-2', tenant_id: 't-1', amount_received_minor: 100, allocated_minor: 0, unallocated_minor: 100 });

    await assert.rejects(
      () => manager.wrapper(async () => {
        paymentsRepository.payments.set('pay-2', { id: 'pay-2', tenant_id: 't-1', amount_received_minor: 100, allocated_minor: 100, unallocated_minor: 0 });
        paymentsRepository.byPayment.set('pay-2', [{ id: 'alloc-2', tenant_id: 't-1', payment_id: 'pay-2', invoice_id: 'inv-2', allocated_minor: 100 }]);
        paymentsRepository.byInvoice.set('inv-2', [{ id: 'alloc-2', tenant_id: 't-1', payment_id: 'pay-2', invoice_id: 'inv-2', allocated_minor: 100 }]);
        invoicesRepository.invoices.set('inv-2', { id: 'inv-2', tenant_id: 't-1', subtotal_minor: 100, tax_minor: 0, discount_minor: 0, total_minor: 100, amount_paid_minor: 100, amount_due_minor: -1 });
      }, makeParticipants(invoicesRepository, paymentsRepository, validator)),
      (error) => error instanceof BadRequestException && error.message.includes('invoice.amount_due_minor:inv-2')
    );

    assert.equal(invoicesRepository.invoices.get('inv-2').amount_due_minor, 100);
  }

  console.log('balance validation tests passed');
})().catch((error) => {
  console.error(error);
  process.exit(1);
});
