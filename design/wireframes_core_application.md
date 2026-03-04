# Wireframes — Core Application Screens

## Scope and Deterministic Rendering Contract

This document defines structural wireframes for the core application screens:
- Application Shell
- Dashboard
- Customers
- Products

These wireframes define only:
- layout zones,
- data regions,
- interaction entry points.

These wireframes intentionally exclude styling decisions. Renderer mapping is:
- wireframes → components → tokens.

---

## Global Layout Rules

All screens in this document must render inside the **Application Shell**.

Common structural sequence for every screen:
1. Sidebar Navigation
2. Top Navigation
3. Page Header
4. Primary Action Area
5. Main Data Region

Deterministic constraints:
- Zone order is fixed.
- Regions are explicitly named.
- Primary actions are defined per screen.
- Row-level interactions are explicit where relevant.

---

## 1) Application Shell

### Screen Overview
The Application Shell is the global container and navigation frame used by all application pages.

### Primary Purpose
Provide a consistent, deterministic structure for navigation and content rendering across modules.

### Layout Structure

```text
+----------------------------------------------------------------------------------+
| Top Navigation Bar                                                               |
| [Global Search] [Notifications] [Tenant Switch*] [User Menu]                    |
+-------------------------------+--------------------------------------------------+
| Sidebar Navigation            | Content Area                                     |
| - Dashboard                   | +----------------------------------------------+ |
| - Customers                   | | Page Header                                  | |
| - Products                    | +----------------------------------------------+ |
| - Invoices                    | | Primary Action Area                          | |
| - Payments                    | +----------------------------------------------+ |
| - Subscriptions               | | Main Data Region                             | |
| - Settings                    | |                                              | |
|                               | +----------------------------------------------+ |
+-------------------------------+--------------------------------------------------+

* Tenant Switch is reserved for future support but must keep a dedicated slot.
```

### Primary Actions
- Shell-level: none (screen-specific primary actions render in Content Area).
- Global quick entry points are allowed via top navigation utilities (search, notifications, user menu, tenant switch).

### Data Regions
- `top_navigation_region`
  - global_search_region
  - notifications_region
  - tenant_switch_region (future-ready)
  - user_menu_region
- `sidebar_navigation_region`
  - module_navigation_list
- `content_region`
  - page_header_region
  - primary_action_region
  - main_data_region

### Interaction Entry Points
- Top nav: global search submit, notifications open, user menu open, tenant switch open.
- Sidebar: module route selection.
- Content: delegated to each page wireframe.

---

## 2) Dashboard Screen

### Screen Overview
Operational and financial overview screen for tenant-level status monitoring.

### Primary Purpose
Provide high-level visibility into current financial performance and recent operational activity.

### Layout Structure

```text
Application Shell / Content Area

+----------------------------------------------------------------------------------+
| Page Header                                                                       |
| [Title + Context]                                              [Create Invoice]   |
|                                                                [Add Customer]    |
+----------------------------------------------------------------------------------+
| Metrics Row                                                                        |
| [Revenue Today] [Outstanding Balance] [Invoices Due] [Active Subscriptions]      |
+----------------------------------------------------------------------------------+
| Analytics Section                                                                  |
| [Revenue Chart]                              [Invoices Trend Chart]               |
+----------------------------------------------------------------------------------+
| Operational Tables                                                                 |
| [Recent Invoices Table]                     [Recent Payments Table]              |
+----------------------------------------------------------------------------------+
```

### Primary Actions
- Create Invoice
- Add Customer

### Data Regions
- `page_header_region`
- `primary_action_region`
  - create_invoice_action
  - add_customer_action
- `metrics_row_region`
  - revenue_today_metric
  - outstanding_balance_metric
  - invoices_due_metric
  - active_subscriptions_metric
- `analytics_region`
  - revenue_chart_region
  - invoices_trend_chart_region
- `operational_tables_region`
  - recent_invoices_table_region
  - recent_payments_table_region

### Interaction Entry Points
- Primary actions: create invoice flow, add customer flow.
- Metrics cards: optional drill-down navigation entry points.
- Chart regions: timeframe/filter interaction entry points.
- Tables: row selection/click entry points for invoice/payment detail navigation.

---

## 3) Customers Screen

### Screen Overview
Customer management screen for listing, filtering, and editing customer records.

### Primary Purpose
Enable deterministic customer record operations from a single table-driven workflow.

### Layout Structure

```text
Application Shell / Content Area

+----------------------------------------------------------------------------------+
| Page Header                                                                       |
| [Title + Context]                                               [Create Customer] |
+----------------------------------------------------------------------------------+
| Filters Row                                                                        |
| [Search] [Status Filter] [Sort]                                                   |
+----------------------------------------------------------------------------------+
| Main Data Region                                                                   |
| Customers Table                                                                    |
| Columns:                                                                           |
| - Customer Name                                                                    |
| - Email                                                                            |
| - Phone                                                                            |
| - Total Invoiced                                                                   |
| - Outstanding Balance                                                              |
| - Status                                                                           |
| - Actions                                                                          |
+----------------------------------------------------------------------------------+
```

### Primary Actions
- Create Customer

### Data Regions
- `page_header_region`
- `primary_action_region`
  - create_customer_action
- `filters_region`
  - customer_search_input
  - customer_status_filter
  - customer_sort_control
- `main_data_region`
  - customers_table_region
    - column_customer_name
    - column_email
    - column_phone
    - column_total_invoiced
    - column_outstanding_balance
    - column_status
    - column_actions

### Interaction Entry Points
- Create Customer action opens customer creation flow.
- Search/filter/sort controls update customers table query state.
- Row click opens **Customer Editor Drawer**.
- Row actions cell opens row-scoped operations without conflicting with row click behavior.

---

## 4) Products Screen

### Screen Overview
Product and service management screen for tenant catalog operations.

### Primary Purpose
Enable deterministic management of products/services through a filterable table workflow.

### Layout Structure

```text
Application Shell / Content Area

+----------------------------------------------------------------------------------+
| Page Header                                                                       |
| [Title + Context]                                                [Create Product] |
+----------------------------------------------------------------------------------+
| Filters Row                                                                        |
| [Search] [Product Type Filter]                                                    |
+----------------------------------------------------------------------------------+
| Main Data Region                                                                   |
| Products Table                                                                     |
| Columns:                                                                           |
| - Product Name                                                                     |
| - Type                                                                             |
| - Unit Price                                                                       |
| - Currency                                                                         |
| - Active Status                                                                    |
| - Actions                                                                          |
+----------------------------------------------------------------------------------+
```

### Primary Actions
- Create Product

### Data Regions
- `page_header_region`
- `primary_action_region`
  - create_product_action
- `filters_region`
  - product_search_input
  - product_type_filter
- `main_data_region`
  - products_table_region
    - column_product_name
    - column_type
    - column_unit_price
    - column_currency
    - column_active_status
    - column_actions

### Interaction Entry Points
- Create Product action opens product creation flow.
- Search/type filter controls update products table query state.
- Row click opens **Product Editor Drawer**.
- Row actions cell opens row-scoped operations without conflicting with row click behavior.

---

## Renderer Mapping Notes (Non-Styling)

To support deterministic rendering, each screen definition in this document is expected to map to:
- Layout components (container/grid/section/panel/drawer),
- Data components (stat_card/chart_container/table),
- Navigation components (topbar/sidebar),
- Form/filter controls (search/filter/sort/select).

This document defines structure and interaction zones only; tokens and visual styling are applied at later layers.
