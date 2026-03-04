# Database Schema Specification (PostgreSQL)

## 1) General Conventions

- **Database**: PostgreSQL.
- **Primary keys**: `id UUID` on every table.
- **Timestamps**: every table includes:
  - `created_at TIMESTAMPTZ NOT NULL`
  - `updated_at TIMESTAMPTZ NOT NULL`
- **Tenant scope**:
  - `tenant_id UUID NOT NULL` on all tenant-scoped tables.
  - `tenant` is the root table and does not include `tenant_id`.
- **Soft delete policy**:
  - `deleted_at TIMESTAMPTZ NULL` is used only on **non-financial** records (`user`, `customer`, `product`, `subscription`, `document`).
  - Financial/audit records (`invoice`, `invoice_line`, `payment`, `payment_allocation`, `event_log`) are not soft-deleted.
- **Money representation**:
  - All money amounts are stored as integer minor units: `BIGINT NOT NULL`.
  - Currency is always explicit via `CHAR(3)` ISO-4217 code.
  - No floating point columns for monetary values.
- **JSON extensibility**:
  - `JSONB` is used for metadata/settings fields requiring flexibility.

---

## 2) Table Definitions

### 2.1 `tenant`

**Columns**
- `id UUID NOT NULL`
- `name TEXT NOT NULL`
- `status TEXT NOT NULL` (e.g., `active`, `suspended`, `deactivated`)
- `base_currency CHAR(3) NOT NULL`
- `locale TEXT NOT NULL`
- `time_zone TEXT NOT NULL`
- `billing_settings JSONB NOT NULL DEFAULT '{}'::jsonb`
- `tax_settings JSONB NOT NULL DEFAULT '{}'::jsonb`
- `feature_entitlements JSONB NOT NULL DEFAULT '{}'::jsonb`
- `metadata JSONB NOT NULL DEFAULT '{}'::jsonb`
- `created_at TIMESTAMPTZ NOT NULL`
- `updated_at TIMESTAMPTZ NOT NULL`

**Primary key**
- `PRIMARY KEY (id)`

**Foreign keys**
- None.

**Uniqueness constraints**
- Optional (business decision): `UNIQUE (name)` if tenant names must be globally unique.

**Key indexes**
- `INDEX (status)`
- `INDEX (created_at)`

---

### 2.2 `user`

**Columns**
- `id UUID NOT NULL`
- `tenant_id UUID NOT NULL`
- `email CITEXT NOT NULL`
- `full_name TEXT NOT NULL`
- `role TEXT NOT NULL`
- `status TEXT NOT NULL` (e.g., `invited`, `active`, `disabled`)
- `last_login_at TIMESTAMPTZ NULL`
- `preferences JSONB NOT NULL DEFAULT '{}'::jsonb`
- `deleted_at TIMESTAMPTZ NULL`
- `created_at TIMESTAMPTZ NOT NULL`
- `updated_at TIMESTAMPTZ NOT NULL`

**Primary key**
- `PRIMARY KEY (id)`

**Foreign keys**
- `(tenant_id) -> tenant(id)`

**Uniqueness constraints**
- `UNIQUE (tenant_id, email)`

**Key indexes**
- `INDEX (tenant_id)`
- `INDEX (tenant_id, status)`
- `INDEX (tenant_id, deleted_at)`

---

### 2.3 `customer`

**Columns**
- `id UUID NOT NULL`
- `tenant_id UUID NOT NULL`
- `external_reference TEXT NULL`
- `legal_name TEXT NOT NULL`
- `display_name TEXT NULL`
- `billing_email CITEXT NULL`
- `billing_address JSONB NOT NULL DEFAULT '{}'::jsonb`
- `shipping_address JSONB NULL`
- `tax_identifier TEXT NULL`
- `currency_preference CHAR(3) NULL`
- `payment_terms_days INTEGER NULL`
- `status TEXT NOT NULL` (e.g., `active`, `archived`)
- `metadata JSONB NOT NULL DEFAULT '{}'::jsonb`
- `deleted_at TIMESTAMPTZ NULL`
- `created_at TIMESTAMPTZ NOT NULL`
- `updated_at TIMESTAMPTZ NOT NULL`

