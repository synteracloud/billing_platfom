CREATE EXTENSION IF NOT EXISTS citext;

CREATE TABLE IF NOT EXISTS schema_migrations (
  version TEXT PRIMARY KEY,
  applied_at TIMESTAMPTZ NOT NULL DEFAULT NOW()
);

CREATE TABLE tenant (
  id UUID PRIMARY KEY,
  name TEXT NOT NULL,
  status TEXT NOT NULL,
  base_currency CHAR(3) NOT NULL,
  locale TEXT NOT NULL,
  time_zone TEXT NOT NULL,
  billing_settings JSONB NOT NULL DEFAULT '{}'::jsonb,
  tax_settings JSONB NOT NULL DEFAULT '{}'::jsonb,
  feature_entitlements JSONB NOT NULL DEFAULT '{}'::jsonb,
  metadata JSONB NOT NULL DEFAULT '{}'::jsonb,
  created_at TIMESTAMPTZ NOT NULL,
  updated_at TIMESTAMPTZ NOT NULL
);

CREATE INDEX idx_tenant_status ON tenant (status);

CREATE TABLE "user" (
  id UUID PRIMARY KEY,
  tenant_id UUID NOT NULL REFERENCES tenant(id),
  email CITEXT NOT NULL,
  full_name TEXT NOT NULL,
  role TEXT NOT NULL,
  status TEXT NOT NULL,
  last_login_at TIMESTAMPTZ NULL,
  preferences JSONB NOT NULL DEFAULT '{}'::jsonb,
  deleted_at TIMESTAMPTZ NULL,
  created_at TIMESTAMPTZ NOT NULL,
  updated_at TIMESTAMPTZ NOT NULL,
  UNIQUE (tenant_id, id),
  UNIQUE (tenant_id, email)
);

CREATE TABLE customer (
  id UUID PRIMARY KEY,
  tenant_id UUID NOT NULL REFERENCES tenant(id),
  external_reference TEXT NULL,
  legal_name TEXT NOT NULL,
  display_name TEXT NULL,
  billing_email CITEXT NULL,
  billing_address JSONB NOT NULL DEFAULT '{}'::jsonb,
  shipping_address JSONB NULL,
  tax_identifier TEXT NULL,
  currency_preference CHAR(3) NULL,
  payment_terms_days INTEGER NULL,
  status TEXT NOT NULL,
  metadata JSONB NOT NULL DEFAULT '{}'::jsonb,
  deleted_at TIMESTAMPTZ NULL,
  created_at TIMESTAMPTZ NOT NULL,
  updated_at TIMESTAMPTZ NOT NULL,
  UNIQUE (tenant_id, id)
);
CREATE UNIQUE INDEX uq_customer_external_reference
  ON customer (tenant_id, external_reference)
  WHERE external_reference IS NOT NULL;

CREATE TABLE product (
  id UUID PRIMARY KEY,
  tenant_id UUID NOT NULL REFERENCES tenant(id),
  sku TEXT NOT NULL,
  name TEXT NOT NULL,
  description TEXT NULL,
  unit_price_minor BIGINT NOT NULL,
  currency CHAR(3) NOT NULL,
  tax_category TEXT NULL,
  billing_type TEXT NOT NULL,
  is_active BOOLEAN NOT NULL DEFAULT TRUE,
  metadata JSONB NOT NULL DEFAULT '{}'::jsonb,
  deleted_at TIMESTAMPTZ NULL,
  created_at TIMESTAMPTZ NOT NULL,
  updated_at TIMESTAMPTZ NOT NULL,
  UNIQUE (tenant_id, id),
  UNIQUE (tenant_id, sku)
);

CREATE TABLE subscription (
  id UUID PRIMARY KEY,
  tenant_id UUID NOT NULL REFERENCES tenant(id),
  customer_id UUID NOT NULL,
  plan_reference TEXT NULL,
  status TEXT NOT NULL,
  start_date DATE NOT NULL,
  end_date DATE NULL,
  billing_frequency TEXT NOT NULL,
  next_billing_date DATE NULL,
  auto_renew BOOLEAN NOT NULL DEFAULT TRUE,
  pricing_terms JSONB NOT NULL DEFAULT '{}'::jsonb,
  canceled_at TIMESTAMPTZ NULL,
  deleted_at TIMESTAMPTZ NULL,
  created_at TIMESTAMPTZ NOT NULL,
  updated_at TIMESTAMPTZ NOT NULL,
  UNIQUE (tenant_id, id),
  FOREIGN KEY (tenant_id, customer_id) REFERENCES customer(tenant_id, id)
);

