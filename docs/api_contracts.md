# Billing SaaS REST API Contracts (v1)

## 1) Overview

This document defines the HTTP/JSON API contracts for the multi-tenant billing platform.

- Protocol: REST over HTTPS
- Base path: `/api/v1`
- Content type: `application/json` (except binary document download)
- Authentication: Bearer JWT (`Authorization: Bearer <token>`)
- Tenant context: derived from JWT claims and enforced server-side (no `tenant_id` in URLs or payloads)
- Money fields: integer minor units (for example cents), never floating point
- Time fields: RFC 3339 timestamps in UTC (`YYYY-MM-DDTHH:mm:ssZ`)

---

## 2) Auth and Security

### 2.1 Authentication model

- Access tokens are JWTs and required on all endpoints except login/refresh.
- JWT MUST contain tenant and subject context (for example: `tenant_id`, `sub`, role/scope claims).
- Authorization is role/scope based and evaluated per endpoint.
- `GET /events` is admin-only.

### 2.2 Required/standard headers

**Request headers**

- `Authorization: Bearer <jwt>` (required except login/refresh)
- `Content-Type: application/json` (required for JSON bodies)
- `Accept: application/json`
- `Idempotency-Key: <opaque-string>` (required for create/issue/send/void/pay/cancel mutation endpoints; optional otherwise)
- `X-Request-Id: <client-correlation-id>` (optional)

**Response headers**

- `Content-Type: application/json` (or `application/pdf` for invoice PDF)
- `X-Request-Id: <request-id>` (always returned)
- `RateLimit-Limit: <integer>`
- `RateLimit-Remaining: <integer>`
- `RateLimit-Reset: <unix-seconds>`
- `Retry-After: <seconds>` (only when throttled)

### 2.3 Authorization baseline by module

- Auth: public for login/refresh; authenticated for logout.
- Users: admin/owner for create/update/list.
- Customers/Products/Invoices/Payments/Subscriptions/Documents: authenticated tenant user; write operations require elevated role.
- Events: admin-only.

---

## 3) Conventions

### 3.1 Response envelope

All JSON responses use this envelope (including errors):

```json
{
  "data": {},
  "meta": {
    "request_id": "req_123",
    "cursor": {
      "next": "opaque-cursor",
      "prev": "opaque-cursor",
      "has_more": true
    }
  },
  "error": null
}
```

- `data`: object, array, or `null`.
- `meta.request_id`: server-generated request trace ID.
- `meta.cursor`: present for list endpoints.
- `error`: `null` on success.

### 3.2 Error envelope

On non-2xx responses:

```json
{
  "data": null,
  "meta": {
    "request_id": "req_123"
  },
  "error": {
    "code": "invoice_invalid_state",
    "message": "Invoice must be in draft status.",
    "details": {
      "invoice_id": "...",
      "current_status": "issued"
    }
  }
}
```

Error fields:
- `code`: machine-readable stable code.
- `message`: human-readable summary.
- `details`: structured context (validation fields, state conflict info, etc.).
- `meta.request_id`: correlation identifier.

### 3.3 Pagination model (standardized)

Cursor-based pagination is standardized for all list endpoints.

Query parameters:
- `limit` (optional, default `25`, max `100`)
- `cursor` (optional opaque token)

Response:
- `meta.cursor.next`
- `meta.cursor.prev`
- `meta.cursor.has_more`

### 3.4 Filtering and sorting conventions

- Filtering query params use direct field keys, for example `status=active` or `customer_id=<uuid>`.
- Range filters use suffixes:
  - `_from` (inclusive)
  - `_to` (inclusive)
  - example: `created_at_from=...&created_at_to=...`
- Sorting uses `sort`:
  - `sort=created_at` (ascending)
  - `sort=-created_at` (descending)
- Unsupported filter/sort returns `400 validation_error`.

### 3.5 Idempotency rules

- Required for mutation endpoints that create financial/side-effect records:
  - `POST` create endpoints
  - Invoice actions: `/issue`, `/send`, `/void`
  - Payment actions: create/allocate/void
  - Subscription cancel
