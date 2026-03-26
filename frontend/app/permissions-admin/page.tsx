import { Badge } from '@billing-platform/ui';
import { DenseTable, FinanceGuardrailBanner, SectionCard, SurfaceHeader } from '@/components/finance-surface';

const roles = [
  { Role: 'Preparer', 'Journal Draft': 'Allow', 'Approve/Post': 'Deny', 'Close/Reopen': 'Deny', 'Tax File': 'Deny' },
  { Role: 'Controller', 'Journal Draft': 'Allow', 'Approve/Post': 'Allow', 'Close/Reopen': 'Request + Approve', 'Tax File': 'Review Only' },
  { Role: 'Tax Manager', 'Journal Draft': 'View', 'Approve/Post': 'View', 'Close/Reopen': 'View', 'Tax File': 'Allow' },
  { Role: 'Auditor (Read-Only)', 'Journal Draft': 'View', 'Approve/Post': 'View', 'Close/Reopen': 'View', 'Tax File': 'View' },
];

const adminActions = [
  { Action: 'Grant elevated role', Requirement: 'Dual admin approval', Traceability: 'Permission diff event' },
  { Action: 'Revoke close permission', Requirement: 'Immediate policy publish', Traceability: 'Policy version checkpoint' },
  { Action: 'Enable emergency access', Requirement: 'Time-boxed grant + incident ID', Traceability: 'Auto-expiry + attestation event' },
];

export default function PermissionsAdminPage() {
  return (
    <div style={{ display: 'grid', gap: 'var(--space-lg)' }}>
      <SurfaceHeader
        title="Permissions & Admin Panel"
        description="Role-policy visibility for accounting actions, showing what users can trigger across journals, close, tax, and reporting."
        primaryAction="Review Access Deltas"
        secondaryAction="Open Policy Simulator"
      />
      <FinanceGuardrailBanner />

      <SectionCard
        title="Role-to-Action Matrix"
        subtitle="QC: state/action permissions are explicit so operators can predict allowed workflows before action."
      >
        <DenseTable columns={['Role', 'Journal Draft', 'Approve/Post', 'Close/Reopen', 'Tax File']} rows={roles} />
      </SectionCard>

      <SectionCard
        title="Admin Control Actions"
        subtitle="High-risk changes are represented with mandatory controls and traceability requirements."
      >
        <DenseTable columns={['Action', 'Requirement', 'Traceability']} rows={adminActions} />
        <div style={{ display: 'flex', gap: 'var(--space-sm)', flexWrap: 'wrap' }}>
          <Badge tone="success">Permissions enforced server-side</Badge>
          <Badge tone="info">UI reflects policy state, never computes it</Badge>
        </div>
      </SectionCard>
    </div>
  );
}
