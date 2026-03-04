import { invoiceEditorSchema } from '@billing-platform/renderer/schemas/invoice_editor.schema';
import { invoicesSchema } from '@billing-platform/renderer/schemas/invoices.schema';
import type { RendererSchema } from '@billing-platform/renderer/types/renderer-schema';
import { apiClient } from '@/lib/api-client';
import { renderSchema } from '@/lib/renderer-provider';

const invoicesPageSchema: RendererSchema = {
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

const fallbackData: Record<string, unknown> = {
  invoices: {
    list: [],
    filters: {},
    editor: {
      header: {},
      lines: [],
      totals: {},
      actions: ['save_draft', 'issue_invoice', 'send_invoice'],
    },
  },
  invoice: {
    editor: {
      header: {},
      lines: [],
      totals: {},
      actions: ['save_draft', 'issue_invoice', 'send_invoice'],
    },
  },
};

const fetchInvoicesData = async (): Promise<Record<string, unknown>> => {
  try {
    const response = await apiClient.get<Record<string, unknown>>('/invoices');

    return {
      ...fallbackData,
      ...response,
      invoices: {
        ...(fallbackData.invoices as Record<string, unknown>),
        ...((response.invoices as Record<string, unknown> | undefined) ?? {}),
      },
      invoice: {
        ...(fallbackData.invoice as Record<string, unknown>),
        ...((response.invoice as Record<string, unknown> | undefined) ?? {}),
      },
    };
  } catch {
    return fallbackData;
  }
};

export default async function InvoicesPage() {
  const data = await fetchInvoicesData();

  return renderSchema(invoicesPageSchema, data);
}
