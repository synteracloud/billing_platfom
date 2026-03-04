import { createElement, type ReactElement } from 'react';
import type { ComponentSchema } from '../types/component-schema';
import type { RendererContext } from '../utils/renderer-context';
import type { ComponentRegistry, RenderComponent } from '../registry';

const SUPPORTED_ENTITY_EDITORS = new Set([
  'customer-editor',
  'product-editor',
  'invoice-editor',
]);

export const renderEntity = (
  schema: ComponentSchema,
  context: RendererContext,
  registry: ComponentRegistry,
): ReactElement => {
  const entityComponent = registry.get('entity');

  if (!entityComponent) {
    throw new Error('No registered entity component found.');
  }

  const editorType = String(schema.props?.editorType ?? '');
  if (!SUPPORTED_ENTITY_EDITORS.has(editorType)) {
    throw new Error(
      `Unsupported entity editor \"${editorType}\". Supported editors: customer-editor, product-editor, invoice-editor.`,
    );
  }

  const entityBinding = String(schema.props?.entityBinding ?? '');

  return createElement(entityComponent as RenderComponent, {
    key: schema.id,
    schemaId: schema.id,
    tokenScope: 'entity',
    editorType,
    entity: entityBinding ? context.resolveBinding(entityBinding) : undefined,
    sections: schema.children ?? [],
  });
};
