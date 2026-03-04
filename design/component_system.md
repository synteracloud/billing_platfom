# Component System — Deterministic UI Foundation

## 1) Purpose and Scope
This document defines the deterministic component system used by all frontend interfaces in the billing platform. It operationalizes the frontend architecture layer model:

- **Data/API contracts** provide trusted business data.
- **Renderer schemas** define what UI should be shown.
- **Component system** defines how UI behaves and composes.
- **Design tokens** define visual expression.

The system is optimized for:
- high data density,
- financial workflows,
- predictable interactions,
- renderer-driven UI generation.

Design quality target:
- Stripe-level information clarity,
- Linear-level interaction polish,
- Notion-level composability and consistency.

---

## 2) Core Principles

### 2.1 Reusable by Default
All UI must be built from reusable components. Page-level code composes components and passes data; it does not re-implement interaction patterns.

### 2.2 Token-Driven Styling
All visual styling must be sourced from `/design/design_tokens.json` semantic tokens. Components must not use hardcoded colors, spacing, typography, radius, shadows, border widths, z-index, or motion values.

### 2.3 No Hardcoded Styling in Components
Component internals must avoid raw style constants (e.g., `#2563EB`, `14px`, `200ms`). Only token references are allowed.

### 2.4 Composability First
Components must support composition through slots, children, subcomponents, and controlled props. No tightly-coupled one-off UI structures.

### 2.5 Renderer Compatibility
Each component must expose deterministic props that map directly from renderer schemas. Given the same schema + data + tokens, output must be identical.

### 2.6 Deterministic Interaction Contracts
Component states, transitions, and event payloads must be explicit and stable to prevent UI drift across modules.

---

## 3) Architectural Placement

Component system is **Layer 2** in frontend architecture:

1. Design tokens
2. Component system
3. Wireframes
4. Renderer
5. Application pages

Strict flow:

`API data -> renderer schema -> components -> tokens -> rendered UI`

Disallowed:
- direct ad-hoc styling inside pages,
- bypassing components from renderer output,
- component variants with undocumented behavior forks.

---

## 4) Cross-Cutting Component Contract

All components must implement the following baseline contract where applicable:

- `id`, `data-testid`, `aria-*` pass-through
- `size` and `density` variants (for high-density interfaces)
- `state` support: `default | hover | focus | active | disabled | error`
- keyboard operability for interactive roles
- focus visibility using `color.*.focusRing`
- tokenized motion durations/easing
- deterministic event payloads (`onChange`, `onSelect`, `onOpenChange`, etc.)
- controlled and uncontrolled usage (where applicable)
- light/dark compatibility via token themes

State precedence rule:
`disabled > error > active > focus > hover > default`

---

## 5) Tier 1 — Primitive Components

Primitive components are atomic building blocks.

### 5.1 `button`
Variants: `primary`, `secondary`, `ghost`, `danger`, `link`.

Requirements:
- supports icon-only and icon+label modes,
- supports loading state with `spinner`,
- deterministic width behavior (`auto`, `full`),
- no text truncation without tooltip affordance.

### 5.2 `icon`
Requirements:
- tokenized size tiers,
- semantic color binding (inherit or explicit token role),
- decorative vs semantic mode (`aria-hidden` vs labeled).

### 5.3 `text`
Requirements:
- semantic text roles (body, label, caption, heading),
- typography token binding only,
- optional mono numeric mode for financial columns.

### 5.4 `badge`
Requirements:
- semantic statuses (`info`, `success`, `warning`, `danger`, `neutral`),
- compact mode for dense tables,
- readable contrast in light/dark themes.

### 5.5 `divider`
Requirements:
- horizontal/vertical orientation,
- subtle/strong emphasis levels via border tokens.

### 5.6 `spinner`
Requirements:
- inline and block modes,
- deterministic size/color token usage,
- accessible loading semantics (`aria-live` pattern at host level).

---

## 6) Tier 2 — Form Components

Form components must support label, helper text, validation, error messaging, and schema-driven configuration.

### 6.1 Component Set
- `input`
- `textarea`
- `select`
- `combobox`
- `checkbox`
- `radio`
- `switch`
- `date_picker`
- `currency_input`
- `number_input`

### 6.2 Shared Form Rules

#### Validation States
Every form field supports:
- neutral/default,
- valid (optional positive affirmation),
- error (message + visual state),
- disabled,
- read-only (where applicable).

#### Error Messaging
- Error messages are actionable and specific.
- Error text uses semantic danger tokens.
- `aria-invalid` and `aria-describedby` must be wired deterministically.

#### Label + Helper Text
- Label always associated via `for`/`id`.
- Helper text optional and concise.
- Required/optional indicator standardized.

### 6.3 Financial Field Requirements

#### `currency_input`
- fixed currency code behavior per schema,
- deterministic decimal precision,
- locale-safe display with canonical normalized value,
- right-aligned numeric content for scanability.

#### `number_input`
- deterministic stepping/increment semantics,
- precision and min/max from schema,
- prevents silent rounding drift.

#### `date_picker`
- keyboard navigable calendar,
- timezone-safe value handling,
- renderer-configurable date constraints.

---

## 7) Tier 3 — Layout Components

Layout components define structural consistency and hierarchy.

