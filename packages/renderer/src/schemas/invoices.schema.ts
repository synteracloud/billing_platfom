import type { RendererSchema } from '../types/renderer-schema';

export const invoicesSchema: RendererSchema = {
  id: 'invoices',
  type: 'screen',
  layout: {
    id: 'invoices-layout',
    type: 'page',
    regions: [
      { id: 'invoices-header', type: 'section', component: 'pageHeader', props: { title: 'Invoices' } },
      { id: 'invoices-filters', type: 'section', component: 'panel', props: { region: 'filters_region' } },
      { id: 'invoices-list-region', type: 'section', component: 'card', props: { region: 'invoices_table_region' } },
      { id: 'invoice-preview-drawer', type: 'drawer', component: 'drawer', props: { region: 'invoice_preview_region' } },
    ],
  },
  components: [
    { id: 'invoices-list', type: 'table', component: 'table', props: { binding: 'invoices.list' } },
  ],
  dataBindings: {
    invoicesList: { path: 'invoices.list', source: 'api', required: true },
    invoiceFilters: { path: 'invoices.filters', source: 'state' },
  },
};
