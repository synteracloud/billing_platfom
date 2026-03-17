# 03 Event System

## Purpose
Define a single event system contract for all billing modules so events are:
- consistently named,
- lifecycle-aware,
- idempotent by default,
- and migration-safe from the current `event_log` implementation.

This document aligns with `00_canonical_model.md`, `01_system_overview.md`, and `02_financial_model.md`.

---

## 1) Canonical event structure (normalized contract)

Use one normalized event envelope for all domains.

```ts
interface DomainEventV1 {
  // identity
  id: string;                            // event UUID
  event_version: 1;                      // contract version

  // tenancy + time
  tenant_id: string;
  occurred_at: string;                   // business time (RFC3339 UTC)
  recorded_at: string;                   // persistence time (RFC3339 UTC)

  // classification
  event_type: string;                    // <entity>_<action>, snake_case
  event_category: 'audit' | 'financial' | 'integration';

  // aggregate linkage
  entity_type: string;                   // invoice | payment | subscription | document | ...
  entity_id: string;

  // actor + tracing
  actor_type: 'user' | 'system';
  actor_id: string | null;
  correlation_id: string | null;         // end-to-end request/workflow id
  causation_id: string | null;           // parent event/command id

  // idempotency + schema
  idempotency_key: string | null;        // command/API idempotency
  payload_schema: string;                // e.g. billing.invoice_issued.v1

  // domain data
  payload: Record<string, unknown>;
}
```

### 1.1 Field normalization rules (FIX: normalize contracts)
- `recorded_at` is the normalized name for persistence time (`created_at` in current storage).
- `event_version` is required and starts at `1`.
- `payload_schema` is required for typed payload evolution.
- `payload` must be object-shaped and non-null (`{}` minimum).
- `occurred_at` is producer-defined business time; never rewritten by consumers.

### 1.2 Required payload minimum
Every event payload must include:
- `entity_snapshot_version` (integer, optimistic aggregate version),
- `change_summary` (short machine-readable delta summary),
- module-specific fields (examples below).

---

## 2) Naming conventions (10/10 consistency)

### 2.1 Event type format
`event_type` MUST follow:
- `<entity>_<past_tense_action>`
- snake_case only
- singular entity

Examples:
- `invoice_created`
- `invoice_issued`
- `invoice_voided`
- `payment_recorded`
- `payment_allocated`
- `payment_voided`
- `subscription_created`
- `subscription_cancelled`
- `document_generated`
- `document_sent`

### 2.2 Event category intent
- `financial`: changes affecting balances/receivables/payables/cash/accounting truth.
- `audit`: security/permission/sensitive state transitions.
- `integration`: adapter/webhook/provider interactions.

### 2.3 Entity naming
`entity_type` must match canonical domain names from the service map/canonical model:
- `invoice`, `payment`, `subscription`, `document`, `customer`, `product`, `user`, `tenant`, `ledger_entry`, `bill`, `bank_transaction`.

### 2.4 Prohibited naming patterns
- No camelCase (`invoiceIssued`).
- No dotted event names in storage (`invoice.issued`).
- No ambiguous aliases (`txn_recorded`, `client_created`).

---

## 3) Event lifecycle

All modules follow the same lifecycle:

1. **Command accepted**
   - API command validated (auth, tenancy, business invariants).
2. **State transition committed**
   - Source aggregate change is persisted atomically.
3. **Event materialized**
   - Domain event is created with canonical contract.
4. **Event persisted to event log**
   - Append-only write (`event_log`).
5. **Event published/consumed**
   - Internal subscribers/read models process event.
6. **Projection updates**
   - Dashboard/AR/AP/analytics projections update asynchronously.
7. **Auditable retention**
   - Immutable event history retained for replay/compliance.

### Lifecycle guarantees
- No event without corresponding committed state transition.
- No in-place mutation of persisted events.
- Reprocessing an already-seen event must be safe (idempotent consumer behavior).

---

## 4) Idempotency model (enforced)

## 4.1 Producer idempotency (commands -> events)
For any mutating command, dedupe key scope is:
`(tenant_id, source, idempotency_key)` where `source` is typically `HTTP_METHOD + canonical_path`.

Rules:
- Same scope + same normalized payload -> return original result; do not emit duplicate event.
- Same scope + different payload -> reject with conflict.
- Retention window: minimum 24h (recommended 72h+ for payment flows).

## 4.2 Event-level idempotency
Each event should provide deterministic dedupe identity for downstream consumers:
- primary: `id` (UUID),
- optional deterministic: `dedupe_fingerprint = hash(tenant_id + event_type + entity_id + occurred_at + idempotency_key)`.

Consumers must persist processed event IDs/fingerprints and ignore duplicates.

## 4.3 Consumer idempotency
Projectors/handlers must be upsert/replay-safe:
- ledger posting: enforce unique (`tenant_id`, `source_event_id`, `entry_role`).
- read models: monotonic version checks using `entity_snapshot_version`.
- side effects (email/webhook): outbound dedupe table keyed by (`tenant_id`, `event_id`, `channel`).

