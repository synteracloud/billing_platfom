# Environment Variables

This document lists baseline environment variables for Render deployments.

## Required Variables
- `DATABASE_URL`: connection string for Render PostgreSQL.
- `REDIS_URL`: connection string for Redis/queue broker.
- `JWT_SECRET`: secret key used for signing and validating JWTs.
- `APP_URL`: public application URL used for links/callbacks.
- `EMAIL_PROVIDER_KEY`: API key/token for outbound email provider integration.

## Where to Configure in Render
Set these variables in Render Dashboard:
1. Open the target service (`billing-api`, `billing-worker`, or `billing-frontend`).
2. Go to **Settings**.
3. Open the **Environment** section.
4. Add key/value pairs and save.

Use shared values across services where appropriate (for example, `DATABASE_URL` and `JWT_SECRET`), while keeping service-only values scoped to the relevant service.
