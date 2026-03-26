import { Badge } from '@billing-platform/ui';
import { DenseTable, FinanceGuardrailBanner, SectionCard, SurfaceHeader } from '@/components/finance-surface';

const obligations = [
  { Jurisdiction: 'US-CA', Return: 'Sales & Use', Status: 'Ready for Review', Period: '2026-Q1', Owner: 'Tax Ops' },
  { Jurisdiction: 'US-NY', Return: 'Sales & Use', Status: 'Collecting Adjustments', Period: '2026-Q1', Owner: 'Tax Ops' },
  { Jurisdiction: 'US-FED', Return: '1099 Reconciliation', Status: 'Draft', Period: '2026-Q1', Owner: 'Compliance' },
];

const controls = [
  { Surface: 'Tax Calculation Inputs', Guarantee: 'Read-only from backend tax engine output', 'Risk Mitigation': 'Prevents client-side rate logic drift' },
  { Surface: 'Filing Approval', Guarantee: 'Role + legal entity policy validated server-side', 'Risk Mitigation': 'Blocks unauthorized filing action' },
  { Surface: 'Submission Evidence', Guarantee: 'Acknowledgement IDs retained in audit log', 'Risk Mitigation': 'Supports regulator inquiries' },
];

export default function TaxCenterPage() {
  return (
    <div style={{ display: 'grid', gap: 'var(--space-lg)' }}>
      <SurfaceHeader
        title="Tax Center"
        description="Operational filing workspace with jurisdiction-level visibility, approval gates, and evidence tracking."
        primaryAction="Open Filing Queue"
        secondaryAction="Download Compliance Packet"
      />

      <FinanceGuardrailBanner />

      <SectionCard
        title="Jurisdiction Queue"
        subtitle="RE-QC: tax surface reviewed for workflow readability and strict separation from tax computation engines."
      >
        <DenseTable columns={['Jurisdiction', 'Return', 'Status', 'Period', 'Owner']} rows={obligations} />
      </SectionCard>

      <SectionCard
        title="Trust Controls"
        subtitle="Frontend is strictly presentational for tax results and filing workflow states."
      >
        <DenseTable columns={['Surface', 'Guarantee', 'Risk Mitigation']} rows={controls} />
        <div style={{ display: 'flex', gap: 'var(--space-sm)', flexWrap: 'wrap' }}>
          <Badge tone="success">No tax math in UI</Badge>
          <Badge tone="warning">Filing actions visible only when permissioned</Badge>
        </div>
      </SectionCard>
    </div>
  );
}