**Primary key**
- `PRIMARY KEY (id)`

**Foreign keys**
- `(tenant_id) -> tenant(id)`

**Uniqueness constraints**
- `UNIQUE (tenant_id, external_reference)` where `external_reference IS NOT NULL`

**Key indexes**
- `INDEX (tenant_id)`
- `INDEX (tenant_id, status)`
- `INDEX (tenant_id, billing_email)`
- `INDEX (tenant_id, deleted_at)`

---

### 2.4 `product`

**Columns**
- `id UUID NOT NULL`
- `tenant_id UUID NOT NULL`
- `sku TEXT NOT NULL`
- `name TEXT NOT NULL`
- `description TEXT NULL`
- `unit_price_minor BIGINT NOT NULL`
- `currency CHAR(3) NOT NULL`
- `tax_category TEXT NULL`
- `billing_type TEXT NOT NULL` (e.g., `one_time`, `recurring`)
- `is_active BOOLEAN NOT NULL DEFAULT TRUE`
- `metadata JSONB NOT NULL DEFAULT '{}'::jsonb`
- `deleted_at TIMESTAMPTZ NULL`
- `created_at TIMESTAMPTZ NOT NULL`
- `updated_at TIMESTAMPTZ NOT NULL`

**Primary key**
- `PRIMARY KEY (id)`

**Foreign keys**
- `(tenant_id) -> tenant(id)`

**Uniqueness constraints**
- `UNIQUE (tenant_id, sku)`

**Key indexes**
- `INDEX (tenant_id)`
- `INDEX (tenant_id, is_active)`
- `INDEX (tenant_id, billing_type)`
- `INDEX (tenant_id, deleted_at)`

---

### 2.5 `subscription`

**Columns**
- `id UUID NOT NULL`
- `tenant_id UUID NOT NULL`
- `customer_id UUID NOT NULL`
- `plan_reference TEXT NULL`
- `status TEXT NOT NULL` (e.g., `draft`, `active`, `paused`, `canceled`, `expired`)
- `start_date DATE NOT NULL`
- `end_date DATE NULL`
- `billing_frequency TEXT NOT NULL`
- `next_billing_date DATE NULL`
- `auto_renew BOOLEAN NOT NULL DEFAULT TRUE`
- `pricing_terms JSONB NOT NULL DEFAULT '{}'::jsonb`
- `canceled_at TIMESTAMPTZ NULL`
- `deleted_at TIMESTAMPTZ NULL`
- `created_at TIMESTAMPTZ NOT NULL`
- `updated_at TIMESTAMPTZ NOT NULL`

**Primary key**
- `PRIMARY KEY (id)`

**Foreign keys**
- `(tenant_id) -> tenant(id)`
- `(tenant_id, customer_id) -> customer(tenant_id, id)`

**Uniqueness constraints**
- Optional based on catalog strategy: `UNIQUE (tenant_id, customer_id, plan_reference)` where `plan_reference IS NOT NULL`

**Key indexes**
- `INDEX (tenant_id)`
- `INDEX (tenant_id, customer_id)`
- `INDEX (tenant_id, status, next_billing_date)`
- `INDEX (tenant_id, deleted_at)`

---

### 2.6 `invoice`

