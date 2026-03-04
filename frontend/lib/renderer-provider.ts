import { renderSchema as renderRendererSchema } from '@billing-platform/renderer';
import type { RendererSchema } from '@billing-platform/renderer/types/renderer-schema';

export const renderSchema = (schema: RendererSchema, data: Record<string, unknown> = {}) =>
  renderRendererSchema(schema, { data });
