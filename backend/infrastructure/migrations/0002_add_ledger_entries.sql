CREATE TABLE ledger_account (
  id UUID PRIMARY KEY,
  tenant_id UUID NOT NULL REFERENCES tenant(id),
  code TEXT NOT NULL,
  name TEXT NOT NULL,
  account_type TEXT NOT NULL,
  currency CHAR(3) NOT NULL,
  is_active BOOLEAN NOT NULL DEFAULT TRUE,
  created_at TIMESTAMPTZ NOT NULL,
  updated_at TIMESTAMPTZ NOT NULL,
  UNIQUE (tenant_id, id),
  UNIQUE (tenant_id, code),
  UNIQUE (tenant_id, id, currency)
);

CREATE TABLE ledger_entries (
  id UUID PRIMARY KEY,
  tenant_id UUID NOT NULL REFERENCES tenant(id),
  account_id UUID NOT NULL,
  debit BIGINT NULL,
  credit BIGINT NULL,
  currency CHAR(3) NOT NULL,
  reference_type TEXT NOT NULL,
  reference_id UUID NOT NULL,
  created_at TIMESTAMPTZ NOT NULL DEFAULT NOW(),
  CONSTRAINT ck_ledger_entries_single_sided
    CHECK (num_nonnulls(debit, credit) = 1),
  CONSTRAINT ck_ledger_entries_positive_amount
    CHECK ((debit IS NULL OR debit > 0) AND (credit IS NULL OR credit > 0)),
  FOREIGN KEY (tenant_id, account_id) REFERENCES ledger_account(tenant_id, id),
  FOREIGN KEY (tenant_id, account_id, currency) REFERENCES ledger_account(tenant_id, id, currency)
);

CREATE INDEX idx_ledger_account_tenant_type ON ledger_account (tenant_id, account_type);
CREATE INDEX idx_ledger_entries_tenant_account_created ON ledger_entries (tenant_id, account_id, created_at DESC);
CREATE INDEX idx_ledger_entries_tenant_reference ON ledger_entries (tenant_id, reference_type, reference_id);

CREATE OR REPLACE FUNCTION prevent_ledger_entries_mutation()
RETURNS TRIGGER AS $$
BEGIN
  RAISE EXCEPTION 'ledger_entries are immutable after creation';
END;
$$ LANGUAGE plpgsql;

CREATE TRIGGER ledger_entries_immutable_update
BEFORE UPDATE ON ledger_entries
FOR EACH ROW
EXECUTE FUNCTION prevent_ledger_entries_mutation();

CREATE TRIGGER ledger_entries_immutable_delete
BEFORE DELETE ON ledger_entries
FOR EACH ROW
EXECUTE FUNCTION prevent_ledger_entries_mutation();
