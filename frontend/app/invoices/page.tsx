import { invoicesSchema } from '@billing-platform/renderer/schemas/invoices.schema';
import { apiClient } from '@/lib/api-client';
import { renderSchema } from '@/lib/renderer-provider';

const fetchInvoicesData = async (): Promise<Record<string, unknown>> => {
  try {
    return await apiClient.get<Record<string, unknown>>('/invoices');
  } catch {
    return { invoices: { list: [], filters: {}, editor: {} } };
  }
};

export default async function InvoicesPage() {
  const schema = invoicesSchema;
  const data = await fetchInvoicesData();

  return renderSchema(schema, data);
}
