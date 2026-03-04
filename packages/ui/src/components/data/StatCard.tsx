interface StatCardProps {
  label: string;
  value: string;
}

export const StatCard = ({ label, value }: StatCardProps) => (
  <article style={{ backgroundColor: 'var(--color-surface)', border: 'var(--border-width-thin) solid var(--color-border-subtle)', borderRadius: 'var(--radius-md)', padding: 'var(--space-lg)' }}>
    <div style={{ color: 'var(--color-text-secondary)', fontSize: 'var(--typography-font-size-sm)' }}>{label}</div>
    <div style={{ color: 'var(--color-text-primary)', fontSize: 'var(--typography-font-size-xl)', fontWeight: 'var(--typography-font-weight-semibold)' }}>{value}</div>
  </article>
);
