import type { ComponentSchema } from '../types/component-schema';
import type { RendererSchema } from '../types/renderer-schema';

const LAYOUT_TYPES = new Set(['page', 'grid', 'stack', 'section', 'panel']);
const COMPONENT_TYPES = new Set([
  'layout',
  'page',
  'grid',
  'stack',
  'section',
  'panel',
  'card',
  'drawer',
  'form',
  'table',
  'entity',
  'text',
  'button',
]);

const assertComponent = (component: ComponentSchema, path: string): void => {
  if (!component.id || !component.id.trim()) {
    throw new Error(`Invalid component at ${path}: missing id.`);
  }

  if (!COMPONENT_TYPES.has(component.type)) {
    throw new Error(
      `Invalid component at ${path}: unsupported type \"${component.type}\".`,
    );
  }

  if (component.children?.length) {
    component.children.forEach((child, index) => {
      assertComponent(child, `${path}.children[${index}]`);
    });
  }
};

export const validateRendererSchema = (schema: RendererSchema): RendererSchema => {
  if (!schema.id || !schema.id.trim()) {
    throw new Error('Renderer schema id is required.');
  }

  if (!schema.type) {
    throw new Error('Renderer schema type is required.');
  }

  if (!LAYOUT_TYPES.has(schema.layout.type)) {
    throw new Error(
      `Invalid layout type \"${schema.layout.type}\". Must be one of page, grid, stack, section, panel.`,
    );
  }

  if (!Array.isArray(schema.layout.regions) || schema.layout.regions.length === 0) {
    throw new Error('Renderer schema layout.regions must include at least one region.');
  }

  schema.layout.regions.forEach((region, index) => {
    assertComponent(region, `layout.regions[${index}]`);
  });

  if (!Array.isArray(schema.components)) {
    throw new Error('Renderer schema components must be an array.');
  }

  schema.components.forEach((component, index) => {
    assertComponent(component, `components[${index}]`);
  });

  return schema;
};
