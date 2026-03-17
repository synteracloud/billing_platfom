# 00 Service Map

## Engine Set

The platform is partitioned into **nine engines** with strict, non-overlapping ownership:

1. **Invoicing**
2. **Payments**
3. **Ledger**
4. **AR (Accounts Receivable)**
5. **AP (Accounts Payable)**
6. **Integrations**
7. **Reconciliation**
8. **Analytics**
9. **AI**

## Strict Ownership by Engine

| Engine | Owns (authoritative writes) | Does **not** own |
|---|---|---|
| Invoicing | Invoice lifecycle, invoice lines, invoice states, invoice issue/cancel events | Cash settlement, accounting postings, external gateway state |
| Payments | Payment intake, allocations, payment method metadata, payment status events | Invoice mutation, ledger posting logic, reporting models |
| Ledger | Double-entry journal, account balances, posting rules, immutable financial source of truth | Invoice/payment workflow UX state, external provider orchestration |
| AR | Receivable exposure, due schedules, dunning/reminders, customer balance views | Raw invoice object persistence, payment capture |
| AP | Vendor bills, payables schedules, disbursement intent state | Customer receivables, payment gateway collection flows |
| Integrations | Connectors, provider adapters, webhook ingestion, outbound sync contracts | Core domain truth for invoices, payments, ledger |
| Reconciliation | Matching rules, unmatched item queues, exception workflows | Owning original transaction records |
| Analytics | Read models, KPI aggregates, dashboards, forecasting datasets | Transactional source-of-truth writes |
| AI | Suggestions, anomaly detection, copilot actions (proposal-only) | Committing domain mutations without engine APIs/events |

### Ownership conflict resolution (FIX)

- **Ledger is the only financial source of truth** for posted balances and accounting state.
- **Invoicing owns invoice state**, but cannot write ledger rows directly; it emits events for ledger posting.
- **Payments owns payment state**, but cannot mutate invoices directly; it emits allocation/settlement events consumed by AR and Ledger.
- **AR owns receivable projections and collections workflows**, while consuming invoice/payment/ledger events rather than mutating those modules.
- **Integrations can ingest/sync data but cannot become authoritative** over core entities once normalized.

## Interaction Rules (Global)

1. **Event-driven only** communication between engines.
2. **No cross-module mutation**: an engine never writes another engine's storage.
3. Commands are local; cross-engine effects occur via published domain events.
4. Read-side materializations (Analytics/AI/Reconciliation) are derived from events and are non-authoritative.

## Repo Alignment (Current Modules -> Target Engines)

Existing modules are preserved and marked **reuse + adapt**:

| Existing repo module | Target engine | Disposition | Notes |
|---|---|---|---|
| `backend/src/modules/invoices` | Invoicing | **reuse + adapt** | Keep invoice CRUD/workflows; route accounting impact through ledger events. |
| `backend/src/modules/payments` | Payments | **reuse + adapt** | Keep intake/allocation APIs; publish settlement/allocation events for AR + Ledger. |
| `backend/src/modules/documents` | Integrations | **reuse + adapt** | Treat PDF/email delivery as adapter layer driven by invoicing/payment events. |
| `backend/src/modules/auth` | Integrations (platform access boundary) | **reuse + adapt** | Keep identity/access boundary; no ownership of financial domain data. |

## QC Checklist (10/10)

- [x] No overlapping ownership across the nine engines.
- [x] Existing repo modules (`invoices`, `payments`, `documents`, `auth`) are mapped correctly and marked **reuse + adapt**.
- [x] Ledger is explicitly isolated as the immutable source of truth for financial postings and balances.
