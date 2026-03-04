# Billing Platform Design Language

## Purpose and Scope
This document defines the product-wide design language for the billing SaaS platform. It governs structure, layout, interaction behavior, and visual hierarchy for all application surfaces.

It is anchored to:
- `docs/architecture.md` for deterministic frontend architecture and layer boundaries.
- `design/design_tokens.json` for all visual primitives (color, spacing, typography, radius, shadow, motion, z-index).

Design quality target:
- Stripe Dashboard-level data clarity
- Linear-level interaction precision
- Notion-level visual calm and predictability

Core experience goals:
- Clarity
- Density
- Predictability
- Visual calm
- High usability for financial workflows
- Full feature capability across all device classes

---

## 1) Design Principles

### 1.1 Clarity Over Decoration
Every UI element must communicate state, context, or action. Decorative elements without functional purpose are excluded.
- Use semantic token colors only.
- Prioritize legibility, contrast, and interaction affordance.
- Use minimal non-essential ornamentation.

### 1.2 Data-First Layout
The platform is operational software; data understanding and task completion are primary.
- Allocate most viewport space to structured business data.
- Keep analytics, tables, and forms in primary focus regions.
- Keep secondary information in supporting panels, not competing with primary tasks.

### 1.3 Consistent Interaction Patterns
Identical actions must behave the same way in all modules.
- Primary actions share placement and styling conventions.
- Edit, create, and destructive workflows follow standardized patterns.
- Interaction consistency takes precedence over local optimization.

### 1.4 Minimal Visual Noise
Dense interfaces must remain calm.
- Restrict simultaneous emphasis to one primary focal point per view.
- Use spacing and typography hierarchy before color escalation.
- Avoid heavy borders, excessive shadows, and unnecessary iconography.

### 1.5 Strong Hierarchy
Users must instantly distinguish page-level context, section-level context, and record-level details.
- Distinct typography levels for page title, section headers, table headers, body, metadata.
- Progressive disclosure for advanced settings and infrequent details.
- Group related controls and data using spacing tokens.

### 1.6 Predictable Navigation
Location and behavior of navigation and actions are stable across modules.
- Navigation anchors do not shift between pages.
- Module transitions preserve user orientation.
- Active and selected states are explicit and consistent.

### 1.7 Fast Task Completion
The system optimizes for repetitive, high-value financial operations.
- Minimize clicks for common flows (issue invoice, record payment, edit customer).
- Prefer inline controls where risk is low and context is clear.
- Enable keyboard-first workflows for power users.

### 1.8 Deterministic UI Construction
All rendered UI must be generated through design system layers.
- Visual decisions come from tokens + component system.
- Structural decisions come from wireframes.
- Runtime composition comes from renderer schemas.
- Page-level direct styling is prohibited.

---

## 2) Layout System

### 2.1 Global Application Shell
The application shell consists of three persistent regions:
1. **Top Navigation**
2. **Sidebar Navigation**
3. **Content Area**

#### Top Navigation
Purpose:
- Workspace identity, tenant context, global search, user/account controls, global alerts.

Rules:
- Persistent across authenticated app routes.
- Fixed at top within app shell.
- Height remains consistent across modules.

#### Sidebar Navigation
Purpose:
- Primary module navigation and cross-module orientation.

Rules:
- Persistent on desktop and laptop.
- Collapsible (expanded/collapsed states).
- Includes module-level navigation only.
- State persists per user preference.

#### Content Area
Purpose:
- Primary workspace for analytics, lists, forms, and detail views.

Rules:
- Uses responsive grid layout.
- Maintains max readable width for text-heavy regions.
- Allows full-width expansion for data-dense regions (tables).
- Supports split views where needed (main + supporting panel).

### 2.2 Page Structure Standard
Every page follows a common internal structure:
1. **Page Header**
2. **Primary Action Area**
3. **Main Data Region**
4. **Supporting Panels**

#### Page Header
Contains page title, contextual metadata, and status indicators.

#### Primary Action Area
Contains the highest-priority task actions (e.g., Create Invoice, Record Payment).
- Primary CTA is visually dominant.
- Secondary actions grouped and de-emphasized.

#### Main Data Region
Primary area for tables, forms, timelines, and document previews.

#### Supporting Panels
Used for filters, related records, summaries, or audit context.
- May appear inline, docked, or as drawers depending on viewport.

### 2.3 Grid and Width Rules
- Use tokenized spacing for gutter and region spacing.
- Use modular grid behavior with predictable column spans.
- Allow denser column packing on wide screens for financial operations.
- Enforce comfortable measure for long-form text and settings descriptions.

---

## 3) Data Presentation

### 3.1 Tables (Primary Data UI)
Tables are the default representation for transactional and master data.

Required capabilities:
- Sortable columns
- Filtering controls
- High data density
- Sticky headers
- Row hover states
- Row click navigation

Behavior rules:
- Default sort and key columns are deterministic per module.
- Numeric values are right-aligned for scanability.
- Monetary values use consistent formatting and precision.
- Status values use semantic color tokens and text labels.
- Row-level actions are discoverable but secondary to row navigation.

### 3.2 Forms
Forms may appear in:
- Drawers
- Modals
- Dedicated pages

Rules:
- Group fields by domain meaning (identity, billing terms, tax, notes).
- Use clear labels and helper text only where needed.
- Perform inline validation on blur and/or input with actionable messages.
- Prevent data loss with unsaved-change protection.
- Keep friction minimal: sensible defaults, autocomplete, retained recent choices.

