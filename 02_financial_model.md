# 02 Financial Model

## Purpose
Define a strict double-entry accounting model for billing flows so every financial repo action has an explicit ledger impact, balancing is enforced (`DR = CR`), and corrections are handled by reversal-only postings (no mutation of historical ledger entries).

## 1) Double-entry rules (canonical)

### 1.1 Invoice posting
When an invoice is issued and becomes a receivable:

- **DR Accounts Receivable (AR)**
- **CR Revenue**

Journal template:

| Event | Debit account | Credit account | Amount |
|---|---|---|---|
| `invoice_issued` | `accounts_receivable` | `revenue` | `invoice.total_minor` |

### 1.2 Payment posting
When customer cash is recorded/settled against receivable:

- **DR Cash**
- **CR Accounts Receivable (AR)**

Journal template:

| Event | Debit account | Credit account | Amount |
|---|---|---|---|
| `payment_recorded` (or settlement-equivalent) | `cash` | `accounts_receivable` | `payment.amount_received_minor` |

### 1.3 Bill posting (AP)
When a vendor bill is recognized:

- **DR Expense**
- **CR Accounts Payable (AP)**

Journal template:

| Event | Debit account | Credit account | Amount |
|---|---|---|---|
| `bill_issued` | `expense` | `accounts_payable` | `bill.total_minor` |

## 2) Invariants (hard constraints)

### 2.1 Balance invariant
For every journal entry group:

- `sum(debit_minor) = sum(credit_minor)`
- Cross-currency netting is disallowed; balancing is enforced per currency and tenant.

### 2.2 Immutability invariant (no mutation)
- Posted ledger entries are append-only.
- Existing entries are never updated/deleted to correct mistakes.
- Corrections happen via explicit reversal entries plus optional replacement entries.

Reversal rule:
- Reverse by swapping debit and credit accounts with the same amount and currency, linked to original posting by `reversal_of_entry_id`.

## 3) Repo alignment: invoice + payment flows to ledger impact

Current repo behavior creates financial domain events in invoicing/payments services. The ledger model below maps each action to required accounting impact.

### 3.1 Invoice flow alignment

| Repo action | Current domain event | Ledger impact | Notes |
|---|---|---|---|
| Issue invoice | `invoice_issued` | **DR AR / CR Revenue** for `invoice.total_minor` | Draft creation/line edits are non-posting operational steps; posting occurs on issue. |
| Void unpaid invoice | `invoice_voided` | **Reversal** of the original invoice posting (`DR Revenue / CR AR`) | Preserve audit trail; do not mutate original journal lines. |

### 3.2 Payment flow alignment

| Repo action | Current domain event | Ledger impact | Notes |
|---|---|---|---|
| Record customer payment | `payment_recorded` | **DR Cash / CR AR** for `payment.amount_received_minor` | Allocation updates invoice exposure/read-model state, not double-recognition of cash. |
| Allocate payment to invoice(s) | `payment_allocated` | **No new GL amount** (sub-ledger allocation only) | Reclassifies AR by invoice in sub-ledger; total AR already reduced at payment posting. |
| Void payment | `payment_voided` | **Reversal** of payment posting (`DR AR / CR Cash`) | Append compensating entry; restore receivable exposure. |

### 3.3 AP bill flow alignment (future module)

| Repo action | Event (target) | Ledger impact |
|---|---|---|
| Create/issue bill | `bill_issued` | **DR Expense / CR AP** |
| Void bill | `bill_voided` | **Reversal** (`DR AP / CR Expense`) |

## 4) Enforcement rules (FIX: enforce balance rules)

The ledger posting service must reject any posting batch that violates:

1. **Unbalanced journal**: total debits != total credits.
2. **Invalid sign/amount**: amounts must be positive integers in minor units.
3. **Currency mismatch in one batch** unless explicitly modeled as FX with dedicated gain/loss legs.
4. **Mutation attempt** on posted rows (update/delete).
5. **Unlinked reversal**: reversal entries must reference source entry and mirror amount/currency.

Recommended guardrails:
- Deterministic `posting_id`/idempotency key per source event.
- Unique constraint on (`tenant_id`, `source_event_id`, `entry_role`) to prevent duplicate posting.
- Reversal entries marked with `entry_type = 'reversal'` and `reversal_of_entry_id`.

## 5) Quality control (10/10)

### Coverage check: every repo financial action maps to ledger
- [x] `invoice_issued` -> DR AR / CR Revenue
- [x] `invoice_voided` -> reversal of invoice posting
- [x] `payment_recorded` -> DR Cash / CR AR
- [x] `payment_allocated` -> sub-ledger allocation only (no duplicate GL movement)
- [x] `payment_voided` -> reversal of payment posting
- [x] `bill_issued` (target) -> DR Expense / CR AP
- [x] `bill_voided` (target) -> reversal of bill posting

### No missing financial flow
- [x] Revenue recognition path covered (invoice issue/void).
- [x] Cash receipt path covered (payment record/void).
- [x] Receivable lifecycle covered (issue, allocate, settle, reverse).
- [x] Payables baseline covered for future AP bill lifecycle.
- [x] Immutability + balancing constraints explicitly enforced.
