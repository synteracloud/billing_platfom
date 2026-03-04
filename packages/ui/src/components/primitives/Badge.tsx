import type { ReactNode } from 'react';
import { tokens } from '../../tokens/tokens';

interface BadgeProps {
  children: ReactNode;
  tone?: 'info' | 'success' | 'warning' | 'danger';
}

export const Badge = ({ children, tone = 'info' }: BadgeProps) => {
  const colorMap = {
    info: tokens.color.info,
    success: tokens.color.success,
    warning: tokens.color.warning,
    danger: tokens.color.danger,
  } as const;

  return (
    <span
      style={{
        display: 'inline-flex',
        padding: `${tokens.spacing.xs} ${tokens.spacing.sm}`,
        borderRadius: tokens.radius.sm,
        border: `${tokens.border.width.thin} solid ${tokens.color.borderSubtle}`,
        color: colorMap[tone],
        fontSize: tokens.typography.fontSize.xs,
      }}
    >
      {children}
    </span>
  );
};