### 7.1 Component Set
- `container`
- `grid`
- `stack`
- `section`
- `card`
- `panel`
- `drawer`
- `modal`

### 7.2 Layout Rules
- spacing strictly token-controlled,
- consistent internal padding per size tier,
- predictable content hierarchy (`header`, `body`, `footer` slots),
- no arbitrary nesting without clear information hierarchy.

### 7.3 Overlay Rules (`drawer`, `modal`)
- focus trap required,
- ESC close behavior configurable but deterministic,
- body scroll lock standardized,
- z-index from token scale only,
- dismiss behavior (overlay click, close icon, explicit action) schema-controlled.

---

## 8) Tier 4 — Data Components

Data components are primary for financial operations and high-density workflows.

### 8.1 Component Set
- `table`
- `data_grid`
- `list`
- `stat_card`
- `chart_container`
- `timeline`
- `activity_feed`

### 8.2 Table Requirements (Mandatory)
`table` and `data_grid` must support:
- sortable columns,
- filtering,
- row selection,
- row expansion,
- sticky headers.

Additional required behavior:
- deterministic default sorting from schema,
- column alignment rules (numeric right-aligned),
- status cell semantic rendering,
- pagination/virtualization strategy declared in schema,
- empty/error/loading states via reusable patterns,
- row click and row actions conflict resolution (no accidental navigation).

### 8.3 Financial Density Standards
- compact row heights with accessible hit targets,
- monospaced numerals for alignment-critical values,
- subtotal/total rows visually distinct via semantic emphasis,
- no color-only meaning for risk or payment status.

---

## 9) Tier 5 — Navigation Components

### 9.1 Component Set
- `sidebar`
- `topbar`
- `breadcrumb`
- `tabs`
- `dropdown_menu`
- `command_palette`

### 9.2 Navigation Rules
- stable module ordering and active states,
- keyboard-first operation,
- deterministic URL + state synchronization,
- breadcrumb usage only for meaningful hierarchy depth,
- command palette actions mapped to canonical routes/commands.

---

## 10) Tier 6 — Workflow Components

Workflow components encapsulate complex billing tasks with deterministic business interaction patterns.

### 10.1 Component Set
- `entity_table`
- `entity_editor`
- `invoice_line_editor`
- `payment_allocation_editor`
- `subscription_plan_editor`

### 10.2 Workflow Rules
- renderer schema defines structure and available actions,
- component enforces interaction consistency and UX safeguards,
- domain validation feedback displayed inline and summary-level,
- optimistic UI only where backend guarantees idempotent reconciliation,
- unsaved-change guards required for multi-field edits,
- deterministic totals recalculation display for invoice/payment editing.

---

## 11) Component State Model

Each interactive component must support:
- `default`
- `hover`
- `focus`
- `active`
- `disabled`
- `error`

Implementation requirements:
- states are style-token mapped, not custom per screen,
- focus always visible for keyboard users,
- disabled state blocks interaction and communicates non-interactivity,
- error state combines semantic visuals with textual explanation.

---

## 12) Accessibility Standards

All components must support:
- keyboard navigation,
- focus management,
- ARIA roles/attributes where required,
- touch interactions.

Additional requirements:
- target sizes remain usable in compact layouts,
- interactive elements must have programmatic names,
- live region patterns for async status changes,
- no interaction requiring hover-only discovery.

---

## 13) Deterministic Rendering Model

Renderer integration pattern:

`renderer schema -> component mapping -> token-driven variants -> stable UI`

### 13.1 Example Mapping
- `table_schema` -> `table` / `data_grid`
- `form_schema` -> Tier 2 form components
- `layout_schema` -> Tier 3 layout components
- `navigation_schema` -> Tier 5 navigation components
- `workflow_schema` -> Tier 6 workflow components

### 13.2 Schema Contract Requirements
Schemas must declare:
- component type,
- variant,
- density/size,
- data bindings,
- validation and interaction hooks,
- responsive behavior,
- permission and visibility rules.

Component resolution must be deterministic and side-effect free.

---

## 14) Responsive Behavior Rules

All components must adapt across screen sizes without losing functionality.

Required support:
- stacking,
- horizontal scroll,
- drawer conversion.

### 14.1 Responsive Guarantees by Tier
- Forms: multi-column to single-column stack transition.
- Tables/data grids: preserve columns via horizontal scroll and column priority rules.
- Navigation: sidebar may convert to drawer at smaller breakpoints.
- Workflow editors: preserve action visibility and data integrity controls on mobile/tablet.

No responsive mode may hide critical financial controls without an equivalent accessible pathway.

---

## 15) Governance and Anti-Drift Rules

- New UI patterns must be introduced as components, not page-local hacks.
- Token changes are the only path for visual system updates.
- Interaction changes must be documented at component contract level.
- Renderer mappings must be versioned when behavior contracts change.
- Deprecated component props require migration guidance before removal.

Acceptance checklist for new/updated components:
- uses semantic tokens only,
- supports required states,
- accessible by keyboard/screen reader/touch,
- compatible with renderer schema mapping,
- responsive without functional loss,
- validated for dense financial data display.

---

## 16) Summary
This component system ensures every frontend interface is:
- reusable,
- token-driven,
- composable,
- deterministic,
- accessible,
- and optimized for high-density financial workflows.

It is the enforcement layer that converts architecture and design language into predictable, scalable product UI.
