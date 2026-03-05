# Deployment Runbook

## Build Steps
1. Install dependencies for all deployable services.
2. Run static checks (lint/type checks where applicable).
3. Run automated tests.
4. Build deployable artifacts (application bundles/images).
5. Build and tag container images.

## Migration Execution
1. Confirm target environment and release version.
2. Back up database (or verify automated backup status).
3. Run schema migrations using controlled migration tooling.
4. Validate migration success and schema version.

## Deployment Order
1. Start or verify availability of database infrastructure.
2. Run migrations.
3. Deploy `api-service`.
4. Deploy `worker-service`.
5. Deploy `frontend`.
6. Verify scheduler jobs and post-deploy health checks.

## Post-Deployment Verification
- Confirm health endpoints are healthy.
- Validate background queue consumption.
- Validate critical user flows and error rates.
