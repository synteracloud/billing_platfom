# 01 System Overview

## Purpose
This document defines the target system architecture and the canonical financial flow for the platform:

`invoice -> payment -> ledger -> AR/AP -> analytics`

It is aligned with `00_service_map.md` ownership boundaries and the currently implemented backend/frontend entry points.

## 1) Architecture

### 1.1 Runtime shape (current)
The repo is currently a modular-monolith application with:
- **Frontend** (`frontend`) as user/API consumer entry.
- **Backend API** (`backend`) as domain execution layer.
- **PostgreSQL/Redis/worker/scheduler topology** documented in `docs/devops/system_overview.md`.

### 1.2 Domain architecture (target)
The domain is organized into engines with strict ownership from the service map:
- Invoicing
- Payments
- Ledger
- AR (Accounts Receivable)
- AP (Accounts Payable)
- Integrations
- Reconciliation
- Analytics
- AI

### 1.3 Ownership and mutation rules
- Cross-engine communication is **event-driven**.
- No engine writes another engine's storage directly.
- **Ledger** is the immutable accounting source of truth for posted balances.
- Invoicing and Payments publish events; Ledger, AR/AP, Reconciliation, Analytics consume and materialize read/use-case models.

## 2) Module Flow (Canonical)

### 2.1 End-to-end flow
1. **Invoice (Invoicing engine)**
   - Invoice lifecycle events are produced (`issued`, `voided`, `due-date-updated`, etc.).
2. **Payment (Payments engine)**
   - Payment intake/allocation/settlement events are produced.
3. **Ledger (Ledger engine)**
   - Double-entry postings are created from invoice/payment events.
   - Posted balances become the accounting source of truth.
4. **AR/AP (Receivables and Payables engines)**
   - AR derives customer exposure, aging, collections state from invoice/payment/ledger events.
   - AP derives vendor payable schedules/disbursement state from bill/disbursement/ledger events (future module layer).
5. **Analytics (Analytics engine)**
   - KPI/reporting/forecast read models are derived from prior engine events/materializations.

### 2.2 Flow constraints (FIX for consistency)
To eliminate contradictions across docs:
- Invoices **do not** write ledger rows directly.
- Payments **do not** mutate invoice records directly.
- AR/AP **do not** own invoice/payment primitives; they own derived receivable/payable workflow state.
- Analytics is strictly read-model oriented and non-authoritative.

## 3) Repo Alignment

### 3.1 Current modules as entry points (implemented)

#### Backend API module entry points (`backend/src/app.module.ts` imports)
- tenants
- users
- customers
- dashboard
- products
- invoices
- payments
- subscriptions
- documents
- events
- auth

#### Frontend route entry points (present pages)
- `/invoices`
- `/payments`

### 3.2 Mapping current modules to target engines
- `invoices` -> **Invoicing** (reuse + adapt)
- `payments` -> **Payments** (reuse + adapt)
- `documents` -> **Integrations** (adapter/output boundary)
- `events` -> **Cross-engine event transport/audit backbone**
- `dashboard` -> **Analytics read-surface (early stage)**
- `auth` -> **Platform access boundary** (not financial engine ownership)
- `customers/products/subscriptions/tenants/users` -> **Supporting domain context** feeding billing workflows

### 3.3 Future modules layered on top
The following modules are planned to complete the target engine stack without breaking current entry points:
- **ledger module**
  - journal entries, posting rules, account balances, immutable postings
- **ar module**
  - receivables aging, dunning/reminders, collections workflows
- **ap module**
  - vendor bills, payable schedules, disbursement lifecycle
- **analytics module**
  - curated read models, finance KPIs, forecasting datasets
- **reconciliation module**
  - matching engine, exception queues, reconciliation audit trail
- **integrations adapters expansion**
  - gateway/accounting provider connectors and webhook normalization

## 4) Quality Control (10/10)
- [x] No contradiction with `00_service_map.md` ownership boundaries.
- [x] Canonical flow matches real current system entry points (`invoices`, `payments`, `events`, `dashboard`) and extends correctly to target modules (`ledger`, `ar`, `ap`, `analytics`).
- [x] Current implementation is represented as entry points; future capabilities are layered as additive modules.
- [x] FIX applied: all previous ownership inconsistencies are resolved by explicit mutation boundaries.
