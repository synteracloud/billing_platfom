import type { RendererSchema } from '../types/renderer-schema';

export const dashboardSchema: RendererSchema = {
  id: 'dashboard',
  type: 'screen',
  layout: {
    id: 'dashboard-layout',
    type: 'page',
    regions: [
      { id: 'dashboard-header', type: 'section', component: 'pageHeader', props: { title: 'Dashboard' } },
      { id: 'dashboard-metrics', type: 'grid', component: 'grid', props: { region: 'metrics_row_region' } },
      { id: 'dashboard-analytics', type: 'grid', component: 'grid', props: { region: 'analytics_region' } },
      { id: 'dashboard-operational', type: 'grid', component: 'grid', props: { region: 'operational_tables_region' } },
    ],
  },
  components: [
    { id: 'metric-revenue', type: 'card', component: 'statCard', props: { label: 'Revenue Today', binding: 'dashboard.metrics.revenue_today' } },
    { id: 'metric-outstanding', type: 'card', component: 'statCard', props: { label: 'Outstanding Balance', binding: 'dashboard.metrics.outstanding_balance' } },
    { id: 'recent-invoices', type: 'table', component: 'table', props: { binding: 'dashboard.recent_invoices' } },
    { id: 'recent-payments', type: 'table', component: 'table', props: { binding: 'dashboard.recent_payments' } },
  ],
  dataBindings: {
    metrics: { path: 'dashboard.metrics', source: 'api', required: true },
    recentInvoices: { path: 'dashboard.recent_invoices', source: 'api' },
    recentPayments: { path: 'dashboard.recent_payments', source: 'api' },
  },
};
