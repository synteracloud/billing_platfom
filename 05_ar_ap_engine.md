# 05 AR/AP Engine

## Purpose
Define Accounts Receivable (AR) and Accounts Payable (AP) as **operational views** built from billing and accounting events.

This engine is for balances, aging, and workflow support. It is **not** the accounting source of truth.

---

## 1) AR scope

AR covers customer-side receivables derived from invoice and payment activity.

### 1.1 AR balances
- Track open receivable balance per invoice.
- Roll up open receivable balance per customer.
- Roll up open receivable balance per tenant.

### 1.2 AR aging
Provide aging buckets based on due date and remaining open amount:
- Current
- 1–30 days past due
- 31–60 days past due
- 61–90 days past due
- 90+ days past due

Aging is computed from invoice due dates and payment allocations.

### 1.3 AR derivation contract (repo alignment)
AR is derived from existing domain flows:
- Invoices establish receivable obligations.
- Payments and payment allocations reduce open receivables.
- Voids/adjustments are reflected through their corresponding events.

AR should be recomputable from canonical invoice/payment history and aligned with ledger postings.

---

## 2) AP scope

AP covers vendor-side obligations and payable workflows.

### 2.1 Bills
- Represent payable obligations from vendors.
- Include bill amount, due date, status, and outstanding amount.

### 2.2 Vendor balances
- Track open payable balance per bill.
- Roll up open payable balance per vendor.
- Roll up open payable balance per tenant.

### 2.3 Future integration (repo alignment)
AP is defined now as a target capability and integrated in a future phase:
- future vendor/bill domain entities,
- future AP events for bill lifecycle and disbursements,
- future payable posting rules in the ledger engine.

Until AP entities/events exist, AP remains a planned projection contract.

---

## 3) Boundaries and conflict resolution (FIX)

To remove conflicts across financial modules:
- Ledger remains the accounting source of truth for financial postings.
- AR/AP engine is a read/projection layer for operational workflows.
- AR/AP must not duplicate, mutate, or reinterpret ledger journal lines.
- When AR/AP projection and ledger differ, ledger is authoritative and projection must be rebuilt.

---

## 4) Data flow model

1. Consume normalized domain events (invoice/payment now; bill/disbursement later).
2. Build or update AR/AP projection records idempotently.
3. Expose query models for balances, aging, and workflow status.
4. Support replay/rebuild from event history to repair projection drift.

---

## 5) QC checklist (10/10)

### 5.1 Not source of truth
- [ ] AR/AP projections are explicitly labeled non-authoritative.
- [ ] Accounting truth remains in ledger and canonical domain records.

### 5.2 No duplication of ledger
- [ ] No journal-line duplication in AR/AP storage.
- [ ] No ledger-side debit/credit recomputation inside AR/AP.
- [ ] AR/AP stores only projection state needed for operations/reporting.

### 5.3 AR correctness
- [ ] AR open balances are derived from invoices and payment allocations.
- [ ] Aging buckets are deterministic from due date + open amount.
- [ ] AR can be rebuilt from canonical history.

### 5.4 AP readiness
- [ ] AP contract defines bills and vendor balances.
- [ ] AP is marked future integration until vendor/bill modules exist.
- [ ] AP future events and ledger mapping are documented as follow-on work.
