import type { CSSProperties, ReactNode } from 'react';
import { tokens } from '../../tokens/tokens';

interface TextProps {
  children: ReactNode;
  size?: keyof typeof tokens.typography.fontSize;
  tone?: 'primary' | 'secondary' | 'muted';
  weight?: keyof typeof tokens.typography.fontWeight;
  style?: CSSProperties;
}

export const Text = ({ children, size = 'md', tone = 'primary', weight = 'normal', style }: TextProps) => {
  const colorByTone = {
    primary: tokens.color.textPrimary,
    secondary: tokens.color.textSecondary,
    muted: tokens.color.textMuted,
  } as const;

  return (
    <span
      style={{
        fontFamily: tokens.typography.fontFamily,
        fontSize: tokens.typography.fontSize[size],
        fontWeight: tokens.typography.fontWeight[weight],
        color: colorByTone[tone],
        ...style,
      }}
    >
      {children}
    </span>
  );
};
