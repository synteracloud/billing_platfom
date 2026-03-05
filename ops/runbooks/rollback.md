# Rollback Runbook

## Rollback Procedures
1. Identify failed release version and impact scope.
2. Halt current rollout and notify stakeholders.
3. Re-deploy last known stable application/container versions.
4. Validate service recovery using health checks and smoke tests.

## Database Rollback Strategy
- Prefer forward-fix migrations when possible.
- If rollback is required:
  1. Restore from verified backup or snapshot.
  2. Apply down migration only if explicitly tested and safe.
  3. Validate schema and data integrity before reopening traffic.

## Container Rollback Process
1. Retrieve previous stable image tags from registry.
2. Update deployment manifests to pinned stable tags.
3. Redeploy services in safe order (API, worker, frontend).
4. Confirm runtime health and queue processing status.

## Post-Rollback Actions
- Open incident report with timeline and root-cause analysis.
- Record corrective actions to prevent recurrence.
