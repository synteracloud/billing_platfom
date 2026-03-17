# 03 Event System

## Purpose
Define a uniform, reusable event schema and canonical event catalog across engines.

## Uniform Envelope (Required for All Events)
```json
{
  "event_id": "uuid",
  "event_name": "billing.invoice.issued.v1",
  "event_version": 1,
  "occurred_at": "2026-01-01T00:00:00Z",
  "recorded_at": "2026-01-01T00:00:01Z",
  "tenant_id": "uuid",
  "aggregate_type": "invoice",
  "aggregate_id": "uuid",
  "aggregate_version": 3,
  "causation_id": "uuid",
  "correlation_id": "uuid",
  "idempotency_key": "string",
  "producer": "invoicing-engine",
  "payload": {}
}
```

## Event Naming Standard
`<domain>.<aggregate>.<action>.v<version>`

Examples:
- `billing.invoice.issued.v1`
- `billing.payment.settled.v1`
- `accounting.journal.posted.v1`
- `recon.match.classified.v1`

## Canonical Event Catalog

### Invoicing
- `billing.invoice.created.v1`
- `billing.invoice.issued.v1`
- `billing.invoice.voided.v1`

### Payments
- `billing.payment.recorded.v1`
- `billing.payment.settled.v1`
- `billing.payment.allocated.v1`
- `billing.payment.refunded.v1`

### Ledger
- `accounting.journal.posted.v1`
- `accounting.journal.reversed.v1`

### AR/AP (Derived)
- `subledger.receivable.updated.v1`
- `subledger.payable.updated.v1`
- `subledger.aging.snapshotted.v1`

### Integration + Reconciliation
- `integration.record.normalized.v1`
- `recon.run.completed.v1`
- `recon.match.classified.v1`

## Delivery and Processing Guarantees
- At-least-once delivery.
- Consumers must be idempotent by `event_id`.
- Ordering guaranteed per aggregate (`aggregate_id`, `aggregate_version`).
- Poison events go to dead-letter with diagnostics.

## Cross-Doc Consistency Rules
- Event payload fields must use canonical entity names from `00_canonical_model.md`.
- Financially material events must include data needed for deterministic ledger posting.
- Derived engines may emit events but cannot redefine source-of-truth semantics.
