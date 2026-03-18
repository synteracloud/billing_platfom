# 04 Ledger Engine

## Purpose
Specify the authoritative accounting engine and complete double-entry posting behavior.

## Authoritative Scope
Ledger engine exclusively owns:
- `ledger_account`
- `journal_entry`
- `journal_line`
- account balances derived from journal lines

It does **not** own invoice/payment/bill lifecycle state.

## Inputs
Consumes only canonical financial events:
- `billing.invoice.issued.v1`
- `billing.payment.settled.v1`
- `billing.payment.refunded.v1`
- `billing.bill.approved.v1`
- `billing.bill.paid.v1`

## Posting Pipeline
1. Validate event schema/version.
2. Resolve posting rule by (`event_name`, `rule_version`).
3. Build journal lines with debit/credit accounts.
4. Validate balancing + account/currency constraints.
5. Persist immutable `journal_entry` + `journal_line` in one transaction.
6. Emit `accounting.journal.posted.v1` from the same database transaction via deferred audit trigger.

## Idempotency and Replay
- Unique constraint: (`source_event_id`, `rule_version`).
- Reprocessing same source event is a no-op.
- Rule changes require new `rule_version`; old entries remain immutable.

## Control Accounts
Minimum required accounts:
- Accounts Receivable
- Accounts Payable
- Cash/Bank
- Revenue
- Tax Liability
- Expense
- Suspense/Unapplied Cash

## Hard Rules
1. No unbalanced journal can be posted.
2. No journal mutation after post.
3. Corrections use reversal/adjustment entries only.
4. Database triggers block `UPDATE`/`DELETE` on `journal_entry`, `journal_line`, and posting audit rows.
5. Reversal entries reference the original journal entry and produce `accounting.journal.reversed.v1`.
6. Ledger is system-of-record for accounting balances.
7. AR/AP must reconcile to AR/AP control accounts.

## Outputs
- `accounting.journal.posted.v1`
- ledger balance snapshots (read model only)
- reconciliation support views keyed by source event/entity
