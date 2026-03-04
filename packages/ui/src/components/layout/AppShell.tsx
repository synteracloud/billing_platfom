import type { ReactNode } from 'react';
import { tokens } from '../../tokens/tokens';

interface AppShellProps {
  topNav?: ReactNode;
  sidebar?: ReactNode;
  children?: ReactNode;
}

export const AppShell = ({ topNav, sidebar, children }: AppShellProps) => (
  <div style={{ backgroundColor: tokens.color.background, minHeight: '100vh' }}>
    <div style={{ borderBottom: `${tokens.border.width.thin} solid ${tokens.color.borderSubtle}`, padding: tokens.spacing.md }}>{topNav}</div>
    <div style={{ display: 'flex', gap: tokens.spacing.lg }}>
      <aside style={{ width: tokens.size.sidebar, padding: tokens.spacing.md, borderRight: `${tokens.border.width.thin} solid ${tokens.color.borderSubtle}` }}>{sidebar}</aside>
      <main style={{ flex: 1, padding: tokens.spacing.lg }}>{children}</main>
    </div>
  </div>
);
