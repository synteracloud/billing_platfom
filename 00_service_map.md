# 00 Service Map

## Purpose
Define strict engine boundaries for the billing platform so ownership is non-overlapping, deterministic, and implementation-ready.

## Engine Set (Authoritative)
1. **Invoicing Engine**
2. **Payments Engine**
3. **Ledger Engine**
4. **AR/AP Engine**
5. **Integration + Reconciliation Engine**
6. **Analytics Engine**

## Ownership Matrix (No Overlap)

| Engine | Authoritative Writes | Explicitly Not Owned |
|---|---|---|
| Invoicing | `invoice`, `invoice_line`, invoice lifecycle transitions | cash settlement, accounting entries, bank/feed state |
| Payments | `payment`, `payment_allocation`, payment lifecycle transitions | invoice edits, journal posting, AR/AP balances |
| Ledger | `journal_entry`, `journal_line`, `ledger_account`, posted balances | invoice/payment UX states, connector orchestration |
| AR/AP | `receivable_position`, `payable_position`, aging snapshots and collection/disbursement workflow state | source invoices/payments/bills, journal creation |
| Integration + Reconciliation | connector checkpoints, normalized intake records, reconciliation run/results | invoice/payment/ledger business decisions, source-of-truth mutations |
| Analytics | read models, KPI aggregates, forecasting tables | transactional source-of-truth entities |

## Hard Boundary Rules
1. Cross-engine communication is **event-driven only**.
2. No engine writes another engine's authoritative tables.
3. Ledger is the single accounting source of truth for posted financial impact.
4. AR/AP is a derived sub-ledger projection; never source-of-truth.
5. Integration layer performs ingestion/normalization/reconciliation only (zero business logic).

## Canonical Flow Alignment
All financial flows must follow the same path:

`invoice issued -> payment recorded/settled -> ledger posted -> AR/AP projected -> analytics materialized`

## Repo Alignment (Current Modules)

| Repo module | Engine | Alignment |
|---|---|---|
| `backend/src/modules/invoices` | Invoicing | source owner for invoices; emits invoice domain events |
| `backend/src/modules/payments` | Payments | source owner for payments/allocations; emits payment domain events |
| (new/target) ledger module | Ledger | authoritative double-entry posting from domain events |
| (new/target) ar-ap module | AR/AP | derived positions from invoice/payment/ledger events |
| `backend/src/modules/documents` | Integration + Reconciliation | outbound/inbound adapter behavior only (no core business rules) |
| (new/target) analytics module | Analytics | read-only projections from event stream |

## Deterministic Governance
- Every state transition must be represented as an immutable event.
- Every monetary event that changes financial position must map to a ledger journal entry set.
- Rebuildability is mandatory: AR/AP and Analytics must be reconstructable from canonical events + ledger.
