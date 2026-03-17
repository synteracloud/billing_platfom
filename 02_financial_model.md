# 02 Financial Model

## Purpose
Define strict financial invariants and mapping from commercial events to accounting entries.

## Financial Principles
1. **Accrual accounting** with double-entry ledger.
2. **Ledger-first accounting truth**: reporting balances derive from posted journals.
3. **Separation of concerns**: commercial state (`invoice`, `payment`, `bill`) is distinct from accounting state (`journal_entry`, `journal_line`).
4. **Deterministic replay**: same event stream -> same journals and balances.

## Monetary Conventions
- Amount storage: integer minor units (`*_minor`).
- Currency: ISO-4217 `currency_code`.
- No mixed-currency journal entry.
- FX revaluation handled as explicit adjustment events (future extension), never implicit mutation.

## Double-Entry Rules (Complete)
- Each `journal_entry` has >=2 `journal_line` rows.
- Sum of debits equals sum of credits per currency.
- Journal entry is immutable after posting; corrections use reversing/adjusting entries.
- Every posted entry references `source_event_id`.

## Event-to-Ledger Mapping

### Invoice Issued
Event: `billing.invoice.issued.v1`
- Debit: Accounts Receivable
- Credit: Revenue (and tax liability where applicable)

### Payment Settled
Event: `billing.payment.settled.v1`
- Debit: Cash/Bank Clearing
- Credit: Accounts Receivable (for allocated amount)
- Unallocated cash remains liability/suspense per policy

### Payment Refunded
Event: `billing.payment.refunded.v1`
- Debit: Refund Expense or Revenue Contra
- Credit: Cash/Bank
- Plus AR correction if original settlement cleared AR

### Bill Approved (AP)
Event: `billing.bill.approved.v1`
- Debit: Expense/Asset account
- Credit: Accounts Payable

### Bill Paid (AP)
Event: `billing.bill.paid.v1`
- Debit: Accounts Payable
- Credit: Cash/Bank

## Financial Invariants (Enforced)
1. Invoice `paid` state implies open amount is zero.
2. Payment `settled` amount cannot exceed captured amount.
3. Allocation cannot exceed invoice open amount.
4. AR/AP balances must reconcile to relevant control accounts in ledger.
5. Any violation routes to exception queue; no silent correction.

## Deterministic Controls
- Posting rules are versioned.
- Rule version stored on each journal entry.
- Backfill/replay runs are idempotent using (`source_event_id`, `rule_version`).
