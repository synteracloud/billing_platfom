import { productsSchema } from '@billing-platform/renderer/schemas/products.schema';
import { apiClient } from '@/lib/api-client';
import { renderSchema } from '@/lib/renderer-provider';

const fetchProductsData = async (): Promise<Record<string, unknown>> => {
  try {
    return await apiClient.get<Record<string, unknown>>('/products');
  } catch {
    return { products: { list: [], filters: {}, editor: {} } };
  }
};

export default async function ProductsPage() {
  const schema = productsSchema;
  const data = await fetchProductsData();

  return renderSchema(schema, data);
}