- Key scope: `(tenant_id, method, path, idempotency_key)`.
- Reuse of same key + same normalized payload returns original response.
- Reuse of same key + different payload returns `409 idempotency_key_conflict`.
- Key retention window: minimum 24 hours.

---

## 4) Resource Contracts

## 4.1 Auth

### POST `/auth/login`
- **Purpose**: Authenticate user and issue access/refresh tokens.
- **Auth**: Not required.
- **Idempotency**: Not required.
- **Request**:
  - `email` (string, required)
  - `password` (string, required)
- **Response `200`**:
  - `access_token` (string)
  - `refresh_token` (string, optional depending on policy)
  - `token_type` (`Bearer`)
  - `expires_in` (integer seconds)
  - `user` (`id`, `email`, `full_name`, `role`, `status`)
- **Status codes**: `200`, `401`, `423`, `429`.

### POST `/auth/logout`
- **Purpose**: Invalidate current session/token pair.
- **Auth**: Required.
- **Idempotency**: Optional.
- **Request**:
  - `refresh_token` (string, optional if server tracks access token session)
- **Response `200`**:
  - `success` (boolean)
- **Status codes**: `200`, `401`.

### POST `/auth/refresh`
- **Purpose**: Exchange valid refresh token for new access token.
- **Auth**: Not required (token-based).
- **Idempotency**: Not required.
- **Request**:
  - `refresh_token` (string, required)
- **Response `200`**:
  - `access_token` (string)
  - `refresh_token` (string, optional rotation)
  - `token_type` (`Bearer`)
  - `expires_in` (integer)
- **Status codes**: `200`, `401`, `429`.

## 4.2 Users

### GET `/users`
- **Purpose**: List users in current tenant.
- **Auth**: Required (admin/owner).
- **Idempotency**: N/A.
- **Request query**:
  - `limit`, `cursor`, `sort`
  - filters: `status`, `role`, `email`
- **Response `200`**:
  - Array of user objects: `id`, `email`, `full_name`, `role`, `status`, `last_login_at`, `created_at`, `updated_at`
- **Status codes**: `200`, `401`, `403`.

### POST `/users`
- **Purpose**: Create/invite tenant user.
- **Auth**: Required (admin/owner).
- **Idempotency**: Required.
- **Request**:
  - `email` (string, required)
  - `full_name` (string, required)
  - `role` (string, required)
  - `status` (string, optional; default invited)
  - `preferences` (object, optional)
- **Response `201`**:
  - Created user object.
- **Status codes**: `201`, `400`, `401`, `403`, `409`.

### PATCH `/users/{id}`
- **Purpose**: Update user profile/role/status.
- **Auth**: Required (admin/owner).
- **Idempotency**: Optional.
- **Request**:
  - `full_name` (string, optional)
  - `role` (string, optional)
  - `status` (string, optional)
  - `preferences` (object, optional)
- **Response `200`**:
  - Updated user object.
- **Status codes**: `200`, `400`, `401`, `403`, `404`, `409`.

## 4.3 Customers

### GET `/customers`
- **Purpose**: List tenant customers.
- **Auth**: Required.
- **Idempotency**: N/A.
- **Request query**:
  - `limit`, `cursor`, `sort`
  - filters: `status`, `billing_email`, `external_reference`, `created_at_from`, `created_at_to`
- **Response `200`**:
  - Array of customer objects: `id`, `external_reference`, `legal_name`, `display_name`, `billing_email`, `currency_preference`, `payment_terms_days`, `status`, `metadata`, `created_at`, `updated_at`
- **Status codes**: `200`, `401`, `403`.

### POST `/customers`
- **Purpose**: Create customer.
- **Auth**: Required.
- **Idempotency**: Required.
- **Request**:
  - `external_reference` (string, optional)
  - `legal_name` (string, required)
  - `display_name` (string, optional)
  - `billing_email` (string, optional)
  - `billing_address` (object, required)
  - `shipping_address` (object, optional)
  - `tax_identifier` (string, optional)
  - `currency_preference` (string ISO-4217, optional)
  - `payment_terms_days` (integer, optional)
  - `metadata` (object, optional)
