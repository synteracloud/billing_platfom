import { invoicesWorkflowSchema } from '@billing-platform/renderer/schemas/invoices_workflow.schema';
import { apiClient } from '@/lib/api-client';
import { renderSchema } from '@/lib/renderer-provider';

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

  return renderSchema(invoicesWorkflowSchema, data);
}
