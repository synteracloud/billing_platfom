import { paymentsWorkflowSchema } from '@billing-platform/renderer/schemas/payments_workflow.schema';
import { apiClient } from '@/lib/api-client';
import { renderSchema } from '@/lib/renderer-provider';

const fallbackData: Record<string, unknown> = {
  payments: {
    list: [],
    filters: {},
    record: {},
    selected: {},
    allocation: {
      entries: [],
      action: 'confirm_allocation',
    },
  },
  payment: {
    allocation: {
      entries: [],
      action: 'confirm_allocation',
    },
  },
  invoices: {
    open: [],
  },
};

const fetchPaymentsData = async (): Promise<Record<string, unknown>> => {
  try {
    const response = await apiClient.get<Record<string, unknown>>('/payments');

    return {
      ...fallbackData,
      ...response,
      payments: {
        ...(fallbackData.payments as Record<string, unknown>),
        ...((response.payments as Record<string, unknown> | undefined) ?? {}),
      },
      payment: {
        ...(fallbackData.payment as Record<string, unknown>),
        ...((response.payment as Record<string, unknown> | undefined) ?? {}),
      },
      invoices: {
        ...(fallbackData.invoices as Record<string, unknown>),
        ...((response.invoices as Record<string, unknown> | undefined) ?? {}),
      },
    };
  } catch {
    return fallbackData;
  }
};

export default async function PaymentsPage() {
  const data = await fetchPaymentsData();

  return renderSchema(paymentsWorkflowSchema, data);
}