- **Response `201`**:
  - Created customer object.
- **Status codes**: `201`, `400`, `401`, `403`, `409`.

### GET `/customers/{id}`
- **Purpose**: Retrieve customer by ID.
- **Auth**: Required.
- **Idempotency**: N/A.
- **Response `200`**:
  - Customer object.
- **Status codes**: `200`, `401`, `403`, `404`.

### PATCH `/customers/{id}`
- **Purpose**: Update customer.
- **Auth**: Required.
- **Idempotency**: Optional.
- **Request**: same fields as create, all optional.
- **Response `200`**:
  - Updated customer object.
- **Status codes**: `200`, `400`, `401`, `403`, `404`, `409`.

### DELETE `/customers/{id}`
- **Purpose**: Soft-delete/archive customer.
- **Auth**: Required.
- **Idempotency**: Optional.
- **Response `204`**: No body.
- **Status codes**: `204`, `401`, `403`, `404`, `409`.

## 4.4 Products

### GET `/products`
- **Purpose**: List catalog products/services.
- **Auth**: Required.
- **Idempotency**: N/A.
- **Request query**:
  - `limit`, `cursor`, `sort`
  - filters: `is_active`, `billing_type`, `sku`, `currency`
- **Response `200`**:
  - Array of product objects: `id`, `sku`, `name`, `description`, `unit_price_minor`, `currency`, `tax_category`, `billing_type`, `is_active`, `metadata`, `created_at`, `updated_at`
- **Status codes**: `200`, `401`, `403`.

### POST `/products`
- **Purpose**: Create product.
- **Auth**: Required.
- **Idempotency**: Required.
- **Request**:
  - `sku` (string, required)
  - `name` (string, required)
  - `description` (string, optional)
  - `unit_price_minor` (integer, required)
  - `currency` (string ISO-4217, required)
  - `tax_category` (string, optional)
  - `billing_type` (enum `one_time|recurring`, required)
  - `is_active` (boolean, optional)
  - `metadata` (object, optional)
- **Response `201`**:
  - Created product object.
- **Status codes**: `201`, `400`, `401`, `403`, `409`.

### GET `/products/{id}`
- **Purpose**: Retrieve product by ID.
- **Auth**: Required.
- **Idempotency**: N/A.
- **Response `200`**: Product object.
- **Status codes**: `200`, `401`, `403`, `404`.

### PATCH `/products/{id}`
- **Purpose**: Update product.
- **Auth**: Required.
- **Idempotency**: Optional.
- **Request**: any mutable product fields.
- **Response `200`**: Updated product object.
- **Status codes**: `200`, `400`, `401`, `403`, `404`, `409`.

### DELETE `/products/{id}`
- **Purpose**: Soft-delete/retire product.
- **Auth**: Required.
- **Idempotency**: Optional.
- **Response `204`**: No body.
- **Status codes**: `204`, `401`, `403`, `404`, `409`.

## 4.5 Invoices

### GET `/invoices`
- **Purpose**: List invoices.
- **Auth**: Required.
- **Idempotency**: N/A.
- **Request query**:
  - `limit`, `cursor`, `sort`
  - filters: `status`, `customer_id`, `invoice_number`, `issue_date_from`, `issue_date_to`, `due_date_from`, `due_date_to`
- **Response `200`**:
  - Array of invoice objects: `id`, `customer_id`, `subscription_id`, `invoice_number`, `status`, `issue_date`, `due_date`, `currency`, `subtotal_minor`, `tax_minor`, `discount_minor`, `total_minor`, `amount_paid_minor`, `amount_due_minor`, `issued_at`, `voided_at`, `created_at`, `updated_at`
- **Status codes**: `200`, `401`, `403`.

