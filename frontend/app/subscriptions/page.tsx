import { subscriptionsWorkflowSchema } from '@billing-platform/renderer/schemas/subscriptions_workflow.schema';
import { apiClient } from '@/lib/api-client';
import { renderSchema } from '@/lib/renderer-provider';

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

  return renderSchema(subscriptionsWorkflowSchema, data);
}