### 3.3 Cards
Cards are used for:
- Metrics
- Summaries
- Dashboard blocks

Rules:
- Cards summarize; they do not replace detailed operational views.
- Use consistent card anatomy (title, value/content, optional trend/action).
- Avoid deep nesting inside cards.

### 3.4 Financial Data Readability
- Use monospaced numerals where required for alignment-sensitive values.
- Maintain strong visual distinction between totals, subtotals, taxes, and balances.
- Never rely on color alone to indicate financial state.

---

## 4) Navigation

### 4.1 Sidebar Modules
The sidebar module order is:
1. Dashboard
2. Customers
3. Products
4. Invoices
5. Payments
6. Subscriptions
7. Settings

### 4.2 Navigation Rules
- Consistent module placement across sessions and devices.
- Keyboard-friendly navigation (tab order, focus visibility, shortcuts where defined).
- Clear active states for current module and sub-route.
- Current page context remains visible in header.

### 4.3 Wayfinding
- Use breadcrumbs only where hierarchy depth requires it.
- Preserve filter/query state when navigating back from details.
- Avoid hidden navigation routes for core workflows.

---

## 5) Interaction Patterns

### 5.1 Action Priority Model
#### Primary actions
- Create
- Edit
- Send
- Issue
- Record Payment

Primary action rules:
- Exactly one primary CTA per context.
- Primary CTA uses semantic primary tokens.
- Place in consistent location (header action area or form sticky action bar).

#### Secondary actions
- Archive
- Delete
- Export

Secondary action rules:
- Group in overflow/dropdown when not critical.
- Destructive actions require confirmation and clear impact messaging.

### 5.2 Standard UI Patterns
The following patterns are standard and reusable:
- Dropdown menus
- Modals
- Drawers
- Inline editing
- Bulk actions

Pattern guidance:
- **Dropdowns**: short, contextual action lists.
- **Modals**: high-focus confirmations or short transactional forms.
- **Drawers**: contextual editing without losing table/list context.
- **Inline editing**: low-risk, high-frequency field updates.
- **Bulk actions**: multi-select controls with explicit counts and reversible actions when possible.

### 5.3 Feedback and States
- All actions provide immediate feedback (loading, success, error).
- Disabled states include reason where ambiguity exists.
- Empty states always provide next best action.
- Error states prioritize recovery path.

### 5.4 Input Modality Support
The interface must support:
- Touch interaction
- Keyboard interaction
- Pointer interaction

All controls must maintain accessible touch targets and visible keyboard focus.

---

## 6) Visual Hierarchy

Typography and spacing must use `design/design_tokens.json` values only.

Hierarchy order:
1. **Page Title**
2. **Section Headers**
3. **Table Headers**
4. **Body Text**
5. **Metadata**

Rules:
- Page title carries strongest emphasis using display/xl token scale as context requires.
- Section headers separate major functional regions.
- Table headers use clear contrast and sticky behavior for orientation.
- Body text uses default readable size and line-height.
- Metadata is visually quiet but legible (muted token usage).

Spacing rules:
- All margin, padding, and inter-component gaps use spacing tokens (`xs` through `3xl`).
- Vertical rhythm must be consistent within and between modules.
- Do not apply arbitrary pixel values outside token set.

Color and elevation rules:
- Semantic text and surface tokens define contrast.
- Border and shadow tokens communicate separation subtly.
- Focus, warning, success, and danger states use semantic state tokens.

---

## 7) Responsive Behavior

### 7.1 Core Rule: Adapt Layout, Not Capability
No intentional feature reduction is allowed on mobile or tablet.

The following workflows must remain fully available on every device:
- Dashboard analytics
- Customer management
- Product management
- Invoice creation and editing
- Payment recording and allocation
- Subscription management
- Document generation
- Settings and administration

### 7.2 Responsive Strategy
Adapt using:
- Grid reflow
- Stacked layouts
- Responsive panels
- Drawers
- Progressive disclosure

No business functionality may be removed due to screen size.

### 7.3 Tables on Small Screens
Tables remain fully functional via:
- Horizontal scrolling
- Sticky key columns
- Column visibility controls
- Row expansion for secondary fields
- Filter and sorting controls in drawers

### 7.4 Forms on Small Screens
Forms remain fully functional via:
- Multi-section layouts
- Step-based flows for long forms
- Sticky action bars
- Collapsible groups

### 7.5 Navigation Adaptation
Navigation adapts by device class while preserving complete module access:
- **Desktop:** persistent sidebar navigation
- **Tablet:** collapsible sidebar
- **Mobile:** drawer or bottom navigation

All modules remain accessible in every mode.

### 7.6 Breakpoint Principles
Breakpoints control layout adaptation only, never feature availability.

Design consistency must be maintained across:
- Mobile
- Tablet
- Laptop
- Desktop
- Large monitors

---

## 8) Deterministic UI Rule

All UI must derive from:
- Design tokens
- Component system
- Wireframes
- Renderer schemas

Hard rule:
- Direct styling inside page implementations is not allowed.

Change control:
- Visual design changes → update tokens.
- Interaction pattern changes → update components.
- Layout structure changes → update wireframes.
- Data/business rule changes → update backend contracts and logic.

This ensures deterministic rendering, prevents visual drift, and preserves architecture integrity.