### POST `/invoices`
- **Purpose**: Create draft invoice.
- **Auth**: Required.
- **Idempotency**: Required.
- **Request**:
  - `customer_id` (uuid, required)
  - `subscription_id` (uuid, optional)
  - `currency` (string, required)
  - `issue_date` (date, optional)
  - `due_date` (date, optional)
  - `notes` (string, optional)
  - `lines` (array, required, min 1) with:
    - `product_id` (uuid, optional)
    - `description` (string, required)
    - `quantity` (number string/decimal, required)
    - `unit_price_minor` (integer, required)
    - `tax_rate_basis_points` (integer, optional)
    - `sort_order` (integer, optional)
  - `metadata` (object, optional)
- **Response `201`**:
  - Draft invoice object including `lines` and computed totals.
- **Status codes**: `201`, `400`, `401`, `403`, `409`.

### GET `/invoices/{id}`
- **Purpose**: Retrieve invoice by ID.
- **Auth**: Required.
- **Idempotency**: N/A.
- **Response `200`**:
  - Invoice object with `lines`, and payment summary (`amount_paid_minor`, `amount_due_minor`).
- **Status codes**: `200`, `401`, `403`, `404`.

### PATCH `/invoices/{id}`
- **Purpose**: Edit draft invoice only.
- **Auth**: Required.
- **Idempotency**: Optional.
- **Request**: mutable draft fields (`due_date`, `notes`, `lines`, metadata).
- **Response `200`**: Updated invoice object.
- **Status codes**: `200`, `400`, `401`, `403`, `404`, `409` (invalid state).

### POST `/invoices/{id}/issue`
- **Purpose**: Transition invoice from `draft` to `issued` and assign final numbering if needed.
- **Auth**: Required.
- **Idempotency**: Required.
- **Request**:
  - `issue_date` (date, optional override)
  - `due_date` (date, optional override)
- **Response `200`**:
  - Issued invoice object (`status=issued`, `issued_at` set).
- **Status codes**: `200`, `400`, `401`, `403`, `404`, `409`.

### POST `/invoices/{id}/send`
- **Purpose**: Send issued invoice by email.
- **Auth**: Required.
- **Idempotency**: Required.
- **Request**:
  - `to` (array of email, optional defaults to customer billing contacts)
  - `cc` (array of email, optional)
  - `subject` (string, optional)
  - `message` (string, optional)
- **Response `202`**:
  - `delivery_id` (string)
  - `status` (queued|sent)
- **Status codes**: `202`, `400`, `401`, `403`, `404`, `409`.

### POST `/invoices/{id}/void`
- **Purpose**: Void an invoice per policy.
- **Auth**: Required.
- **Idempotency**: Required.
- **Request**:
  - `reason` (string, required)
- **Response `200`**:
  - Voided invoice object (`status=void`, `voided_at` set).
- **Status codes**: `200`, `400`, `401`, `403`, `404`, `409`.

### GET `/invoices/{id}/pdf`
- **Purpose**: Retrieve rendered invoice PDF artifact.
- **Auth**: Required.
- **Idempotency**: N/A.
- **Response `200`**:
  - Binary PDF stream (`Content-Type: application/pdf`) or signed URL payload by deployment policy.
- **Status codes**: `200`, `401`, `403`, `404`.

## 4.6 Payments

### GET `/payments`
- **Purpose**: List payments.
- **Auth**: Required.
- **Idempotency**: N/A.
- **Request query**:
  - `limit`, `cursor`, `sort`
  - filters: `status`, `customer_id`, `payment_date_from`, `payment_date_to`, `payment_method`, `payment_reference`
- **Response `200`**:
  - Array of payment objects: `id`, `customer_id`, `payment_reference`, `payment_method`, `payment_date`, `currency`, `amount_received_minor`, `allocated_minor`, `unallocated_minor`, `status`, `metadata`, `created_at`, `updated_at`
- **Status codes**: `200`, `401`, `403`.