**Columns**
- `id UUID NOT NULL`
- `tenant_id UUID NOT NULL`
- `customer_id UUID NOT NULL`
- `subscription_id UUID NULL` (invoice may be one-off)
- `invoice_number TEXT NOT NULL`
- `status TEXT NOT NULL` (e.g., `draft`, `issued`, `partially_paid`, `paid`, `void`)
- `issue_date DATE NULL`
- `due_date DATE NULL`
- `currency CHAR(3) NOT NULL`
- `subtotal_minor BIGINT NOT NULL`
- `tax_minor BIGINT NOT NULL`
- `discount_minor BIGINT NOT NULL DEFAULT 0`
- `total_minor BIGINT NOT NULL`
- `amount_paid_minor BIGINT NOT NULL DEFAULT 0`
- `amount_due_minor BIGINT NOT NULL`
- `notes TEXT NULL`
- `issued_at TIMESTAMPTZ NULL`
- `voided_at TIMESTAMPTZ NULL`
- `metadata JSONB NOT NULL DEFAULT '{}'::jsonb`
- `created_at TIMESTAMPTZ NOT NULL`
- `updated_at TIMESTAMPTZ NOT NULL`

**Primary key**
- `PRIMARY KEY (id)`

**Foreign keys**
- `(tenant_id) -> tenant(id)`
- `(tenant_id, customer_id) -> customer(tenant_id, id)`
- `(tenant_id, subscription_id) -> subscription(tenant_id, id)` (nullable)

**Uniqueness constraints**
- `UNIQUE (tenant_id, invoice_number)` (required)

**Key indexes**
- `INDEX (tenant_id)`
- `INDEX (tenant_id, customer_id)`
- `INDEX (tenant_id, status)`
- `INDEX (tenant_id, issue_date)`
- `INDEX (tenant_id, due_date)`
- `INDEX (tenant_id, subscription_id)`

---

### 2.7 `invoice_line`

**Columns**
- `id UUID NOT NULL`
- `tenant_id UUID NOT NULL`
- `invoice_id UUID NOT NULL`
- `product_id UUID NULL`
- `description TEXT NOT NULL`
- `quantity NUMERIC(18,6) NOT NULL`
- `unit_price_minor BIGINT NOT NULL`
- `tax_rate_basis_points INTEGER NULL`
- `line_subtotal_minor BIGINT NOT NULL`
- `line_tax_minor BIGINT NOT NULL`
- `line_total_minor BIGINT NOT NULL`
- `currency CHAR(3) NOT NULL`
- `sort_order INTEGER NOT NULL DEFAULT 0`
- `metadata JSONB NOT NULL DEFAULT '{}'::jsonb`
- `created_at TIMESTAMPTZ NOT NULL`
- `updated_at TIMESTAMPTZ NOT NULL`

**Primary key**
- `PRIMARY KEY (id)`

**Foreign keys**
- `(tenant_id) -> tenant(id)`
- `(tenant_id, invoice_id) -> invoice(tenant_id, id)`
- `(tenant_id, product_id) -> product(tenant_id, id)` (nullable)

**Uniqueness constraints**
- `UNIQUE (tenant_id, invoice_id, sort_order)`

**Key indexes**
- `INDEX (tenant_id)`
- `INDEX (tenant_id, invoice_id)`
- `INDEX (tenant_id, product_id)`

---

### 2.8 `payment`

**Columns**
- `id UUID NOT NULL`
- `tenant_id UUID NOT NULL`
- `customer_id UUID NOT NULL`
- `payment_reference TEXT NULL`
- `payment_method TEXT NOT NULL`
- `payment_date DATE NOT NULL`
- `currency CHAR(3) NOT NULL`
- `amount_received_minor BIGINT NOT NULL`
- `allocated_minor BIGINT NOT NULL DEFAULT 0`
- `unallocated_minor BIGINT NOT NULL`
- `status TEXT NOT NULL` (e.g., `recorded`, `pending_settlement`, `settled`, `failed`, `refunded`)
- `metadata JSONB NOT NULL DEFAULT '{}'::jsonb`
- `created_at TIMESTAMPTZ NOT NULL`
- `updated_at TIMESTAMPTZ NOT NULL`

**Primary key**
- `PRIMARY KEY (id)`

