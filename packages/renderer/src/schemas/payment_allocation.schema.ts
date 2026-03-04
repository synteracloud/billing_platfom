import type { RendererSchema } from '../types/renderer-schema';

export const paymentAllocationSchema: RendererSchema = {
  id: 'payment-allocation',
  type: 'flow',
  layout: {
    id: 'payment-allocation-layout',
    type: 'page',
    regions: [
      { id: 'payment-allocation-header', type: 'section', component: 'pageHeader', props: { title: 'Payment Allocation' } },
      { id: 'allocation-payment-summary', type: 'card', component: 'card', props: { region: 'payment_summary_region' } },
      { id: 'allocation-invoice-table', type: 'section', component: 'card', props: { region: 'open_invoices_region' } },
      { id: 'allocation-controls', type: 'panel', component: 'panel', props: { region: 'allocation_controls_region' } },
    ],
  },
  components: [
    { id: 'open-invoices-table', type: 'table', component: 'table', props: { binding: 'payments.open_invoices' } },
    { id: 'allocation-form', type: 'form', component: 'form', props: { binding: 'payments.allocation' } },
  ],
  dataBindings: {
    paymentRecord: { path: 'payments.selected', source: 'state', required: true },
    openInvoices: { path: 'invoices.open', source: 'api', required: true },
    allocationDraft: { path: 'payments.allocation', source: 'state' },
  },
};
