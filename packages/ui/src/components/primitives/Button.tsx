import type { ButtonHTMLAttributes, ReactNode } from 'react';

type Variant = 'primary' | 'secondary' | 'danger';

interface ButtonProps extends ButtonHTMLAttributes<HTMLButtonElement> {
  children: ReactNode;
  variant?: Variant;
}

export const Button = ({ children, variant = 'primary', style, ...props }: ButtonProps) => {
  const backgrounds = {
    primary: 'var(--color-primary)',
    secondary: 'var(--color-surface-muted)',
    danger: 'var(--color-danger)',
  } as const;

  const colors = {
    primary: 'var(--color-surface)',
    secondary: 'var(--color-text-primary)',
    danger: 'var(--color-surface)',
  } as const;

  return (
    <button
      type="button"
      {...props}
      style={{
        border: 'var(--border-width-thin) solid transparent',
        borderRadius: 'var(--radius-md)',
        backgroundColor: backgrounds[variant],
        color: colors[variant],
        padding: 'var(--space-sm) var(--space-lg)',
        fontFamily: 'var(--typography-font-family-primary)',
        fontSize: 'var(--typography-font-size-md)',
        fontWeight: 'var(--typography-font-weight-medium)',
        cursor: 'pointer',
        ...style,
      }}
    >
      {children}
    </button>
  );
};
