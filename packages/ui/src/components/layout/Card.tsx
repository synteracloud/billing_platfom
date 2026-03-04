import type { ReactNode } from 'react';

export const Card = ({ children }: { children?: ReactNode }) => (
  <section style={{ backgroundColor: 'var(--color-surface)', border: 'var(--border-width-thin) solid var(--color-border-subtle)', borderRadius: 'var(--radius-md)', padding: 'var(--space-lg)', boxShadow: 'var(--shadow-sm)' }}>
    {children}
  </section>
);
