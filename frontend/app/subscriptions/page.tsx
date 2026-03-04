import { subscriptionsSchema } from '@billing-platform/renderer/schemas/subscriptions.schema';
import type { RendererSchema } from '@billing-platform/renderer/types/renderer-schema';
import { apiClient } from '@/lib/api-client';
import { renderSchema } from '@/lib/renderer-provider';

const subscriptionsPageSchema: RendererSchema = {
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

const fallbackData: Record<string, unknown> = {
  subscriptions: {
    list: [],
    filters: {},
    editor: {},
  },
};

const fetchSubscriptionsData = async (): Promise<Record<string, unknown>> => {
  try {
    const response = await apiClient.get<Record<string, unknown>>('/subscriptions');

    return {
      ...fallbackData,
      ...response,
      subscriptions: {
        ...(fallbackData.subscriptions as Record<string, unknown>),
        ...((response.subscriptions as Record<string, unknown> | undefined) ?? {}),
      },
    };
  } catch {
    return fallbackData;
  }
};

export default async function SubscriptionsPage() {
  const data = await fetchSubscriptionsData();

  return renderSchema(subscriptionsPageSchema, data);
}
