import type { RendererSchema } from '../types/renderer-schema';
import { invoiceEditorSchema } from './invoice_editor.schema';
import { invoicesSchema } from './invoices.schema';

export const invoicesWorkflowSchema: RendererSchema = {
  ...invoicesSchema,
  id: 'invoices-workflow',
  layout: {
    ...invoicesSchema.layout,
    regions: [...invoicesSchema.layout.regions, ...invoiceEditorSchema.layout.regions],
  },
  components: [
    {
      id: 'invoices-list',
      type: 'table',
      component: 'table',
      props: {
        rowsBinding: 'invoices.list',
        columns: ['invoiceNumber', 'customer', 'issueDate', 'dueDate', 'total', 'status'],
      },
    },
    ...invoiceEditorSchema.components,
  ],
  dataBindings: {
    ...invoicesSchema.dataBindings,
    ...invoiceEditorSchema.dataBindings,
  },
};
