import type { CSSProperties } from 'react';
import { tokens } from '../../tokens/tokens';

interface IconProps {
  symbol?: string;
  label?: string;
  style?: CSSProperties;
}

export const Icon = ({ symbol = '◦', label = 'icon', style }: IconProps) => (
  <span
    aria-label={label}
    role="img"
    style={{
      color: tokens.color.textSecondary,
      fontSize: tokens.typography.fontSize.md,
      lineHeight: 1,
      ...style,
    }}
  >
    {symbol}
  </span>
);