---

## 5) Repo alignment: current `event_log` -> real domain events

Current repository already has an append-only events module and stable event types. Alignment turns generic logs into explicit domain events with normalized contract semantics.

### 5.1 Current state (observed)
- Event storage fields already include: `event_type`, `event_category`, `entity_type`, `entity_id`, `occurred_at`, `payload`, `correlation_id`, `idempotency_key`.
- Invoice and payment services already emit financial domain events.
- Event type catalog is already snake_case and domain-oriented.

### 5.2 Mapping table

| Current `event_log` concept | Domain event system meaning | Action |
|---|---|---|
| `event_log` row | immutable `DomainEventV1` record | reinterpret + normalize |
| `created_at` | `recorded_at` | rename at contract layer |
| `updated_at` | immutable metadata timestamp (deprecated for events) | stop semantic use for event mutation |
| `event_type` | canonical domain action name | keep |
| `payload` | schema-bound event payload | add `payload_schema` + minimum payload fields |
| `idempotency_key` | producer dedupe key | enforce across all mutating endpoints |

### 5.3 Module coverage map
- **Invoices**: `invoice_created`, `invoice_issued`, `invoice_voided`
- **Payments**: `payment_recorded`, `payment_allocated`, `payment_voided`
- **Subscriptions**: `subscription_created`, `subscription_cancelled`
- **Documents**: `document_generated`, `document_sent`
- **Future modules**:
  - Ledger: `ledger_entry_posted`, `ledger_entry_reversed`
  - AR/AP: `receivable_overdue_marked`, `bill_issued`, `bill_voided`
  - Integrations: provider/webhook normalization events in `integration` category

---

## 6) Migration path

### Phase 0 — Contract freeze (now)
- Keep current storage table/API shape.
- Declare normalized `DomainEventV1` contract in docs and service interfaces.

### Phase 1 — Write-path normalization
- Ensure all event producers populate:
  - deterministic `idempotency_key` for mutating commands,
  - `payload_schema`,
  - `entity_snapshot_version`, `change_summary` in payload.
- Standardize `event_type` validation to convention rules.

### Phase 2 — Read-path compatibility
- Events API returns both:
  - persisted fields (`created_at`) for backward compatibility,
  - normalized aliases (`recorded_at`, `event_version`) for forward adoption.

### Phase 3 — Consumer hardening
- Add consumer dedupe tables/constraints.
- Enforce replay-safe handlers and side-effect dedupe.

### Phase 4 — Full domain-event mode
- Treat `event_log` as authoritative domain event store.
- Deprecate any non-domain "activity log" semantics not tied to aggregate transitions.

---

## 7) Contract examples

### 7.1 `invoice_issued`
```json
{
  "id": "evt_01",
  "event_version": 1,
  "tenant_id": "ten_123",
  "occurred_at": "2026-01-20T10:00:00Z",
  "recorded_at": "2026-01-20T10:00:01Z",
  "event_type": "invoice_issued",
  "event_category": "financial",
  "entity_type": "invoice",
  "entity_id": "inv_100",
  "actor_type": "system",
  "actor_id": null,
  "correlation_id": "req_abc",
  "causation_id": null,
  "idempotency_key": "idem_issue_inv_100",
  "payload_schema": "billing.invoice_issued.v1",
  "payload": {
    "entity_snapshot_version": 3,
    "change_summary": "status:draft->issued",
    "invoice_number": "INV-2026-001",
    "total_minor": 125000,
    "currency": "USD"
  }
}
```

### 7.2 `payment_allocated`
```json
{
  "id": "evt_02",
  "event_version": 1,
  "tenant_id": "ten_123",
  "occurred_at": "2026-01-20T10:05:00Z",
  "recorded_at": "2026-01-20T10:05:01Z",
  "event_type": "payment_allocated",
  "event_category": "financial",
  "entity_type": "payment",
  "entity_id": "pay_200",
  "actor_type": "user",
  "actor_id": "usr_9",
  "correlation_id": "req_xyz",
  "causation_id": "evt_01",
  "idempotency_key": "idem_allocate_pay_200",
  "payload_schema": "billing.payment_allocated.v1",
  "payload": {
    "entity_snapshot_version": 4,
    "change_summary": "allocated_minor:+50000",
    "allocations": [
      { "invoice_id": "inv_100", "allocated_minor": 50000 }
    ],
    "allocated_minor": 50000,
    "unallocated_minor": 75000,
    "currency": "USD"
  }
}
```

---

## 8) Quality control checklist (10/10)

- [x] **Consistent event naming**: strict `<entity>_<past_tense_action>` snake_case convention defined and examples aligned.
- [x] **Supports all modules**: current modules mapped; future Ledger/AR/AP/Integrations event set included.
- [x] **Idempotency enforced**: producer, event-level, and consumer idempotency rules specified with conflict behavior.
- [x] **FIX applied**: contracts normalized (`recorded_at`, `event_version`, `payload_schema`, payload minimums) with backward-compatible migration path.
