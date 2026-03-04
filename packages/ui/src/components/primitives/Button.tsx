import type { ButtonHTMLAttributes, ReactNode } from 'react';
import { tokens } from '../../tokens/tokens';

type Variant = 'primary' | 'secondary' | 'danger';

interface ButtonProps extends ButtonHTMLAttributes<HTMLButtonElement> {
  children: ReactNode;
  variant?: Variant;
}

export const Button = ({ children, variant = 'primary', style, ...props }: ButtonProps) => {
  const backgrounds = {
    primary: tokens.color.primary,
    secondary: tokens.color.surfaceMuted,
    danger: tokens.color.danger,
  } as const;

  const colors = {
    primary: tokens.color.surface,
    secondary: tokens.color.textPrimary,
    danger: tokens.color.surface,
  } as const;

  return (
    <button
      type="button"
      {...props}
      style={{
        border: `${tokens.border.width.thin} solid transparent`,
        borderRadius: tokens.radius.md,
        backgroundColor: backgrounds[variant],
        color: colors[variant],
        padding: `${tokens.spacing.sm} ${tokens.spacing.lg}`,
        fontFamily: tokens.typography.fontFamily,
        fontSize: tokens.typography.fontSize.md,
        fontWeight: tokens.typography.fontWeight.medium,
        cursor: 'pointer',
        ...style,
      }}
    >
      {children}
    </button>
  );
};
