import { dashboardSchema } from '@billing-platform/renderer/schemas/dashboard.schema';
import { apiClient } from '@/lib/api-client';
import { renderSchema } from '@/lib/renderer-provider';

const fallbackDashboardData = {
  dashboard: {
    metrics: {
      revenue_today: 0,
      outstanding_balance: 0,
      invoices_due: 0,
      active_subscriptions: 0,
    },
    revenue_trend: [],
    recent_invoices: [],
    recent_payments: [],
  },
};

const fetchDashboardData = async (): Promise<Record<string, unknown>> => {
  try {
    return await apiClient.get<Record<string, unknown>>('/dashboard/metrics');
  } catch {
    return fallbackDashboardData;
  }
};

export default async function DashboardPage() {
  const schema = dashboardSchema;
  const data = await fetchDashboardData();

  return renderSchema(schema, data);
}
