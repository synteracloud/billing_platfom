import type { InputHTMLAttributes } from 'react';

export const Input = (props: InputHTMLAttributes<HTMLInputElement>) => (
  <input
    {...props}
    style={{
      width: '100%',
      border: 'var(--border-width-thin) solid var(--color-border-default)',
      borderRadius: 'var(--radius-md)',
      padding: 'var(--space-sm) var(--space-md)',
      fontSize: 'var(--typography-font-size-md)',
      color: 'var(--color-text-primary)',
      fontFamily: 'var(--typography-font-family-primary)',
      backgroundColor: 'var(--color-surface)',
      ...(props.style ?? {}),
    }}
  />
);
