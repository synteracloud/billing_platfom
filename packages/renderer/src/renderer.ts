import { createElement, type ReactElement } from 'react';
import { createComponentRegistry, type ComponentRegistry } from './registry';
import type { ComponentSchema } from './types/component-schema';
import type { RendererSchema } from './types/renderer-schema';
import { renderEntity } from './renderers/entity-renderer';
import { renderForm } from './renderers/form-renderer';
import { renderLayout } from './renderers/layout-renderer';
import { renderTable } from './renderers/table-renderer';
import {
  createRendererContext,
  type RendererContext,
  type RendererContextOptions,
} from './utils/renderer-context';
import { validateRendererSchema } from './utils/schema-validator';

interface RenderEngineOptions extends RendererContextOptions {
  registry?: ComponentRegistry;
}

const renderComponentNode = (
  component: ComponentSchema,
  context: RendererContext,
  registry: ComponentRegistry,
): ReactElement => {
  context.registerRenderTrace(component.id, component.type);

  if (component.type === 'form') {
    return renderForm(component, context, registry);
  }

  if (component.type === 'table') {
    return renderTable(component, context, registry);
  }

  if (component.type === 'entity') {
    return renderEntity(component, context, registry);
  }

  const mappedType = component.component ?? component.type;
  const mappedComponent = registry.get(mappedType);

  if (!mappedComponent) {
    throw new Error(`Missing registry component for schema type \"${mappedType}\".`);
  }

  const children = (component.children ?? []).map((child) =>
    renderComponentNode(child, context, registry),
  );

  return createElement(mappedComponent, {
    key: component.id,
    schemaId: component.id,
    tokenScope: component.type,
    responsive: component.responsive,
    ...component.props,
    children,
  });
};

export const renderSchema = (
  schema: RendererSchema,
  options: RenderEngineOptions = {},
): ReactElement => {
  const validated = validateRendererSchema(schema);
  const registry = options.registry ?? createComponentRegistry();
  const context = createRendererContext(options);

  const renderedLayout = renderLayout(validated.layout, context, registry);
  const renderedComponents = validated.components.map((component) =>
    renderComponentNode(component, context, registry),
  );

  return createElement('div', {
    'data-renderer-root': validated.id,
    'data-schema-type': validated.type,
    children: [renderedLayout, ...renderedComponents],
  });
};
