import type { RendererSchema } from '../types/renderer-schema';

export const paymentsSchema: RendererSchema = {
  id: 'payments',
  type: 'screen',
  layout: {
    id: 'payments-layout',
    type: 'page',
    regions: [
      { id: 'payments-header', type: 'section', component: 'pageHeader', props: { title: 'Payments' } },
      { id: 'payments-actions', type: 'section', component: 'stack', props: { region: 'primary_action_region' } },
      { id: 'payments-list-region', type: 'section', component: 'card', props: { region: 'payments_table_region' } },
      { id: 'payment-record-modal', type: 'drawer', component: 'modal', props: { region: 'record_payment_region' } },
    ],
  },
  components: [
    { id: 'payments-list', type: 'table', component: 'table', props: { binding: 'payments.list' } },
    { id: 'payment-record-form', type: 'form', component: 'form', props: { binding: 'payments.record' } },
  ],
  dataBindings: {
    paymentsList: { path: 'payments.list', source: 'api', required: true },
    paymentRecordForm: { path: 'payments.record', source: 'state' },
  },
};
