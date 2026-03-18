# Billing Platform Monorepo

This repository contains the scaffold for a global multi-tenant billing SaaS monorepo.

## Repository layout

- `docs/` — architecture, domain, API, and schema documentation.
- `design/` — design assets and system specifications.
- `backend/` — NestJS-ready backend application structure.
- `frontend/` — Next.js-ready frontend application structure.
- `packages/` — shared workspace packages (`ui`, `renderer`, `shared-types`).
- `infrastructure/` — Docker and operational scripts.

## PostgreSQL foundation

- Backend PostgreSQL migrations live in `backend/infrastructure/migrations`.
- Run migrations with `npm run db:migrate` from `backend/` after setting `DATABASE_URL`.
- The backend includes a transactional `DatabaseService` with nested transaction support for strict financial workflows.
