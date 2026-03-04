interface DataTableProps {
  columns?: string[];
  rows?: Array<Record<string, string | number | null>>;
}

export const DataTable = ({ columns = [], rows = [] }: DataTableProps) => (
  <div style={{ overflowX: 'auto', border: 'var(--border-width-thin) solid var(--color-border-subtle)', borderRadius: 'var(--radius-md)' }}>
    <table style={{ width: '100%', borderCollapse: 'collapse', fontFamily: 'var(--typography-font-family-primary)' }}>
      <thead style={{ backgroundColor: 'var(--color-table-header)' }}>
        <tr>
          {columns.map((column) => (
            <th key={column} style={{ textAlign: 'left', padding: 'var(--space-md)', fontSize: 'var(--typography-font-size-sm)', color: 'var(--color-text-secondary)', borderBottom: 'var(--border-width-thin) solid var(--color-border-subtle)' }}>
              {column}
            </th>
          ))}
        </tr>
      </thead>
      <tbody>
        {rows.map((row, index) => (
          <tr key={`row-${index}`} style={{ borderBottom: 'var(--border-width-thin) solid var(--color-border-subtle)' }}>
            {columns.map((column) => (
              <td key={`${index}-${column}`} style={{ padding: 'var(--space-md)', color: 'var(--color-text-primary)' }}>
                {row[column] ?? ''}
              </td>
            ))}
          </tr>
        ))}
      </tbody>
    </table>
  </div>
);
