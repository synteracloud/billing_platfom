# 06 Integration + Reconciliation

## Purpose
Define a deterministic ingestion and reconciliation contract for external financial sources (starting with Stripe and bank feeds) while preserving strict module boundaries.

This module integrates external data into normalized internal events and projection workflows. It is **not** a place for business decision logic or direct database mutation.

---

## 1) Connector interface

Connectors are source adapters only. They authenticate, fetch, and map external payloads into a normalized intake envelope.

### 1.1 Interface contract
Each connector must implement:
- `connector_id`: stable identifier (e.g., `stripe`, `bank_csv`, `bank_api_x`).
- `capabilities()`: declares supported object types (`payment`, `refund`, `payout`, `bank_transaction`, etc.).
- `fetch(cursor, window)`: retrieves source records incrementally with pagination.
- `normalize(raw_record)`: converts source-specific payload to canonical ingestion schema.
- `checkpoint(next_cursor)`: persists cursor/state through ingestion infrastructure.

### 1.2 Connector rules (separation enforced)
- Connectors **must not** apply billing/accounting business rules.
- Connectors **must not** determine invoice allocation outcomes.
- Connectors **must not** mutate internal domain tables.
- Connectors only produce normalized records + source metadata (ids, timestamps, hashes).

### 1.3 Error and idempotency contract
- Connector fetch/normalize output must include source record id and deterministic content hash.
- Retries must be safe; duplicate source records must map to the same dedupe key.
- Partial batch failures must isolate bad records without losing checkpoint integrity.

---

## 2) Ingestion flow

### 2.1 End-to-end flow
1. Scheduler triggers connector by source and tenant.
2. Connector fetches incremental records via cursor/window.
3. Records are normalized into canonical ingestion schema.
4. Ingestion layer validates schema and deduplicates by `(tenant, connector_id, source_id, hash)`.
5. Accepted records are appended to immutable intake/event log.
6. Domain processors consume normalized events and run business rules.
7. Projection/read models update from processor outputs.

### 2.2 Normalization schema requirements
Every normalized record should include at minimum:
- `tenant_id`
- `connector_id`
- `source_object_type`
- `source_object_id`
- `occurred_at` (source timestamp)
- `ingested_at` (platform timestamp)
- `currency`
- `gross_amount` and `net_amount` (when applicable)
- `direction` (`credit`/`debit` semantics for reconciliation)
- `raw_ref` (traceable pointer to raw payload storage)
- `payload_version`

### 2.3 Repo alignment constraints
- Prepare connectors for Stripe webhook/polling ingestion and bank statement/API ingestion.
- Keep connector-specific mappings isolated from domain services.
- Ensure ingestion writes only through ingestion/event interfaces (append-only), not direct entity updates.

---

## 3) Reconciliation rules

Reconciliation compares internal canonical events/projections with external settled activity using deterministic matching rules.

### 3.1 Matching strategy order (deterministic)
Apply rules in strict order until one match class is assigned:
1. **Exact reference match**: external reference == internal external reference.
2. **Strong tuple match**: `(tenant, currency, amount, counterparty_ref, date)` exact match.
3. **Windowed amount/date match**: exact amount + bounded date window + unique candidate.
4. **No match**: classify as exception.

If multiple candidates remain at any rule stage, classification is `ambiguous` (manual review), not auto-resolved.

### 3.2 Reconciliation outcomes
- `matched`: deterministic 1:1 or approved 1:n mapping as defined by rule set.
- `unmatched_external`: seen externally, not represented internally.
- `unmatched_internal`: internal expectation not seen externally.
- `ambiguous`: more than one valid candidate.
- `excluded`: filtered by explicit policy (e.g., pending, test mode).

### 3.3 Determinism and replayability
- Same input set + same rule version must always yield same outcomes.
- Rule version and run id must be stored with results.
- Reconciliation must be replayable for an as-of date range.
- Manual adjustments must be additive overrides with audit trail, never silent mutation of source facts.

---

## 4) Boundary enforcement (FIX)

To enforce separation between integration, domain logic, and persistence:
- Connector layer: fetch + normalize only.
- Ingestion layer: validate + dedupe + append immutable records.
- Domain layer: business logic (allocation, status transitions, ledger triggers).
- Reconciliation layer: deterministic matching + exception classification.
- Persistence policy: no direct DB mutation from connectors or reconciliation jobs; all state transitions go through domain/application services or append-only event pipelines.

---

## 5) QC checklist (10/10)

### 5.1 Connectors contain no business logic
- [ ] No allocation/pricing/status transition logic exists in connector modules.
- [ ] Connector output remains source-to-canonical mapping only.
- [ ] Connector failures do not trigger domain state mutation.

### 5.2 Normalization is consistent
- [ ] Canonical ingestion schema fields are present for Stripe and bank sources.
- [ ] Currency/amount/direction semantics are uniform across connectors.
- [ ] Dedupe keys are stable across retries and backfills.

### 5.3 Reconciliation is deterministic
- [ ] Matching rules execute in fixed order with explicit tie handling.
- [ ] Same inputs and rule version always produce identical classifications.
- [ ] Exceptions (`unmatched`, `ambiguous`) are explicit and auditable.