### POST `/payments`
- **Purpose**: Record payment and optionally allocate to invoices.
- **Auth**: Required.
- **Idempotency**: Required.
- **Request**:
  - `customer_id` (uuid, required)
  - `payment_reference` (string, optional)
  - `payment_method` (string, required)
  - `payment_date` (date, required)
  - `currency` (string, required)
  - `amount_received_minor` (integer, required)
  - `allocations` (array, optional):
    - `invoice_id` (uuid, required)
    - `allocated_minor` (integer, required)
    - `allocation_date` (date, optional)
  - `metadata` (object, optional)
- **Response `201`**:
  - Payment object including allocation summary.
- **Status codes**: `201`, `400`, `401`, `403`, `409`.

### GET `/payments/{id}`
- **Purpose**: Retrieve payment and allocations.
- **Auth**: Required.
- **Idempotency**: N/A.
- **Response `200`**:
  - Payment object plus `allocations[]`.
- **Status codes**: `200`, `401`, `403`, `404`.

### POST `/payments/{id}/allocate`
- **Purpose**: Allocate existing payment balance to one or more invoices.
- **Auth**: Required.
- **Idempotency**: Required.
- **Request**:
  - `allocations` (array, required): `invoice_id`, `allocated_minor`, `allocation_date` (optional)
- **Response `200`**:
  - Updated payment object and resulting allocations.
- **Status codes**: `200`, `400`, `401`, `403`, `404`, `409`.

### POST `/payments/{id}/void`
- **Purpose**: Void/reverse payment by policy.
- **Auth**: Required.
- **Idempotency**: Required.
- **Request**:
  - `reason` (string, required)
- **Response `200`**:
  - Updated payment object (`status` updated).
- **Status codes**: `200`, `400`, `401`, `403`, `404`, `409`.

## 4.7 Subscriptions

### GET `/subscriptions`
- **Purpose**: List subscriptions.
- **Auth**: Required.
- **Idempotency**: N/A.
- **Request query**:
  - `limit`, `cursor`, `sort`
  - filters: `status`, `customer_id`, `plan_reference`, `next_billing_date_from`, `next_billing_date_to`
- **Response `200`**:
  - Array of subscription objects: `id`, `customer_id`, `plan_reference`, `status`, `start_date`, `end_date`, `billing_frequency`, `next_billing_date`, `auto_renew`, `pricing_terms`, `canceled_at`, `created_at`, `updated_at`
- **Status codes**: `200`, `401`, `403`.

### POST `/subscriptions`
- **Purpose**: Create subscription.
- **Auth**: Required.
- **Idempotency**: Required.
- **Request**:
  - `customer_id` (uuid, required)
  - `plan_reference` (string, optional)
  - `status` (string, optional default draft)
  - `start_date` (date, required)
  - `end_date` (date, optional)
  - `billing_frequency` (string, required)
  - `next_billing_date` (date, optional)
  - `auto_renew` (boolean, optional)
  - `pricing_terms` (object, required)
- **Response `201`**:
  - Created subscription object.
- **Status codes**: `201`, `400`, `401`, `403`, `409`.

### GET `/subscriptions/{id}`
- **Purpose**: Retrieve subscription.
- **Auth**: Required.
- **Idempotency**: N/A.
- **Response `200`**:
  - Subscription object.
- **Status codes**: `200`, `401`, `403`, `404`.

### PATCH `/subscriptions/{id}`
- **Purpose**: Update mutable subscription fields.
- **Auth**: Required.
- **Idempotency**: Optional.
- **Request**:
  - `end_date`, `billing_frequency`, `next_billing_date`, `auto_renew`, `pricing_terms`, `metadata` (all optional)
- **Response `200`**:
  - Updated subscription object.
- **Status codes**: `200`, `400`, `401`, `403`, `404`, `409`.

### POST `/subscriptions/{id}/cancel`
- **Purpose**: Cancel active subscription.
- **Auth**: Required.
- **Idempotency**: Required.
- **Request**:
  - `cancel_at` (date, optional immediate if omitted)
  - `reason` (string, optional)
