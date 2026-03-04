import type { ReactNode } from 'react';
import { tokens } from '../../tokens/tokens';

interface PageHeaderProps {
  title: string;
  description?: string;
  actions?: ReactNode;
}

export const PageHeader = ({ title, description, actions }: PageHeaderProps) => (
  <header style={{ display: 'flex', justifyContent: 'space-between', gap: tokens.spacing.md, marginBottom: tokens.spacing.lg, flexWrap: 'wrap' }}>
    <div>
      <h1 style={{ margin: 0, fontFamily: tokens.typography.fontFamily, fontSize: tokens.typography.fontSize.xl, color: tokens.color.textPrimary }}>{title}</h1>
      {description ? <p style={{ margin: `${tokens.spacing.sm} 0 0`, color: tokens.color.textSecondary }}>{description}</p> : null}
    </div>
    <div style={{ display: 'flex', gap: tokens.spacing.sm }}>{actions}</div>
  </header>
);
