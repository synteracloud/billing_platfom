CREATE TABLE vendor (
  id UUID PRIMARY KEY,
  tenant_id UUID NOT NULL REFERENCES tenant(id),
  name TEXT NOT NULL,
  contact_name TEXT NULL,
  contact_email TEXT NULL,
  contact_phone TEXT NULL,
  currency_code CHAR(3) NOT NULL,
  status TEXT NOT NULL,
  metadata JSONB NULL,
  created_at TIMESTAMPTZ NOT NULL,
  updated_at TIMESTAMPTZ NOT NULL,
  deleted_at TIMESTAMPTZ NULL,
  UNIQUE (tenant_id, id),
  CHECK (char_length(trim(name)) > 0),
  CHECK (status IN ('active', 'inactive'))
);

CREATE INDEX idx_vendor_tenant_status ON vendor (tenant_id, status);
CREATE INDEX idx_vendor_tenant_name ON vendor (tenant_id, name);

ALTER TABLE bill
  ADD CONSTRAINT fk_bill_vendor_same_tenant
  FOREIGN KEY (tenant_id, vendor_id)
  REFERENCES vendor (tenant_id, id)
  ON UPDATE RESTRICT
  ON DELETE RESTRICT;