- **Response `200`**:
  - Updated subscription object (`status=canceled`, `canceled_at` set).
- **Status codes**: `200`, `400`, `401`, `403`, `404`, `409`.

## 4.8 Documents

### GET `/documents`
- **Purpose**: List generated documents.
- **Auth**: Required.
- **Idempotency**: N/A.
- **Request query**:
  - `limit`, `cursor`, `sort`
  - filters: `document_type`, `source_entity_type`, `source_entity_id`, `generation_status`, `created_at_from`, `created_at_to`
- **Response `200`**:
  - Array of document objects: `id`, `document_type`, `source_entity_type`, `source_entity_id`, `template_reference`, `storage_uri` (or redacted/public URL), `checksum`, `generation_status`, `generated_at`, `metadata`, `created_at`, `updated_at`
- **Status codes**: `200`, `401`, `403`.

### GET `/documents/{id}`
- **Purpose**: Retrieve document metadata.
- **Auth**: Required.
- **Idempotency**: N/A.
- **Response `200`**:
  - Document object.
- **Status codes**: `200`, `401`, `403`, `404`.

## 4.9 Events / Audit

### GET `/events`
- **Purpose**: List immutable audit/event log entries.
- **Auth**: Required (admin-only).
- **Idempotency**: N/A.
- **Request query**:
  - `limit`, `cursor`, `sort=-occurred_at`
  - filters: `event_category`, `event_type`, `entity_type`, `entity_id`, `actor_type`, `occurred_at_from`, `occurred_at_to`, `correlation_id`
- **Response `200`**:
  - Array of event objects: `id`, `event_type`, `event_category`, `entity_type`, `entity_id`, `actor_type`, `actor_id`, `occurred_at`, `payload`, `correlation_id`, `idempotency_key`, `created_at`
- **Status codes**: `200`, `401`, `403`.

---


## 4.10 Tenants

### GET `/tenants/me`
- **Purpose**: Retrieve current tenant profile and billing configuration context.
- **Auth**: Required.
- **Idempotency**: N/A.
- **Response `200`**:
  - Tenant object: `id`, `name`, `status`, `base_currency`, `locale`, `time_zone`, `billing_settings`, `tax_settings`, `feature_entitlements`, `metadata`, `created_at`, `updated_at`.
- **Status codes**: `200`, `401`, `403`.

### PATCH `/tenants/me`
- **Purpose**: Update mutable tenant configuration fields used by billing workflows.
- **Auth**: Required (owner/admin).
- **Idempotency**: Optional.
- **Request**:
  - `name` (string, optional)
  - `locale` (string, optional)
  - `time_zone` (string, optional)
  - `billing_settings` (object, optional)
  - `tax_settings` (object, optional)
  - `feature_entitlements` (object, optional, policy-restricted)
  - `metadata` (object, optional)
- **Response `200`**:
  - Updated tenant object.
- **Status codes**: `200`, `400`, `401`, `403`, `409`.

---

## 4.11 Projects

### GET `/projects`
- **Purpose**: List tenant projects used for project-based billing and profitability tracking.
- **Auth**: Required.
- **Idempotency**: N/A.
- **Request query**:
  - `limit`, `cursor`, `sort`
  - filters: `status`, `customer_id`, `billing_method`, `created_at_from`, `created_at_to`
- **Response `200`**:
  - Array of project objects: `id`, `customer_id`, `name`, `code`, `status`, `billing_method`, `budget_minor`, `currency`, `start_date`, `end_date`, `created_at`, `updated_at`
- **Status codes**: `200`, `401`, `403`.

### POST `/projects`
- **Purpose**: Create a project.
- **Auth**: Required.
- **Idempotency**: Required.
- **Request**:
  - `customer_id` (uuid, required)
  - `name` (string, required)
  - `code` (string, optional)
  - `status` (string, optional; default `planned`)
  - `billing_method` (string, required)
  - `budget_minor` (integer, optional)
  - `currency` (string ISO-4217, required)
  - `start_date` (date, optional)
  - `end_date` (date, optional)
