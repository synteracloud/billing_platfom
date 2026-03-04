import type { ReactNode } from 'react';
import { tokens } from '../../tokens/tokens';

export const Card = ({ children }: { children?: ReactNode }) => (
  <section style={{ backgroundColor: tokens.color.surface, border: `${tokens.border.width.thin} solid ${tokens.color.borderSubtle}`, borderRadius: tokens.radius.md, padding: tokens.spacing.lg, boxShadow: tokens.shadow.sm }}>
    {children}
  </section>
);
