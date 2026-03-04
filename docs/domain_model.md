# Domain Model

## 1. Domain Overview
The billing platform is a global, multi-tenant SaaS where each tenant represents a business operating independent billing workflows. The domain centers on deterministic financial operations: tenants manage customers and products, issue invoices, receive and allocate payments, automate recurring billing through subscriptions, generate documents, and maintain auditable event trails.

The model is tenant-scoped by default: every business entity is owned by exactly one tenant and cannot be accessed or mutated outside that tenant boundary.

## 2. Entity Definitions

### Tenant
**Purpose**  
Represents a business account that uses the platform and defines the root ownership boundary for all domain data.

**Key attributes**  
- `id`
- `name`
- `status` (for example: active, suspended)
- `base_currency`
- `locale`
- `time_zone`
- `billing_settings` (invoice numbering, payment terms defaults)
- `tax_settings`
- `feature_entitlements`
- `created_at`, `updated_at`

**Ownership (tenant-scoped)**  
- Root entity; does not belong to another tenant.
- Owns all other business entities.

**Lifecycle**  
Provisioned → Active → Suspended/Restricted → Deactivated.

---

### User
**Purpose**  
Represents a person who accesses the platform within a tenant context.

**Key attributes**  
- `id`
- `tenant_id`
- `email`
- `full_name`
- `role` (owner, admin, accountant, viewer, etc.)
- `status` (invited, active, disabled)
- `last_login_at`
- `created_at`, `updated_at`

**Ownership (tenant-scoped)**  
- Belongs to exactly one `Tenant` through `tenant_id`.

**Lifecycle**  
Invited → Active → Disabled (optional reactivation).

---

### Customer
**Purpose**  
Represents a bill-to client of a tenant.

**Key attributes**  
- `id`
- `tenant_id`
- `external_reference`
- `legal_name`
- `display_name`
- `billing_email`
- `billing_address`
- `shipping_address` (optional)
- `tax_identifier`
- `currency_preference` (optional)
- `payment_terms_days`
- `status` (active, archived)
- `created_at`, `updated_at`

**Ownership (tenant-scoped)**  
- Belongs to exactly one `Tenant`.

**Lifecycle**  
Created → Active → Archived.

---

### Product
**Purpose**  
Represents a product or service sold by a tenant, including pricing metadata used during invoice creation.

**Key attributes**  
- `id`
- `tenant_id`
- `sku` or `code`
- `name`
- `description`
- `unit_price_minor`
- `currency`
- `tax_category`
- `billing_type` (one_time, recurring)
- `is_active`
- `created_at`, `updated_at`

**Ownership (tenant-scoped)**  
- Belongs to exactly one `Tenant`.

**Lifecycle**  
Draft/Created → Active → Retired.

---

### Invoice
**Purpose**  
Represents a bill issued by a tenant to a customer, with deterministic totals, tax records, and payable balance.

**Key attributes**  
- `id`
- `tenant_id`
- `customer_id`
- `invoice_number`
- `status` (`draft`, `issued`, `partially_paid`, `paid`, `void`)
- `issue_date`
- `due_date`
- `currency`
- `subtotal_minor`
- `tax_minor`
- `discount_minor`
- `total_minor`
- `amount_paid_minor`
- `amount_due_minor`
- `notes`
- `created_at`, `updated_at`, `issued_at`, `voided_at`

**Ownership (tenant-scoped)**  
- Belongs to exactly one `Tenant`.
- References a `Customer` in the same tenant.

**Lifecycle**  
Draft → Issued → Partially Paid → Paid, with Void available from allowed pre-settlement states by policy.

---

### InvoiceLine
**Purpose**  
Represents a single billable line item on an invoice.

**Key attributes**  
- `id`
- `tenant_id`
- `invoice_id`
- `product_id` (optional reference)
- `description`
- `quantity`
- `unit_price_minor`
- `tax_rate` or `tax_code`
- `line_subtotal_minor`
- `line_tax_minor`
- `line_total_minor`
- `sort_order`

**Ownership (tenant-scoped)**  
- Belongs to exactly one `Tenant`.
- Belongs to exactly one `Invoice` in the same tenant.

**Lifecycle**  
Mutable while invoice is Draft; immutable snapshot once invoice is Issued.

---

### Payment
**Purpose**  
Represents money received from a customer and tracked for allocation against one or more invoices.

**Key attributes**  
- `id`
- `tenant_id`
- `customer_id`
- `payment_reference`
- `payment_method`
- `payment_date`
- `currency`
- `amount_received_minor`
- `status` (recorded, pending_settlement, settled, failed, refunded)
- `unallocated_minor`
- `allocated_minor`
- `metadata` (gateway/provider references)
- `created_at`, `updated_at`

**Ownership (tenant-scoped)**  
- Belongs to exactly one `Tenant`.
- Typically associated with one `Customer` in the same tenant.

**Lifecycle**  
Recorded/Pending → Settled → (optional) Refunded/Reversed with traceable adjustments.

---

### PaymentAllocation
**Purpose**  
Represents an allocation record linking a payment amount to a specific invoice.

**Key attributes**  
- `id`
- `tenant_id`
- `payment_id`
- `invoice_id`
- `allocated_minor`
- `allocation_date`
- `created_by_user_id` (optional)
- `metadata`
- `created_at`, `updated_at`

**Ownership (tenant-scoped)**  
- Belongs to exactly one `Tenant`.
- Belongs to exactly one `Payment` in the same tenant.
- Belongs to exactly one `Invoice` in the same tenant.

