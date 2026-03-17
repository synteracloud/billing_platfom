# 01 System Overview

## Architecture
The system is an event-driven financial platform with strict source/derived separation:
- **Source engines**: Invoicing, Payments, Ledger
- **Derived engine**: AR/AP
- **Boundary engine**: Integration + Reconciliation
- **Consumption engine**: Analytics

## End-to-End Financial Flow (Authoritative)

1. **Invoice phase (Invoicing Engine)**
   - Invoice is created and issued.
   - Emits `billing.invoice.issued.v1`.

2. **Payment phase (Payments Engine)**
   - Payment is recorded and later settled.
   - Allocation links payment to invoice.
   - Emits `billing.payment.recorded.v1`, `billing.payment.settled.v1`, `billing.payment.allocated.v1`.

3. **Accounting phase (Ledger Engine)**
   - Consumes financial domain events.
   - Posts immutable balanced journal entries.
   - Emits `accounting.journal.posted.v1`.

4. **Sub-ledger phase (AR/AP Engine)**
   - Builds receivable/payable positions from invoice/payment/bill/ledger events.
   - Emits derived aging and exposure events.

5. **Consumption phase (Analytics Engine)**
   - Materializes KPIs/read models from canonical event history and derived snapshots.

## Design Constraints
- No direct synchronous writes across engines.
- No hidden side effects outside event contracts.
- Retries must be idempotent by event id + aggregate version.
- All monetary transitions must have a ledger consequence.

## Core Components
- API layer (commands only for owning engine)
- Event bus / append-only event store
- Engine-local persistence
- Ledger posting service
- AR/AP projector
- Reconciliation runner
- Analytics projector

## Implementability Requirements
1. Every command resolves to one owning engine.
2. Every cross-engine effect is an event subscription.
3. Every status transition has explicit preconditions.
4. Every event has schema versioning and idempotency key.
5. Replays produce identical AR/AP and analytics results.
