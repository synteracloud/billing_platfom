import type { InputHTMLAttributes } from 'react';
import { tokens } from '../../tokens/tokens';

export const Input = (props: InputHTMLAttributes<HTMLInputElement>) => (
  <input
    {...props}
    style={{
      width: '100%',
      border: `${tokens.border.width.thin} solid ${tokens.color.borderDefault}`,
      borderRadius: tokens.radius.md,
      padding: `${tokens.spacing.sm} ${tokens.spacing.md}`,
      fontSize: tokens.typography.fontSize.md,
      color: tokens.color.textPrimary,
      fontFamily: tokens.typography.fontFamily,
      ...(props.style ?? {}),
    }}
  />
);
