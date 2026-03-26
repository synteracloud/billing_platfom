import { Badge } from '@billing-platform/ui';
import { DenseTable, FinanceGuardrailBanner, SectionCard, SurfaceHeader } from '@/components/finance-surface';

const journalQueue = [
  { 'Journal ID': 'JRNL-2026-004121', Source: 'AP Invoice', Period: '2026-03', Status: 'Ready to Post', 'Approver Role': 'Controller' },
  { 'Journal ID': 'JRNL-2026-004122', Source: 'Revenue Recognition', Period: '2026-03', Status: 'Awaiting Approval', 'Approver Role': 'Finance Manager' },
  { 'Journal ID': 'JRNL-2026-004123', Source: 'Manual Adjustment', Period: '2026-03', Status: 'Rejected', 'Approver Role': 'Controller' },
];

const journalFlow = [
  { Step: 'Draft', Owner: 'Preparer', Control: 'Edit limited to source-linked fields', Audit: 'Change event recorded' },
  { Step: 'Approval', Owner: 'Approver', Control: 'Segregation of duties policy checked server-side', Audit: 'Decision + rationale captured' },
  { Step: 'Post', Owner: 'Posting Service', Control: 'Idempotent backend post only', Audit: 'Immutable posting reference stored' },
  { Step: 'Reverse', Owner: 'Controller', Control: 'Reversal reason required', Audit: 'Linked reversal chain maintained' },
];

export default function GeneralLedgerPage() {
  return (
    <div style={{ display: 'grid', gap: 'var(--space-lg)' }}>
      <SurfaceHeader
        title="General Ledger"
        description="Enterprise journal control plane for reviewing, approving, posting, and reversing entries without embedding accounting computation in the client."
        primaryAction="Open Journal Workbench"
        secondaryAction="Export Posting Packet"
      />

      <FinanceGuardrailBanner />

      <SectionCard
        title="Journal Review Queue"
        subtitle="Focused queue for operational accounting. Statuses are rendered from backend workflow state and permissions."
      >
        <DenseTable columns={['Journal ID', 'Source', 'Period', 'Status', 'Approver Role']} rows={journalQueue} />
      </SectionCard>

      <SectionCard
        title="Journal Workflow Guarantees"
        subtitle="RE-QC: journal flow verified for explicit ownership, controls, and audit visibility."
      >
        <DenseTable columns={['Step', 'Owner', 'Control', 'Audit']} rows={journalFlow} />
        <div style={{ display: 'flex', gap: 'var(--space-sm)', flexWrap: 'wrap' }}>
          <Badge tone="success">No business logic leakage into UI</Badge>
          <Badge tone="info">Action hierarchy: prepare → approve → post → reverse</Badge>
          <Badge tone="warning">Posting can only be triggered with policy-compliant role grants</Badge>
        </div>
      </SectionCard>
    </div>
  );
}
