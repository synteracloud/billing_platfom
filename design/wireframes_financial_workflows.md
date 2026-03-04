# Wireframes — Financial Workflows

## Scope and Deterministic Rendering Contract

This document defines structural wireframes for financial workflow screens:
- Invoices List
- Invoice Editor
- Payments List
- Payment Allocation
- Subscriptions

These wireframes define only:
- layout zones,
- data regions,
- interaction entry points.

These wireframes intentionally exclude styling decisions. Renderer mapping is:
- wireframes → components → tokens.

---

## Global Layout Rules

All screens in this document must render inside the **Application Shell** defined in core wireframes.

Common structural sequence for list/management screens:
1. Page Header
2. Primary Action Area
3. Filters Row (where applicable)
4. Main Data Region

Deterministic constraints:
- Zone order is fixed per screen definition.
- Regions are explicitly named.
- Primary actions are defined per screen.
- Row-level interactions and drawer entry points are explicit.
- Multi-step transactional flows (invoice editing, payment allocation) define fixed process regions.

---

## 1) Invoices List

### Screen Overview
Invoice management screen for listing, filtering, and operational handling of tenant invoices.

### Primary Purpose
View and manage all invoices.

### Layout Structure

```text
Application Shell / Content Area

+----------------------------------------------------------------------------------+
| Page Header                                                                       |
| [Title + Context]                                                [Create Invoice] |
+----------------------------------------------------------------------------------+
| Filters Row                                                                        |
| [Search] [Status Filter] [Customer Filter] [Date Range]                          |
+----------------------------------------------------------------------------------+
| Main Data Region                                                                   |
| Invoices Table                                                                     |
| Columns:                                                                           |
| - Invoice Number                                                                   |
| - Customer                                                                         |
| - Status                                                                           |
| - Issue Date                                                                       |
| - Due Date                                                                         |
| - Total                                                                            |
| - Outstanding                                                                      |
| - Actions                                                                          |
+----------------------------------------------------------------------------------+
```

### Primary Actions
- Create Invoice

### Data Regions
- `page_header_region`
- `primary_action_region`
  - create_invoice_action
- `filters_region`
  - invoice_search_input
  - invoice_status_filter
  - invoice_customer_filter
  - invoice_date_range_filter
- `main_data_region`
  - invoices_table_region
    - column_invoice_number
    - column_customer
    - column_status
    - column_issue_date
    - column_due_date
    - column_total
    - column_outstanding
    - column_actions

### Interaction Entry Points
- Create Invoice action opens invoice creation flow.
- Search/filter controls update invoices table query state.
- Row click opens **Invoice Detail Drawer**.
- Row actions cell opens row-scoped operations without conflicting with row click behavior.

---

## 2) Invoice Editor

### Screen Overview
Transactional editor screen for creating or modifying invoice documents before issuance and sending.

### Primary Purpose
Create or edit invoices.

### Layout Structure

```text
Application Shell / Content Area

+----------------------------------------------------------------------------------+
| Page Header                                                                       |
| [Title + Context / Invoice State]                                                 |
+----------------------------------------------------------------------------------+
| Customer Selector                                                                  |
| [Customer Lookup / Selector]                                                      |
+----------------------------------------------------------------------------------+
| Invoice Metadata Section                                                           |
| [Issue Date] [Due Date] [Currency]                                                |
+----------------------------------------------------------------------------------+
| Invoice Composition Region                                                         |
| +-----------------------------------------------+--------------------------------+ |
| | Line Items Section                            | Totals Panel                   | |
| | Editable Line Items Table                     | - Subtotal                     | |
| | Columns:                                      | - Tax                          | |
| | - Description                                 | - Total                        | |
| | - Quantity                                    |                                | |
| | - Unit Price                                  |                                | |
| | - Tax                                         |                                | |
| | - Line Total                                  |                                | |
| +-----------------------------------------------+--------------------------------+ |
+----------------------------------------------------------------------------------+
| Primary Actions                                                                     |
| [Save Draft] [Issue Invoice] [Send Invoice]                                        |
+----------------------------------------------------------------------------------+
```

### Primary Actions
- Save Draft
- Issue Invoice
- Send Invoice

### Data Regions
- `page_header_region`
- `customer_selector_region`
  - invoice_customer_selector
- `invoice_metadata_region`
  - issue_date_input
  - due_date_input
  - currency_selector
- `invoice_composition_region`
  - line_items_section_region
    - editable_line_items_table_region
      - column_description
      - column_quantity
      - column_unit_price
      - column_tax
      - column_line_total
  - totals_panel_region
    - subtotal_value
    - tax_value
    - total_value
- `primary_action_region`
  - save_draft_action
  - issue_invoice_action
  - send_invoice_action

### Interaction Entry Points
- Customer selector sets invoice ownership context.
- Metadata inputs update invoice terms and scheduling context.
- Line item cells support add/edit/remove operations and recalculation entry points.
- Totals panel updates as a deterministic output of line item and tax inputs.
- Save Draft, Issue Invoice, and Send Invoice actions trigger distinct lifecycle transitions.

