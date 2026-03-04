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

interface TableRow {
  [key: string]: string | number | null;
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

  const resolvedBinding = String(schema.props?.rowsBinding ?? schema.props?.binding ?? '');
  const rows = (resolvedBinding ? context.resolveBinding(resolvedBinding) : []) as TableRow[];

  const configuredColumns = (schema.props?.columns as Array<TableColumnDefinition | string> | undefined) ?? [];
  const columns = configuredColumns.length
    ? configuredColumns.map((column) =>
        typeof column === 'string' ? column : (column.header ?? column.accessor ?? column.id),
      )
    : rows.length > 0
      ? Object.keys(rows[0])
      : [];

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