**Foreign keys**
- `(tenant_id) -> tenant(id)`
- `(tenant_id, customer_id) -> customer(tenant_id, id)`

**Uniqueness constraints**
- Optional external idempotency: `UNIQUE (tenant_id, payment_reference)` where `payment_reference IS NOT NULL`

**Key indexes**
- `INDEX (tenant_id)`
- `INDEX (tenant_id, customer_id)`
- `INDEX (tenant_id, payment_date)`
- `INDEX (tenant_id, status)`

---

### 2.9 `payment_allocation`

**Columns**
- `id UUID NOT NULL`
- `tenant_id UUID NOT NULL`
- `payment_id UUID NOT NULL`
- `invoice_id UUID NOT NULL`
- `allocated_minor BIGINT NOT NULL`
- `allocation_date DATE NOT NULL`
- `created_by_user_id UUID NULL`
- `metadata JSONB NOT NULL DEFAULT '{}'::jsonb`
- `created_at TIMESTAMPTZ NOT NULL`
- `updated_at TIMESTAMPTZ NOT NULL`

**Primary key**
- `PRIMARY KEY (id)`

**Foreign keys**
- `(tenant_id) -> tenant(id)`
- `(tenant_id, payment_id) -> payment(tenant_id, id)`
- `(tenant_id, invoice_id) -> invoice(tenant_id, id)`
- `(tenant_id, created_by_user_id) -> user(tenant_id, id)` (nullable)

**Uniqueness constraints**
- Allow multiple partial allocations between same payment and invoice over time.
- Optional dedupe guard: `UNIQUE (tenant_id, payment_id, invoice_id, allocation_date, id)` is unnecessary due to PK; idempotency should be handled via API keys/event IDs.

**Key indexes**
- `INDEX (tenant_id)`
- `INDEX (tenant_id, payment_id)`
- `INDEX (tenant_id, invoice_id)`
- `INDEX (tenant_id, allocation_date)`

---

### 2.10 `document`

**Columns**
- `id UUID NOT NULL`
- `tenant_id UUID NOT NULL`
- `document_type TEXT NOT NULL` (e.g., `invoice_pdf`, `receipt_pdf`)
- `source_entity_type TEXT NOT NULL` (e.g., `invoice`, `payment`, `subscription`)
- `source_entity_id UUID NOT NULL`
- `template_reference TEXT NULL`
- `storage_uri TEXT NOT NULL`
- `checksum TEXT NULL`
- `generation_status TEXT NOT NULL` (e.g., `requested`, `generated`, `failed`)
- `generated_at TIMESTAMPTZ NULL`
- `metadata JSONB NOT NULL DEFAULT '{}'::jsonb`
- `deleted_at TIMESTAMPTZ NULL`
- `created_at TIMESTAMPTZ NOT NULL`
- `updated_at TIMESTAMPTZ NOT NULL`

**Primary key**
- `PRIMARY KEY (id)`

**Foreign keys**
- `(tenant_id) -> tenant(id)`
- Polymorphic `source_entity_id` is validated at application layer based on `source_entity_type`.

**Uniqueness constraints**
- Optional: `UNIQUE (tenant_id, document_type, source_entity_type, source_entity_id, checksum)` for deduped rendered artifacts.

**Key indexes**
- `INDEX (tenant_id)`
- `INDEX (tenant_id, source_entity_type, source_entity_id)`
- `INDEX (tenant_id, document_type)`
- `INDEX (tenant_id, generation_status)`
- `INDEX (tenant_id, deleted_at)`

---

### 2.11 `event_log`