- **Response `201`**:
  - Created project object.
- **Status codes**: `201`, `400`, `401`, `403`, `409`.

### GET `/projects/{id}`
- **Purpose**: Retrieve project by ID.
- **Auth**: Required.
- **Idempotency**: N/A.
- **Response `200`**:
  - Project object.
- **Status codes**: `200`, `401`, `403`, `404`.

---

## 4.12 Time Tracking

### POST `/time-entries`
- **Purpose**: Create a time tracking entry for project/customer billing.
- **Auth**: Required.
- **Idempotency**: Required.
- **Request**:
  - `project_id` (uuid, required)
  - `customer_id` (uuid, optional)
  - `user_id` (uuid, optional if inferred from auth context)
  - `description` (string, optional)
  - `started_at` (datetime, required)
  - `ended_at` (datetime, required)
  - `duration_minutes` (integer, required)
  - `billable` (boolean, optional; default `true`)
  - `rate_minor` (integer, optional)
  - `currency` (string ISO-4217, required)
- **Response `201`**:
  - Created time entry object.
- **Status codes**: `201`, `400`, `401`, `403`, `409`.

### GET `/time-entries`
- **Purpose**: List time entries.
- **Auth**: Required.
- **Idempotency**: N/A.
- **Request query**:
  - `limit`, `cursor`, `sort=-started_at`
  - filters: `project_id`, `customer_id`, `billable`, `invoice_id`, `started_at_from`, `started_at_to`
- **Response `200`**:
  - Array of time entry objects: `id`, `project_id`, `customer_id`, `user_id`, `description`, `started_at`, `ended_at`, `duration_minutes`, `billable`, `rate_minor`, `currency`, `invoice_id`, `created_at`, `updated_at`
- **Status codes**: `200`, `401`, `403`.

---

## 4.13 Estimates

### GET `/estimates`
- **Purpose**: List customer estimates/quotes.
- **Auth**: Required.
- **Idempotency**: N/A.
- **Request query**:
  - `limit`, `cursor`, `sort=-issue_date`
  - filters: `status`, `customer_id`, `project_id`, `issue_date_from`, `issue_date_to`, `expiry_date_from`, `expiry_date_to`
- **Response `200`**:
  - Array of estimate objects: `id`, `estimate_number`, `customer_id`, `project_id`, `status`, `issue_date`, `expiry_date`, `currency`, `subtotal_minor`, `tax_minor`, `discount_minor`, `total_minor`, `converted_invoice_id`, `created_at`, `updated_at`
- **Status codes**: `200`, `401`, `403`.

### POST `/estimates`
- **Purpose**: Create an estimate.
- **Auth**: Required.
- **Idempotency**: Required.
- **Request**:
  - `customer_id` (uuid, required)
  - `project_id` (uuid, optional)
  - `issue_date` (date, required)
  - `expiry_date` (date, optional)
  - `currency` (string ISO-4217, required)
  - `line_items` (array, required) with per-item fields: `product_id` (optional), `description` (required), `quantity` (required), `unit_price_minor` (required), `tax_rate_basis_points` (optional)
  - `notes` (string, optional)
  - `terms` (string, optional)
- **Response `201`**:
  - Created estimate object with items.
- **Status codes**: `201`, `400`, `401`, `403`, `409`.

### POST `/estimates/{id}/convert`
- **Purpose**: Convert an accepted estimate into an invoice.
- **Auth**: Required.
- **Idempotency**: Required.
- **Request**:
  - `issue_date` (date, optional)
  - `due_date` (date, optional)
  - `invoice_overrides` (object, optional)
- **Response `201`**:
  - Created invoice object and conversion metadata.
- **Status codes**: `201`, `400`, `401`, `403`, `404`, `409`, `422`.

---

## 4.14 Reports

### GET `/reports/revenue`
- **Purpose**: Generate revenue report output for a tenant.
- **Auth**: Required.
- **Idempotency**: N/A.
- **Request query**:
  - `period_from`, `period_to` (date, required)
  - `group_by` (optional; e.g., `month`, `customer`, `product`)
  - `currency` (optional)
