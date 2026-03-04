import { paymentsSchema } from '@billing-platform/renderer/schemas/payments.schema';
import { apiClient } from '@/lib/api-client';
import { renderSchema } from '@/lib/renderer-provider';

const fetchPaymentsData = async (): Promise<Record<string, unknown>> => {
  try {
    return await apiClient.get<Record<string, unknown>>('/payments');
  } catch {
    return { payments: { list: [], filters: {}, allocation: {} } };
  }
};

export default async function PaymentsPage() {
  const schema = paymentsSchema;
  const data = await fetchPaymentsData();

  return renderSchema(schema, data);
}
