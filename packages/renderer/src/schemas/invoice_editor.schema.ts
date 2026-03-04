import type { RendererSchema } from '../types/renderer-schema';

export const invoiceEditorSchema: RendererSchema = {
  id: 'invoice-editor',
  type: 'flow',
  layout: {
    id: 'invoice-editor-layout',
    type: 'page',
    regions: [
      { id: 'invoice-editor-header', type: 'section', component: 'pageHeader', props: { title: 'Invoice Editor' } },
      { id: 'invoice-editor-body', type: 'grid', component: 'grid', props: { region: 'invoice_form_region' } },
      { id: 'invoice-line-items', type: 'section', component: 'card', props: { region: 'line_items_region' } },
      { id: 'invoice-summary-panel', type: 'panel', component: 'panel', props: { region: 'totals_summary_region' } },
    ],
  },
  components: [
    { id: 'invoice-header-form', type: 'form', component: 'form', props: { binding: 'invoices.editor.header' } },
    { id: 'invoice-lines-form', type: 'form', component: 'form', props: { binding: 'invoices.editor.lines' } },
  ],
  dataBindings: {
    invoiceDraft: { path: 'invoices.editor', source: 'state', required: true },
    customerOptions: { path: 'customers.list', source: 'api' },
    productOptions: { path: 'products.list', source: 'api' },
  },
};
