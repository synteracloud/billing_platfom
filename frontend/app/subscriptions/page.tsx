import { subscriptionsSchema } from '@billing-platform/renderer/schemas/subscriptions.schema';
import { apiClient } from '@/lib/api-client';
import { renderSchema } from '@/lib/renderer-provider';

const fetchSubscriptionsData = async (): Promise<Record<string, unknown>> => {
  try {
    return await apiClient.get<Record<string, unknown>>('/subscriptions');
  } catch {
    return { subscriptions: { list: [], filters: {}, editor: {} } };
  }
};

export default async function SubscriptionsPage() {
  const schema = subscriptionsSchema;
  const data = await fetchSubscriptionsData();

  return renderSchema(schema, data);
}
