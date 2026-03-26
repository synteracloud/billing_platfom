import type { ReactNode } from 'react';
import { Badge, Button, Card, DataTable, PageHeader } from '@billing-platform/ui';

export const FinanceGuardrailBanner = () => (
  <Card>
    <div style={{ display: 'grid', gap: 'var(--space-sm)' }}>
      <div style={{ display: 'flex', gap: 'var(--space-sm)', flexWrap: 'wrap' }}>
        <Badge tone="warning">UI is not source of truth</Badge>
        <Badge tone="info">Workflow orchestration only</Badge>
        <Badge tone="success">Every action requires backend authorization + audit event</Badge>
      </div>
      <p style={{ margin: 0, color: 'var(--color-text-secondary)' }}>
        This surface shows posting, close, tax, and reporting workflows for operators. Balances, journals, and filings are read from trusted services.
      </p>
    </div>
  </Card>
);

export const SurfaceHeader = ({
  title,
  description,
  primaryAction,
  secondaryAction,
}: {
  title: string;
  description: string;
  primaryAction: string;
  secondaryAction?: string;
}) => (
  <PageHeader
    title={title}
    description={description}
    actions={(
      <>
        {secondaryAction ? <Button variant="secondary">{secondaryAction}</Button> : null}
        <Button>{primaryAction}</Button>
      </>
    )}
  />
);

export const SectionCard = ({ title, subtitle, children }: { title: string; subtitle: string; children: ReactNode }) => (
  <Card>
    <div style={{ display: 'grid', gap: 'var(--space-md)' }}>
      <div>
        <h3 style={{ margin: 0 }}>{title}</h3>
        <p style={{ margin: 'var(--space-xs) 0 0', color: 'var(--color-text-secondary)' }}>{subtitle}</p>
      </div>
      {children}
    </div>
  </Card>
);

export const DenseTable = ({ columns, rows }: { columns: string[]; rows: Array<Record<string, string>> }) => (
  <DataTable columns={columns} rows={rows} />
);
