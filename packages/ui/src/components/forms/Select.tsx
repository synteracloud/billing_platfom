import type { SelectHTMLAttributes } from 'react';
import { tokens } from '../../tokens/tokens';

export const Select = (props: SelectHTMLAttributes<HTMLSelectElement>) => (
  <select
    {...props}
    style={{
      width: '100%',
      border: `${tokens.border.width.thin} solid ${tokens.color.borderDefault}`,
      borderRadius: tokens.radius.md,
      padding: `${tokens.spacing.sm} ${tokens.spacing.md}`,
      backgroundColor: tokens.color.surface,
      color: tokens.color.textPrimary,
      ...(props.style ?? {}),
    }}
  />
);
