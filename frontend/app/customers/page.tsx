import { customersSchema } from '@billing-platform/renderer/schemas/customers.schema';
import { apiClient } from '@/lib/api-client';
import { renderSchema } from '@/lib/renderer-provider';

const fallbackCustomersData: Record<string, unknown> = {
  customers: {
    list: [],
    filters: {},
    editor: {},
  },
};

const fetchCustomers = async (): Promise<Record<string, unknown>> => {
  try {
    return await apiClient.get<Record<string, unknown>>('/customers');
  } catch {
    return fallbackCustomersData;
  }
};

export default async function CustomersPage() {
  const schema = customersSchema;
  const data = await fetchCustomers();

  return renderSchema(schema, data);
}
