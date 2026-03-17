# 04 Ledger Engine

## Purpose
Define the accounting ledger as an append-only, event-driven subsystem that:
- enforces strict double-entry accounting,
- posts entries idempotently from billing domain events,
- guarantees immutability of posted records,
- and remains decoupled from application modules.

This spec aligns with `00_canonical_model.md`, `01_system_overview.md`, `02_financial_model.md`, and `03_event_system.md`.

---

## 1) Core model

## 1.1 Accounts
Accounts are the chart-of-accounts primitives that classify financial position and movement.

### Canonical account shape
```ts
interface LedgerAccount {
  id: string;                              // UUID
  tenant_id: string;
  code: string;                            // unique per tenant, e.g. 1100, 1200, 4000
  name: string;                            // Accounts Receivable, Cash, Revenue
  type: 'asset' | 'liability' | 'equity' | 'revenue' | 'expense';
  normal_side: 'debit' | 'credit';         // derived from type, persisted for validation speed
  currency: string;                        // ISO 4217, e.g. USD
  status: 'active' | 'archived';
  created_at: string;                      // RFC3339 UTC
  archived_at: string | null;
}
```

### Account invariants (FIX: enforce invariants)
- `code` must be unique within `(tenant_id)`.
- `type` is immutable after first posted entry references the account.
- `currency` is immutable after first posted entry references the account.
- `status=archived` prohibits new postings.
- No posting to unknown or inactive account IDs.

### Recommended minimum account set
- `1100 Accounts Receivable` (asset)
- `1000 Cash` (asset)
- `4000 Revenue` (revenue)
- `2100 Unearned Revenue` (liability, optional for deferred recognition)
- `6100 Write-offs / Bad Debt Expense` (expense)

---

## 1.2 Ledger entries
`ledger_entries` are immutable journal lines created in balanced groups (journal postings).

### Canonical ledger entry shape
```ts
interface LedgerEntry {
  id: string;                              // UUID
  tenant_id: string;
  posting_id: string;                      // journal group ID (all lines in one posting share this)
  posting_version: 1;                      // starts at 1 for current contract

  account_id: string;
  entry_side: 'debit' | 'credit';
  amount_minor: number;                    // integer in minor units (e.g. cents)
  currency: string;                        // must match account currency

  source_event_id: string;                 // from event_log.id
  source_event_type: string;               // invoice_issued, payment_recorded, etc.
  source_entity_type: string;              // invoice | payment | adjustment | ...
  source_entity_id: string;

  effective_at: string;                    // accounting effective timestamp (RFC3339 UTC)
  recorded_at: string;                     // persistence timestamp
  memo: string | null;

  reversal_of_entry_id: string | null;     // populated for compensating reversals
  metadata: Record<string, unknown>;       // non-financial context only
}
```

### Ledger entry invariants (FIX: enforce invariants)
- `amount_minor > 0` (no zero or negative line amounts).
- `entry_side` must be explicit; sign-encoding amounts is forbidden.
- `currency` must equal account currency.
- `source_event_id` is required for all automated postings.
- `metadata` cannot alter financial meaning (financial truth is only side/account/amount).

---

## 2) Posting engine

Posting engine consumes normalized domain events and appends balanced entries.

## 2.1 Design goals
- **Strict double-entry:** every posting has at least two lines and balances.
- **Idempotent by source event:** same event cannot create duplicate postings.
- **Deterministic mapping:** event -> posting rule is pure and repeatable.
- **Module decoupling:** engine depends on event contract + account registry only.

## 2.2 Input contract
Engine input is a normalized financial event (from `03_event_system.md`), requiring:
- `id`, `tenant_id`, `event_type`, `entity_type`, `entity_id`, `occurred_at`,
- `payload_schema`,
- domain payload needed by posting rules (amount, currency, allocation metadata).

## 2.3 Rule-based posting plan
A posting rule resolves for `(event_type, payload_schema)` and returns line intents.

```ts
interface PostingLineIntent {
  account_code: string;
  side: 'debit' | 'credit';
  amount_minor: number;
  memo?: string;
}

interface PostingPlan {
  posting_key: string;                     // deterministic idempotency key
  effective_at: string;
  lines: PostingLineIntent[];
}
```