**Lifecycle**  
Created append-only as part of payment allocation workflow; reversals are modeled by compensating financial operations per policy.

---

### Subscription
**Purpose**  
Represents recurring billing configuration used to generate invoices on a schedule.

**Key attributes**  
- `id`
- `tenant_id`
- `customer_id`
- `plan_reference`
- `status` (draft, active, paused, canceled, expired)
- `start_date`
- `end_date` (optional)
- `billing_frequency` (monthly, quarterly, yearly, custom)
- `next_billing_date`
- `auto_renew`
- `pricing_terms` (amounts, quantities, taxes)
- `created_at`, `updated_at`, `canceled_at`

**Ownership (tenant-scoped)**  
- Belongs to exactly one `Tenant`.
- References one `Customer` in the same tenant.

**Lifecycle**  
Draft → Active → Paused/Active → Canceled or Expired.

---

### Document
**Purpose**  
Represents generated financial artifacts such as invoice PDFs, receipts, credit notes, and delivery formats.

**Key attributes**  
- `id`
- `tenant_id`
- `document_type` (invoice_pdf, receipt_pdf, etc.)
- `source_entity_type` (invoice, payment, subscription)
- `source_entity_id`
- `template_reference`
- `storage_uri`
- `checksum`
- `generation_status`
- `generated_at`
- `created_at`

**Ownership (tenant-scoped)**  
- Belongs to exactly one `Tenant`.
- Tied to a source entity within the same tenant.

**Lifecycle**  
Requested → Generated → Delivered/Archived (or Failed with retry).

---

### EventLog
**Purpose**  
Represents immutable audit/system events for financial and permission-sensitive operations.

**Key attributes**  
- `id`
- `tenant_id`
- `event_type`
- `event_category` (audit, financial, integration)
- `entity_type`
- `entity_id`
- `actor_type` (user, system)
- `actor_id`
- `occurred_at`
- `payload` (change details)
- `correlation_id`
- `idempotency_key` (optional)

**Ownership (tenant-scoped)**  
- Belongs to exactly one `Tenant`.

**Lifecycle**  
Append-only and immutable after creation.

## 3. Entity Relationships

### Tenant-centric relationships
- `Tenant` 1 → many `Users`
- `Tenant` 1 → many `Customers`
- `Tenant` 1 → many `Products`
- `Tenant` 1 → many `Invoices`
- `Tenant` 1 → many `Payments`
- `Tenant` 1 → many `Subscriptions`
- `Tenant` 1 → many `Documents`
- `Tenant` 1 → many `EventLogs`

### Customer relationships
- `Customer` 1 → many `Invoices`
- `Customer` 1 → many `Payments`
- `Customer` 1 → many `Subscriptions`

### Invoice relationships
- `Invoice` 1 → many `InvoiceLines`
- `Invoice` many ↔ many `Payments` (through payment allocations)
- `Invoice` 1 → many `Documents` (invoice PDF versions, etc.)
- `Invoice` 1 → many `EventLogs`

### Subscription relationships
- `Subscription` many → 1 `Customer`
- `Subscription` generates recurring `Invoices` according to schedule and pricing terms.

### Additional relationship constraints
- Cross-tenant relationships are invalid.
- Referenced entities (for example `invoice.customer_id`) must belong to the same tenant.
- Financial mutations (invoice state changes, payment allocations, voids, refunds) should emit `EventLogs`.

## 4. Invoice Lifecycle
Invoice state machine:

1. **Draft**
   - Invoice is being prepared and can be edited.
   - Line items, taxes, discounts, and due date are mutable.
2. **Issued**
   - Invoice is finalized and communicated to customer.
   - Financial totals and line snapshots become immutable.
3. **Partially Paid**
   - One or more payments allocated, but `amount_due > 0`.
4. **Paid**
   - Fully settled, `amount_due = 0`.
5. **Void**
   - Invoice canceled according to policy and no longer collectible.

State transition expectations:
- Draft → Issued
- Issued → Partially Paid
- Issued → Paid
- Partially Paid → Paid
- Draft or Issued → Void (subject to tenant policy and compliance rules)
- Void and Paid are terminal in normal operation.

## 5. Payment Allocation
Payments use an allocation model that supports one-to-many and many-to-many settlement scenarios.

- A single `Payment` may be allocated to one or more `Invoices`.
- A single `Invoice` may be settled by one or more `Payments`.
- Allocation records should track:
  - `payment_id`
  - `invoice_id`
  - `allocated_minor`
  - `allocation_date`
  - optional `allocation_reference`/notes
- `Payment.unallocated_minor` decreases as allocations are made.
- `Invoice.amount_paid_minor` and `Invoice.amount_due_minor` are recalculated deterministically from allocation totals.
- Allocations must enforce:
  - same-tenant linkage between payment and invoice
  - currency compatibility or explicit FX policy
  - no over-allocation beyond payment available amount
  - no overpayment beyond invoice payable amount unless explicit credit handling is enabled

## 6. Multi-Tenant Rules
1. **Mandatory tenant ownership**: All domain entities carry `tenant_id` and belong to exactly one tenant.
2. **Strict isolation**: Reads/writes must always be scoped by tenant; unscoped access is prohibited.
3. **Intra-tenant integrity**: Entity references are valid only when all linked records share the same `tenant_id`.
4. **Tenant-aware authorization**: User actions are permitted only within memberships and roles for their tenant.
5. **Tenant-configured behavior**: Locale, currency, tax policy, invoice numbering, and feature flags are resolved from tenant settings.
6. **Auditability by tenant**: Financial and sensitive domain changes must emit immutable tenant-scoped event logs.
