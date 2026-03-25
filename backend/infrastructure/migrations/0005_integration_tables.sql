CREATE TABLE integration_accounts (
  id UUID PRIMARY KEY,
  tenant_id UUID NOT NULL REFERENCES tenant(id),
  provider TEXT NOT NULL,
  payload JSONB NOT NULL,
  raw_payload JSONB NOT NULL,
  normalized_payload JSONB NOT NULL,
  status TEXT NOT NULL,
  external_account_id TEXT NOT NULL,
  correlation_id UUID NULL,
  metadata JSONB NOT NULL DEFAULT '{}'::jsonb,
  created_at TIMESTAMPTZ NOT NULL,
  updated_at TIMESTAMPTZ NOT NULL,
  UNIQUE (tenant_id, id),
  UNIQUE (tenant_id, provider, external_account_id),
  CHECK (provider = lower(provider)),
  CHECK (status IN ('pending', 'active', 'disconnected', 'error')),
  CHECK (jsonb_typeof(payload) = 'object'),
  CHECK (jsonb_typeof(raw_payload) = 'object'),
  CHECK (jsonb_typeof(normalized_payload) = 'object')
);

CREATE INDEX idx_integration_accounts_tenant_provider
  ON integration_accounts (tenant_id, provider);
CREATE INDEX idx_integration_accounts_tenant_status
  ON integration_accounts (tenant_id, status);
CREATE INDEX idx_integration_accounts_created_at
  ON integration_accounts (created_at);

CREATE TABLE integration_events (
  id UUID PRIMARY KEY,
  tenant_id UUID NOT NULL REFERENCES tenant(id),
  provider TEXT NOT NULL,
  payload JSONB NOT NULL,
  raw_payload JSONB NOT NULL,
  normalized_payload JSONB NOT NULL,
  status TEXT NOT NULL,
  integration_account_id UUID NULL,
  provider_event_id TEXT NOT NULL,
  event_type TEXT NOT NULL,
  event_occurred_at TIMESTAMPTZ NULL,
  dedupe_key TEXT NULL,
  correlation_id UUID NULL,
  processing_error TEXT NULL,
  metadata JSONB NOT NULL DEFAULT '{}'::jsonb,
  created_at TIMESTAMPTZ NOT NULL,
  processed_at TIMESTAMPTZ NULL,
  FOREIGN KEY (tenant_id, integration_account_id) REFERENCES integration_accounts(tenant_id, id),
  UNIQUE (tenant_id, id),
  UNIQUE (tenant_id, provider, provider_event_id),
  CHECK (provider = lower(provider)),
  CHECK (status IN ('received', 'normalized', 'processed', 'failed', 'dead_lettered')),
  CHECK (jsonb_typeof(payload) = 'object'),
  CHECK (jsonb_typeof(raw_payload) = 'object'),
  CHECK (jsonb_typeof(normalized_payload) = 'object')
);

CREATE INDEX idx_integration_events_tenant_provider
  ON integration_events (tenant_id, provider);
CREATE INDEX idx_integration_events_tenant_status
  ON integration_events (tenant_id, status);
CREATE INDEX idx_integration_events_account
  ON integration_events (tenant_id, integration_account_id);
CREATE INDEX idx_integration_events_created_at
  ON integration_events (created_at);

CREATE TABLE webhook_receipts (
  id UUID PRIMARY KEY,
  tenant_id UUID NOT NULL REFERENCES tenant(id),
  provider TEXT NOT NULL,
  payload JSONB NOT NULL,
  raw_payload JSONB NOT NULL,
  normalized_payload JSONB NOT NULL,
  status TEXT NOT NULL,
  integration_event_id UUID NULL,
  webhook_id TEXT NULL,
  endpoint_path TEXT NOT NULL,
  http_method TEXT NOT NULL,
  request_headers JSONB NOT NULL,
  signature TEXT NULL,
  signature_valid BOOLEAN NULL,
  received_at TIMESTAMPTZ NOT NULL,
  acknowledged_at TIMESTAMPTZ NULL,
  correlation_id UUID NULL,
  metadata JSONB NOT NULL DEFAULT '{}'::jsonb,
  created_at TIMESTAMPTZ NOT NULL,
  UNIQUE (tenant_id, id),
  FOREIGN KEY (tenant_id, integration_event_id) REFERENCES integration_events(tenant_id, id),
  CHECK (provider = lower(provider)),
  CHECK (status IN ('received', 'validated', 'rejected', 'processed')),
  CHECK (jsonb_typeof(payload) = 'object'),
  CHECK (jsonb_typeof(raw_payload) = 'object'),
  CHECK (jsonb_typeof(normalized_payload) = 'object'),
  CHECK (jsonb_typeof(request_headers) = 'object')
);

CREATE INDEX idx_webhook_receipts_tenant_provider
  ON webhook_receipts (tenant_id, provider);
CREATE INDEX idx_webhook_receipts_tenant_status
  ON webhook_receipts (tenant_id, status);
CREATE INDEX idx_webhook_receipts_event
  ON webhook_receipts (tenant_id, integration_event_id);
CREATE INDEX idx_webhook_receipts_received_at
  ON webhook_receipts (received_at);
