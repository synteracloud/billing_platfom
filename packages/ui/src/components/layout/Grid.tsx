import type { ReactNode } from 'react';
import { tokens } from '../../tokens/tokens';

interface GridProps {
  children?: ReactNode;
  columns?: number;
}

export const Grid = ({ children, columns = 2 }: GridProps) => (
  <div style={{ display: 'grid', gridTemplateColumns: `repeat(auto-fit, minmax(min(100%, ${tokens.size.tableColumnMin}), 1fr))`, gap: tokens.spacing.lg }} data-columns={columns}>
    {children}
  </div>
);
