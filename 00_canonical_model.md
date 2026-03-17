# 00 Canonical Model

## Purpose
Provide one canonical vocabulary and data model used consistently by all engines.

## Canonical Entities

### Source-of-Truth Domain Entities
1. `invoice`
2. `invoice_line`
3. `payment`
4. `payment_allocation`
5. `bill` (AP source document)

### Accounting Entities (Ledger SoT)
6. `ledger_account`
7. `journal_entry`
8. `journal_line`

### Integration Entities
9. `normalized_record`
10. `reconciliation_run`
11. `reconciliation_result`

### Derived Entities (Never SoT)
12. `receivable_position`
13. `payable_position`
14. `analytics_fact`

## Global Naming Rules
- Persisted fields: `snake_case`.
- Primary keys: `id` (UUID/ULID).
- Foreign keys: `<entity>_id`.
- Monetary fields (integer minor units): `<amount>_minor`.
- Currency fields (ISO-4217): `currency_code`.
- Timestamps (UTC): `<action>_at`.
- Event names: `domain.aggregate.action.v1`.

## Financial State Enumerations (Canonical)

### Invoice Status
`draft | issued | partially_paid | paid | void`

### Payment Status
`recorded | pending_settlement | settled | failed | refunded | void`

### Bill Status
`draft | approved | due | partially_paid | paid | void`

## Invariants
1. `journal_entry` is immutable once posted.
2. For each `journal_entry`: `sum(debit_minor) = sum(credit_minor)`.
3. `payment_allocation.allocated_minor` cannot exceed both payment unallocated amount and invoice open amount.
4. AR/AP balances are derived and replayable from events + ledger postings.
5. Integration records cannot mutate canonical entities directly.

## Relationship Model
- `invoice 1..n invoice_line`
- `payment 1..n payment_allocation`
- `payment_allocation n..1 invoice`
- `journal_entry 1..n journal_line`
- `journal_entry` references source entity (`source_type`, `source_id`, `source_event_id`)
- `receivable_position` derives from invoice + payment + ledger events
- `payable_position` derives from bill + disbursement + ledger events

## Cross-Document Contract
This canonical model is normative for:
- ownership in `00_service_map.md`
- lifecycle in `01_system_overview.md`
- invariants in `02_financial_model.md`
- events in `03_event_system.md`
- posting logic in `04_ledger_engine.md`
- derived logic in `05_ar_ap_engine.md`
- ingestion/reconciliation in `06_integration_reconciliation.md`
