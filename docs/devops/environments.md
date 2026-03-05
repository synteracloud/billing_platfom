# Environments

## Development
- **Purpose**: local feature development and debugging.
- **Service URLs**:
  - Frontend: `http://localhost:3000`
  - API: `http://localhost:4000`
- **Database connection**: local Postgres instance (non-production data).
- **Secrets management**:
  - Use local `.env` files excluded from version control.
  - Never commit real credentials.

## Staging
- **Purpose**: integration and pre-release validation.
- **Service URLs**:
  - Frontend: `https://staging.example.com`
  - API: `https://api.staging.example.com`
- **Database connection**: isolated staging Postgres database.
- **Secrets management**:
  - Store secrets in managed secret storage (e.g., cloud secrets manager or GitHub environment secrets).
  - Restrict access to deployment and ops roles.

## Production
- **Purpose**: live environment for end users.
- **Service URLs**:
  - Frontend: `https://app.example.com`
  - API: `https://api.example.com`
- **Database connection**: highly available production Postgres cluster.
- **Secrets management**:
  - Use managed secret storage with rotation policies.
  - Enforce least privilege and audit trails.

## Cross-Environment Guidelines
- Keep configuration environment-specific and externalized.
- Use separate databases, caches, and credentials per environment.
- Ensure migration and deployment tooling targets the intended environment explicitly.
