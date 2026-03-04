import { createElement, type ReactElement } from 'react';
import type { ComponentSchema } from '../types/component-schema';
import type { LayoutSchema } from '../types/layout-schema';
import type { RendererContext } from '../utils/renderer-context';
import type { ComponentRegistry, RenderComponent } from '../registry';

export const renderLayoutNode = (
  node: ComponentSchema,
  context: RendererContext,
  registry: ComponentRegistry,
): ReactElement => {
  context.registerRenderTrace(node.id, node.type);

  const componentName = node.component ?? node.type;
  const component = registry.get(componentName);

  if (!component) {
    throw new Error(`No registered component found for layout node type \"${componentName}\".`);
  }

  const childElements = (node.children ?? []).map((child) =>
    renderLayoutNode(child, context, registry),
  );

  return createElement(component as RenderComponent, {
    key: node.id,
    schemaId: node.id,
    tokenScope: 'layout',
    responsive: node.responsive,
    ...node.props,
    children: childElements,
  });
};

export const renderLayout = (
  layout: LayoutSchema,
  context: RendererContext,
  registry: ComponentRegistry,
): ReactElement => {
  const rootComponent = registry.get(layout.type);

  if (!rootComponent) {
    throw new Error(`No registered root layout component for \"${layout.type}\".`);
  }

  const regions = layout.regions.map((region) =>
    renderLayoutNode(region, context, registry),
  );

  return createElement(rootComponent as RenderComponent, {
    key: layout.id,
    schemaId: layout.id,
    title: layout.title,
    description: layout.description,
    responsive: layout.responsive,
    tokenScope: 'layout',
    children: regions,
  });
};