### Example mappings (repo-aligned)
- `invoice_issued`
  - Debit `Accounts Receivable`
  - Credit `Revenue` (or deferred revenue rule variant)
- `payment_recorded`
  - Debit `Cash`
  - Credit `Accounts Receivable`
- `payment_voided` / `invoice_voided`
  - Post compensating reversal using explicit opposite lines

## 2.4 Posting algorithm (strict)
1. Validate event envelope + required payload fields.
2. Resolve posting rule; reject if no active rule exists.
3. Resolve account IDs by `(tenant_id, account_code)`.
4. Validate each line intent (`amount_minor > 0`, account active, currency match).
5. Compute debit and credit totals; require exact equality.
6. Compute deterministic `posting_key = hash(tenant_id + source_event_id + rule_version + normalized_lines)`.
7. Check idempotency store/unique index for `(tenant_id, posting_key)`.
   - exists: return existing posting result (no-op).
   - missing: append all lines in one transaction.
8. Persist posting receipt (`posting_id`, totals, source_event_id, created_at).

---

## 3) Immutability model

## 3.1 Append-only constraints
- `ledger_entries` are insert-only.
- UPDATE/DELETE on posted lines is prohibited at DB policy/repository layer.
- Corrections use compensating postings (`reversal_of_entry_id`) and never mutate history.

## 3.2 Reversal semantics
- Reversal creates a new posting with mirrored sides/amounts.
- Reversal references original entries via `reversal_of_entry_id`.
- Original and reversal remain visible for full audit trail.

## 3.3 Auditability requirements
- Every ledger entry traces to `source_event_id`.
- Every source event can be replayed without duplicating postings (idempotent).
- Effective and recorded timestamps are both preserved.

---

## 4) Repo alignment

## 4.1 Integration with invoice/payment events
The ledger engine subscribes to financial domain events emitted by existing invoice/payment flows:
- invoice events: `invoice_issued`, `invoice_voided`
- payment events: `payment_recorded`, `payment_allocated`, `payment_voided`

Posting is triggered from the event stream; modules do not call ledger internals directly.

## 4.2 No direct dependency on modules
To keep boundaries clean, ledger engine dependencies are limited to:
- event contract (`DomainEventV1` payload),
- ledger account registry,
- persistence abstraction for append-only postings.

It must not import or depend on invoice/payment service classes/repositories directly.

## 4.3 Failure and replay behavior
- Transient posting failures should move event to retry queue/dead-letter flow with correlation metadata.
- Replay of historical financial events must be safe via posting idempotency key.
- Out-of-order events must be detected where rule preconditions require sequence guarantees.

---

## 5) QC checklist (10/10)

## 5.1 Strict double-entry enforced
- [ ] Every posting has >= 2 lines.
- [ ] Total debits == total credits in identical currency domain.
- [ ] Unbalanced posting attempts are rejected atomically.

## 5.2 Idempotent posting
- [ ] Unique constraint on `(tenant_id, posting_key)`.
- [ ] Posting key derived deterministically from source event + normalized lines.
- [ ] Duplicate deliveries return prior posting receipt without new lines.

## 5.3 No mutation allowed
- [ ] Repository does not expose update/delete for ledger lines.
- [ ] DB permissions/triggers block in-place mutation.
- [ ] Corrections only via reversal postings.

## 5.4 Invariants enforcement (FIX)
- [ ] Positive amounts only.
- [ ] Known active accounts only.
- [ ] Currency consistency across lines/accounts/posting.
- [ ] Required source linkage for traceability (`source_event_id`).
- [ ] Deterministic, versioned rule resolution (`event_type`, `payload_schema`).

---

## 6) Suggested persistence constraints

Recommended DB-level constraints/indexes:
- `UNIQUE (tenant_id, code)` on `ledger_accounts`.
- `CHECK (amount_minor > 0)` on `ledger_entries`.
- `CHECK (entry_side IN ('debit','credit'))`.
- `NOT NULL (source_event_id, posting_id, account_id, currency)`.
- `UNIQUE (tenant_id, posting_key)` on posting receipts table.
- `FOREIGN KEY (reversal_of_entry_id) REFERENCES ledger_entries(id)` nullable.

These constraints complement service-level validation and guarantee invariant protection under concurrency.
