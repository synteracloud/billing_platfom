import { paymentAllocationSchema } from '@billing-platform/renderer/schemas/payment_allocation.schema';
import { paymentsSchema } from '@billing-platform/renderer/schemas/payments.schema';
import type { RendererSchema } from '@billing-platform/renderer/types/renderer-schema';
import { apiClient } from '@/lib/api-client';
import { renderSchema } from '@/lib/renderer-provider';

const paymentsPageSchema: RendererSchema = {
  ...paymentsSchema,
  id: 'payments-workflow',
  layout: {
    ...paymentsSchema.layout,
    regions: [...paymentsSchema.layout.regions, ...paymentAllocationSchema.layout.regions],
  },
  components: [
    {
      id: 'payments-list',
      type: 'table',
      component: 'table',
      props: {
        rowsBinding: 'payments.list',
        columns: ['paymentNumber', 'customer', 'paymentDate', 'amount', 'method', 'status'],
      },
    },
    ...paymentAllocationSchema.components,
  ],
  dataBindings: {
    ...paymentsSchema.dataBindings,
    ...paymentAllocationSchema.dataBindings,
  },
};

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

  return renderSchema(paymentsPageSchema, data);
}