CREATE TABLE invoice (
  id UUID PRIMARY KEY,
  tenant_id UUID NOT NULL REFERENCES tenant(id),
  customer_id UUID NOT NULL,
  subscription_id UUID NULL,
  invoice_number TEXT NOT NULL,
  status TEXT NOT NULL,
  issue_date DATE NULL,
  due_date DATE NULL,
  currency CHAR(3) NOT NULL,
  subtotal_minor BIGINT NOT NULL,
  tax_minor BIGINT NOT NULL,
  discount_minor BIGINT NOT NULL DEFAULT 0,
  total_minor BIGINT NOT NULL,
  amount_paid_minor BIGINT NOT NULL DEFAULT 0,
  amount_due_minor BIGINT NOT NULL,
  notes TEXT NULL,
  issued_at TIMESTAMPTZ NULL,
  voided_at TIMESTAMPTZ NULL,
  metadata JSONB NOT NULL DEFAULT '{}'::jsonb,
  created_at TIMESTAMPTZ NOT NULL,
  updated_at TIMESTAMPTZ NOT NULL,
  UNIQUE (tenant_id, id),
  UNIQUE (tenant_id, invoice_number),
  FOREIGN KEY (tenant_id, customer_id) REFERENCES customer(tenant_id, id),
  FOREIGN KEY (tenant_id, subscription_id) REFERENCES subscription(tenant_id, id),
  CHECK (amount_paid_minor >= 0),
  CHECK (amount_due_minor >= 0)
);

CREATE TABLE invoice_line (
  id UUID PRIMARY KEY,
  tenant_id UUID NOT NULL REFERENCES tenant(id),
  invoice_id UUID NOT NULL,
  product_id UUID NULL,
  description TEXT NOT NULL,
  quantity NUMERIC(18,6) NOT NULL,
  unit_price_minor BIGINT NOT NULL,
  tax_rate_basis_points INTEGER NULL,
  line_subtotal_minor BIGINT NOT NULL,
  line_tax_minor BIGINT NOT NULL,
  line_total_minor BIGINT NOT NULL,
  currency CHAR(3) NOT NULL,
  sort_order INTEGER NOT NULL DEFAULT 0,
  metadata JSONB NOT NULL DEFAULT '{}'::jsonb,
  created_at TIMESTAMPTZ NOT NULL,
  updated_at TIMESTAMPTZ NOT NULL,
  UNIQUE (tenant_id, invoice_id, sort_order),
  FOREIGN KEY (tenant_id, invoice_id) REFERENCES invoice(tenant_id, id) ON DELETE CASCADE,
  FOREIGN KEY (tenant_id, product_id) REFERENCES product(tenant_id, id)
);

CREATE TABLE payment (
  id UUID PRIMARY KEY,
  tenant_id UUID NOT NULL REFERENCES tenant(id),
  customer_id UUID NOT NULL,
  payment_reference TEXT NULL,
  payment_method TEXT NOT NULL,
  payment_date DATE NOT NULL,
  currency CHAR(3) NOT NULL,
  amount_received_minor BIGINT NOT NULL,
  allocated_minor BIGINT NOT NULL DEFAULT 0,
  unallocated_minor BIGINT NOT NULL,
  status TEXT NOT NULL,
  metadata JSONB NOT NULL DEFAULT '{}'::jsonb,
  created_at TIMESTAMPTZ NOT NULL,
  updated_at TIMESTAMPTZ NOT NULL,
  UNIQUE (tenant_id, id),
  FOREIGN KEY (tenant_id, customer_id) REFERENCES customer(tenant_id, id),
  CHECK (amount_received_minor >= 0),
  CHECK (allocated_minor >= 0),
  CHECK (unallocated_minor >= 0)
);
CREATE UNIQUE INDEX uq_payment_reference
  ON payment (tenant_id, payment_reference)
  WHERE payment_reference IS NOT NULL;

CREATE TABLE payment_allocation (
  id UUID PRIMARY KEY,
  tenant_id UUID NOT NULL REFERENCES tenant(id),
  payment_id UUID NOT NULL,
  invoice_id UUID NOT NULL,
  allocated_minor BIGINT NOT NULL,
  allocation_date DATE NOT NULL,
  created_by_user_id UUID NULL,
  metadata JSONB NOT NULL DEFAULT '{}'::jsonb,
  created_at TIMESTAMPTZ NOT NULL,
  updated_at TIMESTAMPTZ NOT NULL,
  FOREIGN KEY (tenant_id, payment_id) REFERENCES payment(tenant_id, id),
  FOREIGN KEY (tenant_id, invoice_id) REFERENCES invoice(tenant_id, id),
  FOREIGN KEY (tenant_id, created_by_user_id) REFERENCES "user"(tenant_id, id),
  CHECK (allocated_minor > 0)
);

