import { createElement, type ReactElement } from 'react';
import type { ComponentSchema } from '../types/component-schema';
import type { RendererContext } from '../utils/renderer-context';
import type { ComponentRegistry, RenderComponent } from '../registry';

interface TableColumnDefinition {
  id: string;
  header: string;
  accessor: string;
  sortable?: boolean;
  filterable?: boolean;
}

export const renderTable = (
  schema: ComponentSchema,
  context: RendererContext,
  registry: ComponentRegistry,
): ReactElement => {
  const tableComponent = registry.get('table');

  if (!tableComponent) {
    throw new Error('No registered table component found.');
  }

  const columns = (schema.props?.columns as TableColumnDefinition[] | undefined) ?? [];
  const rowsBinding = String(schema.props?.rowsBinding ?? '');
  const rows = rowsBinding ? context.resolveBinding(rowsBinding) : [];

  return createElement(tableComponent as RenderComponent, {
    key: schema.id,
    schemaId: schema.id,
    tokenScope: 'table',
    columns,
    rows,
    enableSorting: Boolean(schema.props?.sorting ?? true),
    enableFiltering: Boolean(schema.props?.filtering ?? true),
    rowActions: schema.props?.rowActions ?? [],
    rowExpansion: schema.props?.rowExpansion ?? null,
  });
};
