# Global Multi-Tenant Billing SaaS Architecture

## 1. System Overview
This platform is a global, multi-tenant billing and invoicing SaaS designed for organizations ranging from SMEs to enterprises. The architecture is API-first, modular by domain, and optimized for deterministic financial workflows.

Core goals:
- Isolate tenant data and behavior with strict boundaries.
- Scale independently across business domains.
- Ensure predictable invoice and payment state transitions.
- Support configurable documents and UI without fragmenting core logic.

## 2. Monorepo Structure
```text
billing_platform/
  docs/
  design/
  backend/
  frontend/
  packages/
  infrastructure/
```

Directory intent:
- `docs/`: Architecture, ADRs, operational runbooks, compliance notes.
- `design/`: UX assets, token source files, design system specifications.
- `backend/`: NestJS services, domain modules, shared backend libraries.
- `frontend/`: Next.js applications and frontend integration layers.
- `packages/`: Cross-cutting TypeScript packages (schemas, SDKs, utilities).
- `infrastructure/`: IaC, environment topology, deployment and observability config.

## 3. Backend Architecture
### Stack
- Node.js runtime
- NestJS framework
- PostgreSQL primary transactional datastore

### Service model
- Domain-oriented modular monolith initially, with clear seams for future extraction.
- REST APIs as the canonical inter-module and external integration interface.
- Shared platform capabilities: authentication context, tenant context, auditing, idempotency, validation.

### Data ownership model
- Each module owns its domain entities and persistence logic.
- Cross-module data access occurs only through REST contracts, never direct repository access.
- PostgreSQL schemas/tables are logically partitioned by module and tenant-aware by design.

## 4. Frontend Architecture
### Stack
- Next.js
- React
- TypeScript

### UI architecture
- **Design tokens**: single source of truth for color, spacing, typography, motion, and semantic states.
- **Component system**: reusable, accessible components consuming tokens and enforcing interaction consistency.
- **Schema renderer**: renderer-driven UI layer that interprets configuration schemas for forms, tables, and document views.
- **Dashboard application**: tenant-scoped operational UI for billing workflows, analytics, and settings.

### Frontend principles
- Deterministic rendering for financial artifacts (invoice previews, totals, tax blocks).
- Server/client boundaries that preserve consistent computed outcomes.
- API contract-first integration using typed clients from shared packages.

### Frontend architecture layers
Layer 1 — Design Tokens
- Defines colors, spacing, typography.

Layer 2 — Component System
- Reusable UI components.

Layer 3 — Wireframes
- Define structural layout of application screens.
- Examples:
  - dashboard
  - customers
  - products
  - invoices
  - payments
- Wireframes describe layout and data regions but not styling.

Layer 4 — Renderer
- Schema-driven engine that converts wireframes into UI components.

Layer 5 — Application Pages
- Next.js pages that bind APIs to renderer schemas.

Flow:
- API data
  → renderer schema
  → components
  → tokens
  → UI


## DESIGN SYSTEM AND FRONTEND ARCHITECTURE PRINCIPLES

### 1) Core Principle
The architecture balances backend data integrity with frontend presentation freedom to produce deterministic, high-quality UI/UX.

Concept:
- Data integrity (backend)
  + Presentation freedom (frontend)
  = Deterministic high-quality UI/UX

Responsibility split:
- Backend defines domain rules and guarantees correctness.
- Frontend defines presentation and interaction design.

### 2) Backend Responsibilities
Backend defines:
- domain models
- financial rules
- lifecycle states
- API contracts
- multi-tenant data isolation

Backend must NOT define:
- layout
- visual hierarchy
- styling
- UI composition

### 3) Frontend Responsibilities
Frontend defines:
- layout
- visual hierarchy
- interaction design
- navigation structure
- UI composition

Frontend must NOT modify:
- financial logic
- domain rules
- data integrity constraints

### 4) Frontend Architecture Layers
Layer 1 — Design Tokens
- colors
- spacing
- typography
- shadows
- motion

Layer 2 — Component System
- buttons
- inputs
- tables
- cards
- drawers
- modals
- charts

Layer 3 — Wireframes
- Structural layout definitions for application screens.
- Examples:
  - dashboard
  - customers
  - products
  - invoices
  - payments
