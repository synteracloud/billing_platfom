import type { RendererSchema } from '../types/renderer-schema';

export const productsSchema: RendererSchema = {
  id: 'products',
  type: 'screen',
  layout: {
    id: 'products-layout',
    type: 'page',
    regions: [
      { id: 'products-header', type: 'section', component: 'pageHeader', props: { title: 'Products' } },
      { id: 'products-actions', type: 'section', component: 'stack', props: { region: 'primary_action_region' } },
      { id: 'products-table', type: 'section', component: 'card', props: { region: 'products_table_region' } },
      { id: 'products-drawer', type: 'drawer', component: 'drawer', props: { region: 'product_editor_region' } },
    ],
  },
  components: [
    { id: 'products-list', type: 'table', component: 'table', props: { binding: 'products.list' } },
    { id: 'products-editor', type: 'form', component: 'form', props: { binding: 'products.editor' } },
  ],
  dataBindings: {
    productsList: { path: 'products.list', source: 'api', required: true },
    productEditor: { path: 'products.editor', source: 'state' },
  },
};
