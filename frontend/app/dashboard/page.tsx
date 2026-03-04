import { dashboardSchema } from '@billing-platform/renderer/schemas/dashboard.schema';
import { apiClient } from '@/lib/api-client';
import { renderSchema } from '@/lib/renderer-provider';

const fetchDashboardData = async (): Promise<Record<string, unknown>> => {
  try {
    return await apiClient.get<Record<string, unknown>>('/dashboard');
  } catch {
    return { dashboard: { metrics: {}, recent_invoices: [], recent_payments: [] } };
  }
};

export default async function DashboardPage() {
  const schema = dashboardSchema;
  const data = await fetchDashboardData();

  return renderSchema(schema, data);
}