- **Response `200`**:
  - Revenue metrics and grouped totals payload.
- **Status codes**: `200`, `400`, `401`, `403`.

### GET `/reports/aging`
- **Purpose**: Generate invoice aging report.
- **Auth**: Required.
- **Idempotency**: N/A.
- **Request query**:
  - `as_of_date` (date, optional; default today)
  - `customer_id` (optional)
- **Response `200`**:
  - Aging buckets and invoice-level balances.
- **Status codes**: `200`, `400`, `401`, `403`.

### GET `/reports/cashflow`
- **Purpose**: Generate cash flow reporting output with historical/forecast view.
- **Auth**: Required.
- **Idempotency**: N/A.
- **Request query**:
  - `period_from`, `period_to` (date, required)
  - `include_forecast` (boolean, optional)
- **Response `200`**:
  - Cash in/out aggregates and projected balance trends.
- **Status codes**: `200`, `400`, `401`, `403`.

---

## 4.15 Portal

### POST `/portal/login`
- **Purpose**: Authenticate a portal user for customer-facing invoice/payment access.
- **Auth**: Not required.
- **Idempotency**: Not required.
- **Request**:
  - `email` (string, required)
  - `password` or `magic_token` (string, required based on auth provider)
- **Response `200`**:
  - `access_token`, `token_type`, `expires_in`, and minimal portal user profile.
- **Status codes**: `200`, `401`, `423`, `429`.

### GET `/portal/invoices`
- **Purpose**: List invoices visible to the authenticated portal user.
- **Auth**: Required (portal session).
- **Idempotency**: N/A.
- **Request query**:
  - `limit`, `cursor`, `sort=-issue_date`
  - filters: `status`, `issue_date_from`, `issue_date_to`
- **Response `200`**:
  - Array of invoice summaries: `id`, `invoice_number`, `issue_date`, `due_date`, `status`, `currency`, `total_minor`, `amount_due_minor`, `pdf_url`.
- **Status codes**: `200`, `401`, `403`.

### GET `/portal/payments`
- **Purpose**: List payments made by/for the portal user customer account.
- **Auth**: Required (portal session).
- **Idempotency**: N/A.
- **Request query**:
  - `limit`, `cursor`, `sort=-received_at`
  - filters: `status`, `received_at_from`, `received_at_to`
- **Response `200`**:
  - Array of payment summaries: `id`, `reference`, `method`, `status`, `currency`, `amount_received_minor`, `received_at`.
- **Status codes**: `200`, `401`, `403`.

---

## 4.16 Automation

### POST `/automation/rules`
- **Purpose**: Create an automation rule for reminders or workflow triggers.
- **Auth**: Required.
- **Idempotency**: Required.
- **Request**:
  - `name` (string, required)
  - `status` (string, optional; default `active`)
  - `trigger_type` (string, required)
  - `trigger_config` (object, required)
  - `conditions` (object, optional)
  - `actions` (array/object, required)
- **Response `201`**:
  - Created automation rule object.
- **Status codes**: `201`, `400`, `401`, `403`, `409`.

### GET `/automation/rules`
- **Purpose**: List automation rules.
- **Auth**: Required.
- **Idempotency**: N/A.
- **Request query**:
  - `limit`, `cursor`, `sort=-updated_at`
  - filters: `status`, `trigger_type`, `created_at_from`, `created_at_to`
- **Response `200`**:
  - Array of automation rule objects: `id`, `name`, `status`, `trigger_type`, `trigger_config`, `conditions`, `actions`, `last_executed_at`, `created_at`, `updated_at`
- **Status codes**: `200`, `401`, `403`.

---

## 5) Webhooks (Placeholder)

Webhook contracts are not part of Phase 1. Future versions may define:
- tenant-scoped webhook endpoints,
- signing/verification headers,
- retry and dead-letter policy,
- event type catalog and payload schemas.
