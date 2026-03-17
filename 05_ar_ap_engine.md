# 05 AR/AP Engine

## Purpose
Define AR/AP as derived sub-ledger projections, never as source-of-truth.

## Authoritative Position
AR/AP engine owns only derived records:
- `receivable_position`
- `payable_position`
- aging buckets
- collection/disbursement workflow metadata

AR/AP does **not** authoritatively own invoices, payments, bills, or journals.

## Inputs (Canonical)
- `billing.invoice.issued.v1`
- `billing.payment.allocated.v1`
- `billing.payment.settled.v1`
- `billing.bill.approved.v1`
- `billing.bill.paid.v1`
- `accounting.journal.posted.v1`

## Receivables Derivation
- Start from issued invoices and due dates.
- Reduce open exposure by valid payment allocations/settlements.
- Mark invoice receivable closed only when open amount = 0.
- Aging buckets computed deterministically from due date and as-of date.

## Payables Derivation
- Start from approved bills.
- Reduce exposure by bill payments/disbursements.
- Aging and vendor balance rules mirror receivables with payable semantics.

## Reconciliation with Ledger
- AR projection total must reconcile to ledger AR control account.
- AP projection total must reconcile to ledger AP control account.
- Any variance is emitted as exception event and surfaced operationally.

## No-Duplication Rule
- AR/AP never re-implements source lifecycle rules from Invoicing/Payments.
- AR/AP never re-implements posting rules from Ledger.
- AR/AP derives only from canonical events and ledger postings.

## Outputs
- `subledger.receivable.updated.v1`
- `subledger.payable.updated.v1`
- `subledger.aging.snapshotted.v1`
- operational dunning/disbursement task views (non-authoritative)