**Columns**
- `id UUID NOT NULL`
- `tenant_id UUID NOT NULL`
- `event_type TEXT NOT NULL`
- `event_category TEXT NOT NULL` (e.g., `audit`, `financial`, `integration`)
- `entity_type TEXT NOT NULL` (e.g., `invoice`, `payment`, `payment_allocation`)
- `entity_id UUID NOT NULL`
- `actor_type TEXT NOT NULL` (e.g., `user`, `system`)
- `actor_id UUID NULL`
- `occurred_at TIMESTAMPTZ NOT NULL`
- `payload JSONB NOT NULL`
- `correlation_id UUID NULL`
- `idempotency_key TEXT NULL`
- `created_at TIMESTAMPTZ NOT NULL`
- `updated_at TIMESTAMPTZ NOT NULL`

**Primary key**
- `PRIMARY KEY (id)`

**Foreign keys**
- `(tenant_id) -> tenant(id)`
- `(tenant_id, actor_id) -> user(tenant_id, id)` (nullable for system events)
- `entity_id` polymorphic validation occurs at application layer.

**Uniqueness constraints**
- `UNIQUE (tenant_id, idempotency_key)` where `idempotency_key IS NOT NULL`

**Key indexes**
- `INDEX (tenant_id)`
- `INDEX (tenant_id, occurred_at DESC)`
- `INDEX (tenant_id, entity_type, entity_id)`
- `INDEX (tenant_id, event_category)`
- `INDEX (tenant_id, correlation_id)`

---

## 3) Constraints and Indexes

### Global integrity constraints
- Add non-negative checks for money columns, e.g.:
  - `subtotal_minor >= 0`, `tax_minor >= 0`, `total_minor >= 0`, `amount_due_minor >= 0`
  - `allocated_minor >= 0`, `unallocated_minor >= 0`, `allocated_minor <= amount_received_minor`
  - `payment_allocation.allocated_minor > 0`
- Add value checks where helpful:
  - `currency ~ '^[A-Z]{3}$'`
  - controlled enums/check constraints for statuses and types.

### Financial consistency constraints
- `invoice.amount_due_minor = invoice.total_minor - invoice.amount_paid_minor`
- `payment.unallocated_minor = payment.amount_received_minor - payment.allocated_minor`
- `payment.currency` should match allocated invoice currency under same tenant (enforced by service policy or DB trigger if strict DB enforcement is required).

### Relationship constraints (domain rules)
- `invoice` has many `invoice_line` via `(tenant_id, invoice_id)`.
- `invoice` belongs to `customer` via `(tenant_id, customer_id)`.
- `payment` belongs to `customer` via `(tenant_id, customer_id)`.
- `payment_allocation` maps `payment -> invoice`, supporting:
  - partial allocation (many rows for a payment),
  - multi-invoice allocation (same payment across multiple invoices).
- `invoice.subscription_id` is nullable for one-off invoices.
- `event_log` is append-only and immutable for financial audit trails.

---

## 4) Money, Currency, Rounding Notes

- **No floats for money**: use integer minor units (`BIGINT`) everywhere.
- **Currency required** on monetary entities (`product`, `invoice`, `invoice_line`, `payment`).
- **Rounding policy**:
  - compute line amounts first,
  - apply tax/discount rules deterministically,
  - sum line totals to produce invoice totals,
  - store final results only as integer minor units.
- **Tax precision input** can be stored as basis points (e.g., `tax_rate_basis_points`) to avoid floating-point ambiguity.
- **Cross-currency allocations** are disallowed unless explicit FX workflow is introduced.

---

## 5) Multi-Tenant Data Isolation Notes

- Every tenant-scoped table includes `tenant_id` and an index beginning with `tenant_id`.
- Tenant-safe FK strategy:
  1. Reference targets expose composite uniqueness on `(tenant_id, id)` (commonly via PK + additional unique index).
  2. Child tables reference parents using **composite foreign keys** `(tenant_id, parent_id) -> parent(tenant_id, id)`.
  3. This prevents cross-tenant references even if a UUID from another tenant is known.
- Query discipline:
  - all read/write paths must include tenant predicates,
  - unscoped queries are prohibited in application services,
  - row-level security (RLS) can be layered on top as a defense-in-depth control.

