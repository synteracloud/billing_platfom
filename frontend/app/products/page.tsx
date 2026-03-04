import { productsSchema } from '@billing-platform/renderer/schemas/products.schema';
import { apiClient } from '@/lib/api-client';
import { renderSchema } from '@/lib/renderer-provider';

const fallbackProductsData: Record<string, unknown> = {
  products: {
    list: [],
    filters: {},
    editor: {},
  },
};

const fetchProducts = async (): Promise<Record<string, unknown>> => {
  try {
    return await apiClient.get<Record<string, unknown>>('/products');
  } catch {
    return fallbackProductsData;
  }
};

export default async function ProductsPage() {
  const schema = productsSchema;
  const data = await fetchProducts();

  return renderSchema(schema, data);
}