CREATE TABLE event_log (
  id UUID PRIMARY KEY,
  tenant_id UUID NOT NULL REFERENCES tenant(id),
  event_type TEXT NOT NULL,
  event_category TEXT NOT NULL,
  entity_type TEXT NOT NULL,
  entity_id UUID NOT NULL,
  actor_type TEXT NOT NULL,
  actor_id UUID NULL,
  occurred_at TIMESTAMPTZ NOT NULL,
  payload JSONB NOT NULL,
  correlation_id UUID NULL,
  idempotency_key TEXT NULL,
  created_at TIMESTAMPTZ NOT NULL,
  updated_at TIMESTAMPTZ NOT NULL,
  FOREIGN KEY (tenant_id, actor_id) REFERENCES "user"(tenant_id, id)
);
CREATE UNIQUE INDEX uq_event_idempotency
  ON event_log (tenant_id, idempotency_key)
  WHERE idempotency_key IS NOT NULL;

CREATE TABLE idempotency_key (
  id UUID PRIMARY KEY,
  tenant_id UUID NOT NULL REFERENCES tenant(id),
  method TEXT NOT NULL,
  path TEXT NOT NULL,
  idempotency_key TEXT NOT NULL,
  request_hash TEXT NOT NULL,
  response_status INTEGER NOT NULL,
  response_body JSONB NOT NULL,
  created_at TIMESTAMPTZ NOT NULL,
  expires_at TIMESTAMPTZ NOT NULL,
  UNIQUE (tenant_id, method, path, idempotency_key)
);

CREATE TABLE ledger_account (
  id UUID PRIMARY KEY,
  tenant_id UUID NOT NULL REFERENCES tenant(id),
  code TEXT NOT NULL,
  name TEXT NOT NULL,
  type TEXT NOT NULL,
  parent_id UUID NULL,
  created_at TIMESTAMPTZ NOT NULL,
  UNIQUE (tenant_id, id),
  UNIQUE (tenant_id, code),
  FOREIGN KEY (tenant_id, parent_id) REFERENCES ledger_account(tenant_id, id),
  CHECK (type IN ('asset', 'liability', 'equity', 'revenue', 'expense')),
  CHECK (parent_id IS NULL OR parent_id <> id)
);

CREATE TABLE journal_entry (
  id UUID PRIMARY KEY,
  tenant_id UUID NOT NULL REFERENCES tenant(id),
  source_event_id UUID NOT NULL,
  rule_version TEXT NOT NULL,
  status TEXT NOT NULL,
  currency CHAR(3) NOT NULL,
  entry_date DATE NOT NULL,
  posted_at TIMESTAMPTZ NULL,
  metadata JSONB NOT NULL DEFAULT '{}'::jsonb,
  created_at TIMESTAMPTZ NOT NULL,
  updated_at TIMESTAMPTZ NOT NULL,
  UNIQUE (tenant_id, source_event_id, rule_version)
);

CREATE TABLE journal_line (
  id UUID PRIMARY KEY,
  tenant_id UUID NOT NULL REFERENCES tenant(id),
  journal_entry_id UUID NOT NULL,
  account_code TEXT NOT NULL,
  direction TEXT NOT NULL,
  amount_minor BIGINT NOT NULL,
  description TEXT NULL,
  created_at TIMESTAMPTZ NOT NULL,
  updated_at TIMESTAMPTZ NOT NULL,
  FOREIGN KEY (tenant_id, journal_entry_id) REFERENCES journal_entry(tenant_id, id) ON DELETE CASCADE,
  FOREIGN KEY (tenant_id, account_code) REFERENCES ledger_account(tenant_id, code),
  CHECK (direction IN ('debit', 'credit')),
  CHECK (amount_minor > 0)
);

CREATE INDEX idx_invoice_tenant_status ON invoice (tenant_id, status);
CREATE INDEX idx_invoice_tenant_customer ON invoice (tenant_id, customer_id);
CREATE INDEX idx_invoice_line_tenant_invoice ON invoice_line (tenant_id, invoice_id);
CREATE INDEX idx_payment_tenant_status ON payment (tenant_id, status);
CREATE INDEX idx_payment_allocation_tenant_invoice ON payment_allocation (tenant_id, invoice_id);
CREATE INDEX idx_event_log_tenant_occurred ON event_log (tenant_id, occurred_at DESC);
CREATE INDEX idx_journal_entry_tenant_date ON journal_entry (tenant_id, entry_date DESC);
CREATE INDEX idx_ledger_account_tenant ON ledger_account (tenant_id);
CREATE INDEX idx_ledger_account_tenant_type ON ledger_account (tenant_id, type);
CREATE INDEX idx_ledger_account_tenant_parent ON ledger_account (tenant_id, parent_id);
CREATE INDEX idx_journal_line_tenant_entry ON journal_line (tenant_id, journal_entry_id);
CREATE INDEX idx_journal_line_tenant_account_entry ON journal_line (tenant_id, account_code, journal_entry_id);
