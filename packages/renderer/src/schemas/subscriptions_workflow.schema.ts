import type { RendererSchema } from '../types/renderer-schema';
import { subscriptionsSchema } from './subscriptions.schema';

export const subscriptionsWorkflowSchema: RendererSchema = {
  ...subscriptionsSchema,
  id: 'subscriptions-workflow',
  components: [
    {
      id: 'subscriptions-list',
      type: 'table',
      component: 'table',
      props: {
        rowsBinding: 'subscriptions.list',
        columns: [
          'customer',
          'planName',
          'amount',
          'billingInterval',
          'nextBillingDate',
          'status',
          'actions',
        ],
      },
    },
    ...subscriptionsSchema.components.filter((component) => component.id !== 'subscriptions-list'),
  ],
};
