import type { RendererSchema } from '../types/renderer-schema';
import { paymentAllocationSchema } from './payment_allocation.schema';
import { paymentsSchema } from './payments.schema';

export const paymentsWorkflowSchema: RendererSchema = {
  ...paymentsSchema,
  id: 'payments-workflow',
  layout: {
    ...paymentsSchema.layout,
    regions: [...paymentsSchema.layout.regions, ...paymentAllocationSchema.layout.regions],
  },
  components: [
    {
      id: 'payments-list',
      type: 'table',
      component: 'table',
      props: {
        rowsBinding: 'payments.list',
        columns: ['paymentNumber', 'customer', 'paymentDate', 'amount', 'method', 'status'],
      },
    },
    ...paymentAllocationSchema.components,
  ],
  dataBindings: {
    ...paymentsSchema.dataBindings,
    ...paymentAllocationSchema.dataBindings,
  },
};
