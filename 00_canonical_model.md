# Canonical Financial Model

This document defines the canonical entity model for the billing platform so current modules and future modules can share consistent naming, field semantics, and event contracts.

## 1) Canonical entities

### 1.1 `invoice`
Commercial receivable document issued to a customer.

Core responsibilities:
- captures billed charges (line-level and header totals)
- controls lifecycle states (`draft`, `issued`, `partially_paid`, `paid`, `void`)
- acts as allocation target for payments and source for receivable projections

### 1.2 `payment`
Inbound customer money movement record.

Core responsibilities:
- records cash intent/outcome (`recorded`, `pending_settlement`, `settled`, `failed`, `refunded`, `void`)
- tracks total, allocated, and unallocated amounts
- links to invoices through allocation records

### 1.3 `bill`
Vendor-facing payable document (AP mirror of invoice).

Core responsibilities:
- captures obligations owed to vendors/suppliers
- supports future AP workflows without overloading invoice semantics

### 1.4 `account`
Ledger account dimension used for postings and balances.

Core responsibilities:
- defines chart-of-accounts identity and classification
- provides posting destination for ledger entries

### 1.5 `ledger_entry`
Immutable double-entry posting line (or line group) representing financial truth.

Core responsibilities:
- persists debit/credit effects per account
- references source business entity (`invoice`, `payment`, `bill`, etc.)

### 1.6 `bank_transaction`
External bank feed or settlement transaction normalized to platform shape.

Core responsibilities:
- stores bank-originated movement metadata
- supports reconciliation against `payment` and `ledger_entry`

## 2) Shared fields and naming rules

## 2.1 Global conventions
- Use **snake_case** for persisted/entity keys.
- Use `_id` suffix for references (`customer_id`, `invoice_id`).
- Use `_at` suffix for timestamps (`created_at`, `issued_at`).
- Use `_date` for date-only values (`due_date`, `payment_date`).
- Use `_minor` for integer monetary amounts in minor units (`total_minor`).
- Use explicit lifecycle fields (`status`) with domain-specific enums.
- Use `metadata` as extensibility bag (`Record<string, unknown> | null`).

## 2.2 Required shared envelope (all canonical entities)
- `id: string`
- `tenant_id: string`
- `created_at: string`
- `updated_at: string`
- `metadata: Record<string, unknown> | null` (recommended baseline)

## 2.3 Financial entity shared fields (`invoice`, `payment`, `bill`, `ledger_entry`, `bank_transaction`)
- `currency: string` (ISO-4217)
- `status: string` (entity-specific enum)
- one or more normalized amount fields ending in `_minor`

## 2.4 Relationship naming
- Use direct relation ids rather than ambiguous aliases:
  - `customer_id` (not `client_id`)
  - `invoice_id` (not `inv_id`)
  - `payment_id` (not `txn_id`)
  - `account_id` (not `ledger_account`)

## 3) Uniform event schema

Use one event envelope across domains:

```ts
interface DomainEvent {
  id: string;
  tenant_id: string;
  event_type: string;        // e.g. invoice_issued, payment_allocated
  event_category: 'audit' | 'financial' | 'integration';
  entity_type: string;       // invoice | payment | bill | ledger_entry | bank_transaction | ...
  entity_id: string;
  actor_type: 'user' | 'system';
  actor_id: string | null;
  occurred_at: string;       // RFC3339 timestamp
  payload: Record<string, unknown>;
  correlation_id: string | null;
  idempotency_key: string | null;
  created_at: string;
  updated_at: string;
}
```

Event rules:
- `event_type` format: `<entity>_<action>` in snake_case.
- `entity_type` must be canonical entity naming.
- `occurred_at` is business occurrence time; `created_at` is persistence time.
- `payload` should contain domain delta/details, not duplicate the full entity unless required.

## 4) Repo alignment: existing invoice/payment models

Current backend models already follow canonical snake_case and event envelope conventions, so alignment is done by field normalization in shared types (without changing storage structure).

### 4.1 Invoice alignment
- preserve `invoice` naming and lifecycle
- normalize optional/nullability to match backend reality:
  - `subscription_id` included
  - `issue_date` and `due_date` allow `null`
  - `notes`, `issued_at`, `voided_at` allow `null`
  - `metadata` uses nullable canonical shape

### 4.2 Payment alignment
- preserve `payment` naming and allocation semantics
- normalize to backend lifecycle and nullability:
  - include `void` in `PaymentStatus`
  - `payment_reference` allows `null`
  - `metadata` uses nullable canonical shape

### 4.3 Non-breaking principle
- no table or module ownership changes in this pass
- no unnecessary renames to existing stable fields
- changes limited to normalization for cross-module consistency and future entity expansion (`bill`, `account`, `ledger_entry`, `bank_transaction`)
