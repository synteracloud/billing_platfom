import type { ReactNode } from 'react';

interface AppShellProps {
  topNav?: ReactNode;
  sidebar?: ReactNode;
  children?: ReactNode;
}

export const AppShell = ({ topNav, sidebar, children }: AppShellProps) => (
  <div style={{ backgroundColor: 'var(--color-background)', minHeight: '100vh' }}>
    <div style={{ borderBottom: 'var(--border-width-thin) solid var(--color-border-subtle)', padding: 'var(--space-md)' }}>{topNav}</div>
    <div style={{ display: 'flex', gap: 'var(--space-lg)' }}>
      <aside style={{ width: 'var(--size-sidebar)', padding: 'var(--space-md)', borderRight: 'var(--border-width-thin) solid var(--color-border-subtle)' }}>{sidebar}</aside>
      <main style={{ flex: 1, padding: 'var(--space-lg)' }}>{children}</main>
    </div>
  </div>
);