---

## 3) Payments List

### Screen Overview
Payment management screen for reviewing and operating on recorded payment transactions.

### Primary Purpose
View and manage recorded payments.

### Layout Structure

```text
Application Shell / Content Area

+----------------------------------------------------------------------------------+
| Page Header                                                                       |
| [Title + Context]                                                [Record Payment] |
+----------------------------------------------------------------------------------+
| Filters Row                                                                        |
| [Search] [Date Range] [Customer Filter]                                           |
+----------------------------------------------------------------------------------+
| Main Data Region                                                                   |
| Payments Table                                                                     |
| Columns:                                                                           |
| - Payment Date                                                                     |
| - Customer                                                                         |
| - Amount                                                                           |
| - Currency                                                                         |
| - Method                                                                           |
| - Status                                                                           |
| - Actions                                                                          |
+----------------------------------------------------------------------------------+
```

### Primary Actions
- Record Payment

### Data Regions
- `page_header_region`
- `primary_action_region`
  - record_payment_action
- `filters_region`
  - payment_search_input
  - payment_date_range_filter
  - payment_customer_filter
- `main_data_region`
  - payments_table_region
    - column_payment_date
    - column_customer
    - column_amount
    - column_currency
    - column_method
    - column_status
    - column_actions

### Interaction Entry Points
- Record Payment action opens payment recording flow.
- Search/filter controls update payments table query state.
- Row click opens **Payment Detail Drawer**.
- Row actions cell opens row-scoped operations without conflicting with row click behavior.

---

## 4) Payment Allocation

### Screen Overview
Allocation workflow screen for distributing a recorded payment balance across one or more outstanding invoices.

### Primary Purpose
Allocate a payment to one or more invoices.

### Layout Structure

```text
Application Shell / Content Area

+----------------------------------------------------------------------------------+
| Payment Summary Panel                                                              |
| [Payment Amount] [Customer] [Remaining Balance]                                   |
+----------------------------------------------------------------------------------+
| Outstanding Invoices Table                                                         |
| Columns:                                                                           |
| - Invoice Number                                                                   |
| - Due Date                                                                         |
| - Outstanding Amount                                                               |
| - Allocate Amount Input                                                            |
+----------------------------------------------------------------------------------+
| Actions                                                                            |
| [Confirm Allocation] [Cancel]                                                      |
+----------------------------------------------------------------------------------+
```

### Primary Actions
- Confirm Allocation
- Cancel

### Data Regions
- `payment_summary_region`
  - payment_amount_value
  - customer_value
  - remaining_balance_value
- `outstanding_invoices_region`
  - outstanding_invoices_table_region
    - column_invoice_number
    - column_due_date
    - column_outstanding_amount
    - column_allocate_amount_input
- `primary_action_region`
  - confirm_allocation_action
  - cancel_allocation_action

### Interaction Entry Points
- Allocate Amount inputs set allocation amounts per invoice row.
- Remaining Balance updates as a deterministic output of allocation input values.
- Confirm Allocation validates and commits payment-to-invoice allocations.
- Cancel exits allocation flow without persisting changes.

---

## 5) Subscriptions

### Screen Overview
Recurring billing management screen for listing and editing tenant subscription records.

### Primary Purpose
Manage recurring billing subscriptions.

### Layout Structure

```text
Application Shell / Content Area

+----------------------------------------------------------------------------------+
| Page Header                                                                       |
| [Title + Context]                                           [Create Subscription] |
+----------------------------------------------------------------------------------+
| Filters Row                                                                        |
| [Search] [Status Filter]                                                          |
+----------------------------------------------------------------------------------+
| Main Data Region                                                                   |
| Subscriptions Table                                                                |
| Columns:                                                                           |
| - Customer                                                                         |
| - Plan Name                                                                        |
| - Amount                                                                           |
| - Billing Interval                                                                 |
| - Next Billing Date                                                                |
| - Status                                                                           |
| - Actions                                                                          |
+----------------------------------------------------------------------------------+
```

### Primary Actions
- Create Subscription

### Data Regions
- `page_header_region`
- `primary_action_region`
  - create_subscription_action
- `filters_region`
  - subscription_search_input
  - subscription_status_filter
- `main_data_region`
  - subscriptions_table_region
    - column_customer
    - column_plan_name
    - column_amount
    - column_billing_interval
    - column_next_billing_date
    - column_status
    - column_actions

### Interaction Entry Points
- Create Subscription action opens subscription creation flow.
- Search/filter controls update subscriptions table query state.
- Row click opens **Subscription Editor Drawer**.
- Row actions cell opens row-scoped operations without conflicting with row click behavior.

---

## Renderer Mapping Notes (Non-Styling)

To support deterministic rendering, each screen definition in this document is expected to map to:
- Layout components (container/grid/section/panel/drawer),
- Data components (table/summary panel/totals panel),
- Transaction inputs (editable table cells, amount inputs, metadata controls),
- Workflow controls (primary actions for lifecycle and allocation transitions).

This document defines structure and interaction zones only; tokens and visual styling are applied at later layers.
