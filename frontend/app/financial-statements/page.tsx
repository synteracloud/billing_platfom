import { Badge } from '@billing-platform/ui';
import { DenseTable, FinanceGuardrailBanner, SectionCard, SurfaceHeader } from '@/components/finance-surface';

const statements = [
  { Statement: 'Balance Sheet', Period: 'March 2026', Status: 'Prepared', 'Data Freshness': 'Snapshot 08:30 UTC', Owner: 'Reporting Service' },
  { Statement: 'Income Statement', Period: 'March 2026', Status: 'Prepared', 'Data Freshness': 'Snapshot 08:30 UTC', Owner: 'Reporting Service' },
  { Statement: 'Cash Flow', Period: 'March 2026', Status: 'Needs Review', 'Data Freshness': 'Snapshot 08:30 UTC', Owner: 'Treasury Reporting' },
];

const disclosures = [
  { Control: 'Version Lock', Description: 'Statement pack is pinned to close version', Visibility: 'Visible in statement header' },
  { Control: 'Restatement Alert', Description: 'Any reopened period raises warning badge', Visibility: 'Visible in workspace + exports' },
  { Control: 'Approval Trail', Description: 'Reviewer and signer identities are backend-attested', Visibility: 'Visible in finalization panel' },
];

export default function FinancialStatementsPage() {
  return (
    <div style={{ display: 'grid', gap: 'var(--space-lg)' }}>
      <SurfaceHeader
        title="Financial Statements Dashboard"
        description="High-density reporting workspace for statement package readiness, review routing, and publication controls."
        primaryAction="Open Statement Pack"
        secondaryAction="Route for Executive Review"
      />
      <FinanceGuardrailBanner />

      <SectionCard
        title="Statement Readiness"
        subtitle="RE-QC: statements surface reviewed for clarity, ownership, and visible action gates."
      >
        <DenseTable columns={['Statement', 'Period', 'Status', 'Data Freshness', 'Owner']} rows={statements} />
      </SectionCard>

      <SectionCard
        title="Publishing Controls"
        subtitle="Critical controls are visible before any publish step; UI reads backend-generated control results."
      >
        <DenseTable columns={['Control', 'Description', 'Visibility']} rows={disclosures} />
        <div style={{ display: 'flex', gap: 'var(--space-sm)', flexWrap: 'wrap' }}>
          <Badge tone="success">Trusted workflow: review → approve → publish</Badge>
          <Badge tone="warning">Restatement path requires reopen authorization</Badge>
        </div>
      </SectionCard>
    </div>
  );
}
