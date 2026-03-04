import { createElement, type ReactElement } from 'react';
import type { ComponentSchema } from '../types/component-schema';
import type { RendererContext } from '../utils/renderer-context';
import type { ComponentRegistry, RenderComponent } from '../registry';

const SUPPORTED_FIELD_TYPES = new Set([
  'input',
  'select',
  'date',
  'currency',
  'number',
  'textarea',
]);

export const renderForm = (
  schema: ComponentSchema,
  context: RendererContext,
  registry: ComponentRegistry,
): ReactElement => {
  const formComponent = registry.get('form');

  if (!formComponent) {
    throw new Error('No registered form component found.');
  }

  const fields = (schema.children ?? []).map((field) => {
    const fieldType = String(field.props?.fieldType ?? field.type);

    if (!SUPPORTED_FIELD_TYPES.has(fieldType)) {
      throw new Error(`Unsupported form field type \"${fieldType}\" in form \"${schema.id}\".`);
    }

    const valueBinding = String(field.props?.valueBinding ?? '');
    const validationRules = field.props?.validation ?? {};

    return {
      ...field,
      props: {
        ...field.props,
        value: valueBinding ? context.resolveBinding(valueBinding) : undefined,
        validation: validationRules,
      },
    };
  });

  return createElement(formComponent as RenderComponent, {
    key: schema.id,
    schemaId: schema.id,
    tokenScope: 'form',
    fields,
    validationMode: schema.props?.validationMode ?? 'onSubmit',
  });
};