- Wireframes define structure only and contain no styling.

Layer 4 — Renderer
- Schema-driven UI engine mapping:
  - wireframes → components → tokens
- Renderer ensures deterministic UI generation.

Layer 5 — Application Pages
- Next.js pages binding backend APIs to renderer schemas.

### 5) Determinism Rules
UI rendering must originate from:
- tokens
- components
- wireframes
- renderer schemas

Direct styling inside pages is not allowed.

### 6) No Drift Rule
Changes occur only at these levels:
- visual design → tokens
- interaction patterns → components
- layout structure → wireframes
- business data → backend

This prevents architectural drift.

### 7) Design Quality Goal
Target design quality comparable to:
- Stripe Dashboard
- Linear
- Notion

Characteristics:
- high visual clarity
- dense but readable data
- consistent interactions
- predictable layouts

### 8) Success Criteria
The system must deliver:
- strong financial data integrity
- deterministic UI architecture
- visually exceptional interface
- scalable maintainability

## 5. Domain Modules
- **tenants**
  - Tenant lifecycle, plan metadata, regional settings, feature entitlements.
  - Root context provider for all tenant-scoped operations.

- **auth**
  - Identity, sessions/tokens, SSO integration points, authorization primitives.
  - Enforces tenant-aware authentication context.

- **users**
  - User profile, membership, role assignment, access scope within tenant.
  - Coordinates with auth for identity-to-tenant mapping.

- **customers**
  - Customer accounts, billing contacts, addresses, tax identifiers.
  - Source entity for invoice recipient and billing preferences.

- **products**
  - Product/service catalog, pricing definitions, tax category references.
  - Provides immutable line-item snapshots at invoice creation time.

- **invoices**
  - Invoice draft/finalization lifecycle, numbering, totals, tax computation records.
  - Manages deterministic state transitions and payable balances.

- **payments**
  - Payment intents/records, settlement status, allocations to invoices.
  - Reconciliation and payment event normalization.

- **subscriptions**
  - Recurring billing agreements, cycle schedules, renewal/cancellation states.
  - Triggers recurring invoice creation through controlled workflows.

- **documents**
  - Template selection, document rendering inputs, generated artifact metadata.
  - Configuration-driven outputs (PDF/HTML/email payload references).

- **events/audit**
  - Immutable audit trail for financial and permission-sensitive changes.
  - Event timeline for traceability, compliance, and diagnostics.

## 6. Data Flow
Primary billing flow:
1. `tenant` establishes scope and business configuration.
2. `customers` are managed within tenant scope.
3. `invoices` are created for customers using product and pricing snapshots.
4. `payments` are captured and allocated to invoices.

Flow representation:
- `tenant -> customers -> invoices -> payments`

Optional recurring flow:
- `subscriptions -> recurring invoices`

Data flow constraints:
- All transitions are explicit and stateful.
- Financial mutations emit audit events.
- Read models may aggregate across modules, but writes remain module-owned.

## 7. Multi-Tenant Strategy
- Shared application runtime with strict logical tenant isolation.
- `tenant_id` is mandatory on all business entities and request contexts.
- Tenant-aware authorization guards every read/write operation.
- Query policies require tenant scoping by default; unscoped access is prohibited.
- Tenant-level configuration drives locale, currency, tax, invoice formatting, and feature flags.
- Scalability strategy supports tenant tiering (SME to enterprise) via workload partitioning and configurable limits.

## 8. Architectural Rules
1. **Tenant enforcement**: `tenant_id` is required for every business entity and transaction boundary.
2. **REST-only module communication**: modules interact through versioned REST APIs.
3. **No cross-repository access**: modules must not directly access another module’s repositories/tables.
4. **Comprehensive financial auditability**: all financial changes are logged in events/audit.
5. **Deterministic invoice lifecycle**: invoice states, numbering, totals, and transitions must be reproducible.
6. **Strict module boundaries**: each module owns its domain logic, persistence, and contracts.
7. **Configuration over branching logic**: templates and renderer schemas are configuration-driven.
8. **API-first evolution**: backend contracts are defined to support internal clients and external integrations consistently.
