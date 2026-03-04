import { tokens } from '../../tokens/tokens';

interface StatCardProps {
  label: string;
  value: string;
}

export const StatCard = ({ label, value }: StatCardProps) => (
  <article style={{ backgroundColor: tokens.color.surface, border: `${tokens.border.width.thin} solid ${tokens.color.borderSubtle}`, borderRadius: tokens.radius.md, padding: tokens.spacing.lg }}>
    <div style={{ color: tokens.color.textSecondary, fontSize: tokens.typography.fontSize.sm }}>{label}</div>
    <div style={{ color: tokens.color.textPrimary, fontSize: tokens.typography.fontSize.xl, fontWeight: tokens.typography.fontWeight.semibold }}>{value}</div>
  </article>
);
