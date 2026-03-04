import { tokens } from '../../tokens/tokens';

interface DataTableProps {
  columns?: string[];
  rows?: Array<Record<string, string | number | null>>;
}

export const DataTable = ({ columns = [], rows = [] }: DataTableProps) => (
  <div style={{ overflowX: 'auto', border: `${tokens.border.width.thin} solid ${tokens.color.borderSubtle}`, borderRadius: tokens.radius.md }}>
    <table style={{ width: '100%', borderCollapse: 'collapse', fontFamily: tokens.typography.fontFamily }}>
      <thead style={{ backgroundColor: tokens.color.tableHeader }}>
        <tr>
          {columns.map((column) => (
            <th key={column} style={{ textAlign: 'left', padding: tokens.spacing.md, fontSize: tokens.typography.fontSize.sm, color: tokens.color.textSecondary, borderBottom: `${tokens.border.width.thin} solid ${tokens.color.borderSubtle}` }}>
              {column}
            </th>
          ))}
        </tr>
      </thead>
      <tbody>
        {rows.map((row, index) => (
          <tr key={`row-${index}`} style={{ borderBottom: `${tokens.border.width.thin} solid ${tokens.color.borderSubtle}` }}>
            {columns.map((column) => (
              <td key={`${index}-${column}`} style={{ padding: tokens.spacing.md, color: tokens.color.textPrimary }}>
                {row[column] ?? ''}
              </td>
            ))}
          </tr>
        ))}
      </tbody>
    </table>
  </div>
);
