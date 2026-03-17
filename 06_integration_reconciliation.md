# 06 Integration + Reconciliation

## Purpose
Define deterministic external ingestion and reconciliation with strict zero-business-logic integration boundaries.

## Integration Boundary (Zero Business Logic)
Connectors may:
- authenticate/fetch external records
- normalize payloads to canonical schema
- emit normalized intake events

Connectors may **not**:
- allocate payments
- change invoice/payment/bill states
- post ledger entries
- apply AR/AP business decisions

## Canonical Normalized Record
Required fields:
- `tenant_id`
- `connector_id`
- `source_object_type`
- `source_object_id`
- `occurred_at`
- `ingested_at`
- `currency_code`
- `amount_minor`
- `direction` (`debit|credit`)
- `content_hash`
- `raw_ref`
- `payload_version`

## Ingestion Pipeline
1. Fetch external records incrementally.
2. Normalize to canonical record.
3. Validate schema + dedupe by (`tenant_id`, `connector_id`, `source_object_id`, `content_hash`).
4. Append immutable normalized event `integration.record.normalized.v1`.
5. Downstream domain consumers decide business effects.

## Reconciliation Scope
Reconciliation compares:
- external normalized records
- internal canonical financial facts (payments + ledger postings)

## Deterministic Match Order
1. Exact external reference match.
2. Strong tuple match (`tenant`, `currency_code`, `amount_minor`, `counterparty_ref`, `value_date`).
3. Windowed date + exact amount with unique candidate.
4. Else classify exception.

Tie rule: if multiple candidates remain, classify `ambiguous`.

## Reconciliation Outcomes
- `matched`
- `unmatched_external`
- `unmatched_internal`
- `ambiguous`
- `excluded`

## Replayability and Audit
- Reconciliation stores `rule_version`, `run_id`, `as_of_window`.
- Same inputs + same rule version => same outputs.
- Manual overrides are additive audit records, never mutation of source facts.

## Repo Alignment Notes
- Existing `documents` module fits adapter/integration behavior.
- Existing `invoices` and `payments` modules remain domain owners.
- Ledger/AR/AP consumers ingest normalized/reconciled outputs through event contracts only.
