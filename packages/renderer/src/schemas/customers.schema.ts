import type { RendererSchema } from '../types/renderer-schema';

export const customersSchema: RendererSchema = {
  id: 'customers',
  type: 'screen',
  layout: {
    id: 'customers-layout',
    type: 'page',
    regions: [
      { id: 'customers-header', type: 'section', component: 'pageHeader', props: { title: 'Customers' } },
      { id: 'customers-actions', type: 'section', component: 'stack', props: { region: 'primary_action_region' } },
      { id: 'customers-table', type: 'section', component: 'card', props: { region: 'customers_table_region' } },
      { id: 'customers-detail-drawer', type: 'drawer', component: 'drawer', props: { region: 'customer_editor_region' } },
    ],
  },
  components: [
    { id: 'customers-list', type: 'table', component: 'table', props: { binding: 'customers.list' } },
    { id: 'customers-editor', type: 'form', component: 'form', props: { binding: 'customers.editor' } },
  ],
  dataBindings: {
    customersList: { path: 'customers.list', source: 'api', required: true },
    customersFilters: { path: 'customers.filters', source: 'state' },
    customerEditor: { path: 'customers.editor', source: 'state' },
  },
};
