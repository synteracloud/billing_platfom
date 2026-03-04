import type { ReactNode } from 'react';
import { tokens } from '../../tokens/tokens';

export const Stack = ({ children }: { children?: ReactNode }) => (
  <div style={{ display: 'flex', flexDirection: 'column', gap: tokens.spacing.md }}>{children}</div>
);
