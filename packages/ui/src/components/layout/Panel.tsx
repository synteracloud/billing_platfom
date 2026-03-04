import type { ReactNode } from 'react';
import { tokens } from '../../tokens/tokens';

export const Panel = ({ children }: { children?: ReactNode }) => (
  <aside style={{ backgroundColor: tokens.color.surfaceMuted, borderRadius: tokens.radius.md, padding: tokens.spacing.md, border: `${tokens.border.width.thin} solid ${tokens.color.borderSubtle}` }}>{children}</aside>
);
