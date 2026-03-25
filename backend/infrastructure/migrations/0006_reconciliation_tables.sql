CREATE TABLE reconciliations (
  id UUID PRIMARY KEY,
  tenant_id UUID NOT NULL REFERENCES tenant(id),
  status TEXT NOT NULL,
  run_id UUID NOT NULL,
  rule_version TEXT NOT NULL,
  as_of_window TSTZRANGE NOT NULL,
  created_at TIMESTAMPTZ NOT NULL,
  metadata JSONB NOT NULL DEFAULT '{}'::jsonb,
  UNIQUE (tenant_id, id),
  CHECK (status IN ('matched', 'unmatched', 'manual')),
  CHECK (jsonb_typeof(metadata) = 'object')
);

CREATE INDEX idx_reconciliations_tenant_status
  ON reconciliations (tenant_id, status);
CREATE INDEX idx_reconciliations_tenant_run_id
  ON reconciliations (tenant_id, run_id);
CREATE INDEX idx_reconciliations_created_at
  ON reconciliations (created_at);

CREATE TABLE reconciliation_matches (
  id UUID PRIMARY KEY,
  tenant_id UUID NOT NULL REFERENCES tenant(id),
  reconciliation_id UUID NOT NULL,
  source_type TEXT NOT NULL,
  source_id TEXT NOT NULL,
  target_type TEXT NOT NULL,
  target_id TEXT NOT NULL,
  status TEXT NOT NULL,
  confidence_score NUMERIC(5,4) NOT NULL,
  created_at TIMESTAMPTZ NOT NULL,
  metadata JSONB NOT NULL DEFAULT '{}'::jsonb,
  source_ref TEXT GENERATED ALWAYS AS (source_type || ':' || source_id) STORED,
  target_ref TEXT GENERATED ALWAYS AS (target_type || ':' || target_id) STORED,
  FOREIGN KEY (tenant_id, reconciliation_id) REFERENCES reconciliations(tenant_id, id) ON DELETE CASCADE,
  UNIQUE (tenant_id, id),
  CHECK (source_type IN ('invoice', 'payment', 'bank')),
  CHECK (target_type IN ('invoice', 'payment', 'bank')),
  CHECK (source_type <> target_type),
  CHECK (
    (source_type = 'invoice' AND target_type IN ('payment', 'bank')) OR
    (source_type = 'payment' AND target_type IN ('invoice', 'bank')) OR
    (source_type = 'bank' AND target_type IN ('invoice', 'payment'))
  ),
  CHECK (status IN ('matched', 'unmatched', 'manual')),
  CHECK (confidence_score >= 0 AND confidence_score <= 1),
  CHECK (length(trim(source_id)) > 0),
  CHECK (length(trim(target_id)) > 0),
  CHECK (jsonb_typeof(metadata) = 'object')
);

CREATE INDEX idx_reconciliation_matches_reconciliation
  ON reconciliation_matches (tenant_id, reconciliation_id, created_at);
CREATE INDEX idx_reconciliation_matches_source
  ON reconciliation_matches (tenant_id, source_type, source_id);
CREATE INDEX idx_reconciliation_matches_target
  ON reconciliation_matches (tenant_id, target_type, target_id);
CREATE INDEX idx_reconciliation_matches_status
  ON reconciliation_matches (tenant_id, status);
CREATE INDEX idx_reconciliation_matches_source_ref
  ON reconciliation_matches (tenant_id, source_ref);
CREATE INDEX idx_reconciliation_matches_target_ref
  ON reconciliation_matches (tenant_id, target_ref);
