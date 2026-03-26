import { Badge } from '@billing-platform/ui';
import { DenseTable, FinanceGuardrailBanner, SectionCard, SurfaceHeader } from '@/components/finance-surface';

const events = [
  { Time: '2026-03-26 08:03 UTC', Entity: 'Journal JRNL-2026-004121', Action: 'Approved', Actor: 'controller@corp', Evidence: 'Approval note + policy hash' },
  { Time: '2026-03-26 08:06 UTC', Entity: 'Period 2026-03', Action: 'Close attempted', Actor: 'close.service', Evidence: 'Blocked: pending journals' },
  { Time: '2026-03-26 08:15 UTC', Entity: 'Tax Return US-CA', Action: 'Filed', Actor: 'tax.manager@corp', Evidence: 'Acknowledgement #TX-99821' },
  { Time: '2026-03-26 08:21 UTC', Entity: 'Role Policy v44', Action: 'Published', Actor: 'admin.dual-control', Evidence: 'Change request CR-1172' },
];

const visibilityRules = [
  { Scope: 'Finance Operators', Access: 'Own domain workflow events', Purpose: 'Operational follow-up and issue handling' },
  { Scope: 'Controllers', Access: 'Cross-domain financial events', Purpose: 'Close and reporting integrity review' },
  { Scope: 'Auditors', Access: 'Read-only immutable event stream', Purpose: 'Independent verification' },
];

export default function AuditTrailPage() {
  return (
    <div style={{ display: 'grid', gap: 'var(--space-lg)' }}>
      <SurfaceHeader
        title="Audit Trail Inspector"
        description="Immutable event visibility across journal, close, tax, and permissions workflows for internal and external audit readiness."
        primaryAction="Open Event Explorer"
        secondaryAction="Export Evidence Bundle"
      />
      <FinanceGuardrailBanner />

      <SectionCard
        title="Recent Financial Control Events"
        subtitle="RE-QC: audit visibility verified across critical accounting workflows."
      >
        <DenseTable columns={['Time', 'Entity', 'Action', 'Actor', 'Evidence']} rows={events} />
      </SectionCard>

      <SectionCard
        title="Visibility Model"
        subtitle="Every audit event display follows backend-scoped permissions and immutable evidence retention."
      >
        <DenseTable columns={['Scope', 'Access', 'Purpose']} rows={visibilityRules} />
        <div style={{ display: 'flex', gap: 'var(--space-sm)', flexWrap: 'wrap' }}>
          <Badge tone="success">Clear auditability of critical workflows</Badge>
          <Badge tone="warning">No mutable event editing in frontend</Badge>
        </div>
      </SectionCard>
    </div>
  );
}
