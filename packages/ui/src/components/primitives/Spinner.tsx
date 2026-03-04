import { tokens } from '../../tokens/tokens';

export const Spinner = () => (
  <span
    style={{
      display: 'inline-block',
      width: tokens.spacing.lg,
      height: tokens.spacing.lg,
      borderRadius: '50%',
      border: `${tokens.border.width.thin} solid ${tokens.color.borderSubtle}`,
      borderTopColor: tokens.color.primary,
    }}
  />
);
