# DevOps Layer

## Purpose
This directory set provides a lightweight operational scaffold so DevOps automation can understand architecture, services, environments, and deployment workflows without scanning the full application codebase.

## How Claude DevOps Should Use These Files
1. Start with `docs/devops/system_overview.md` for architecture and topology context.
2. Load `docs/devops/services_registry.yaml` to identify service locations, runtimes, and roles.
3. Use `docs/devops/environments.md` to determine environment-specific conventions.
4. Follow runbooks in `ops/runbooks/` for deployment and rollback operations.
5. Use `ops/monitoring/healthchecks.md` to validate runtime health.

## Infrastructure Definitions
- Docker placeholders: `infrastructure/docker/`
- Script placeholders (migration/seed): `infrastructure/scripts/`
- CI/CD placeholders: `.github/workflows/`
- Future IaC modules: `infrastructure/terraform/`
- Future CI templates or shared assets: `infrastructure/ci/`

## Deployment Execution Guidance
- Use `ops/runbooks/deploy.md` as the primary source of deployment sequence.
- Validate post-deployment health against monitoring guidance.
- Use `ops/runbooks/rollback.md` for controlled rollback and incident response.

## Notes
This scaffold intentionally contains placeholders and operational metadata only. Application source behavior should remain unchanged.
