import { customersSchema } from '@billing-platform/renderer/schemas/customers.schema';
import { apiClient } from '@/lib/api-client';
import { renderSchema } from '@/lib/renderer-provider';

const fetchCustomersData = async (): Promise<Record<string, unknown>> => {
  try {
    return await apiClient.get<Record<string, unknown>>('/customers');
  } catch {
    return { customers: { list: [], filters: {}, editor: {} } };
  }
};

export default async function CustomersPage() {
  const schema = customersSchema;
  const data = await fetchCustomersData();

  return renderSchema(schema, data);
}
