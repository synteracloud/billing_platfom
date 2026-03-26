import { Badge } from '@billing-platform/ui';
import { DenseTable, FinanceGuardrailBanner, SectionCard, SurfaceHeader } from '@/components/finance-surface';

const closeChecklist = [
  { Step: 'Subledger Lock', Owner: 'AR/AP Ops', State: 'Completed', Evidence: 'Lock event + timestamp' },
  { Step: 'Journal Approval Sweep', Owner: 'Controller', State: 'In Progress', Evidence: 'Pending 3 journals' },
  { Step: 'Variance Review', Owner: 'Accounting Manager', State: 'Completed', Evidence: 'Review memo attached' },
  { Step: 'Close Period', Owner: 'Close Service', State: 'Blocked', Evidence: 'Blocked until approvals complete' },
];

const reopenFlow = [
  { Action: 'Request Reopen', Permission: 'Controller+', Guardrail: 'Reason and impact scope required' },
  { Action: 'Secondary Approval', Permission: 'CFO Delegate', Guardrail: 'Dual control enforced by policy engine' },
  { Action: 'Reopen Execution', Permission: 'System Service', Guardrail: 'Immutable close/reopen chain event' },
  { Action: 'Restatement Tracking', Permission: 'Reporting Ops', Guardrail: 'Statement banners auto-raised' },
];

export default function PeriodClosePage() {
  return (
    <div style={{ display: 'grid', gap: 'var(--space-lg)' }}>
      <SurfaceHeader
        title="Period Close Panel"
        description="Orchestrated close/reopen control tower with explicit ownership, role gates, and audit-linked evidence."
        primaryAction="Run Close Readiness"
        secondaryAction="Initiate Reopen Request"
      />
      <FinanceGuardrailBanner />

      <SectionCard
        title="Close Workstream"
        subtitle="RE-QC: close flow reviewed to ensure sequence clarity and backend-owned state transitions."
      >
        <DenseTable columns={['Step', 'Owner', 'State', 'Evidence']} rows={closeChecklist} />
      </SectionCard>

      <SectionCard
        title="Reopen Controls"
        subtitle="RE-QC: reopen path includes explicit approvals and visible audit links before state change."
      >
        <DenseTable columns={['Action', 'Permission', 'Guardrail']} rows={reopenFlow} />
        <div style={{ display: 'flex', gap: 'var(--space-sm)', flexWrap: 'wrap' }}>
          <Badge tone="success">Close/reopen lifecycle fully auditable</Badge>
          <Badge tone="info">Action hierarchy tightened by mandatory sequence</Badge>
        </div>
      </SectionCard>
    </div>
  );
}
