CREATE TABLE bill (
  id UUID PRIMARY KEY,
  tenant_id UUID NOT NULL REFERENCES tenant(id),
  vendor_id UUID NOT NULL,
  total_amount BIGINT NOT NULL,
  currency CHAR(3) NOT NULL,
  status TEXT NOT NULL,
  issued_at TIMESTAMPTZ NULL,
  due_at TIMESTAMPTZ NULL,
  created_at TIMESTAMPTZ NOT NULL,
  UNIQUE (tenant_id, id),
  CHECK (total_amount >= 0),
  CHECK (status IN ('draft', 'issued', 'approved', 'due', 'partially_paid', 'paid', 'void')),
  CHECK (
    (status = 'draft' AND issued_at IS NULL)
    OR (status <> 'draft')
  ),
  CHECK (
    due_at IS NULL
    OR issued_at IS NULL
    OR due_at >= issued_at
  )
);

CREATE INDEX idx_bill_tenant_status ON bill (tenant_id, status);
CREATE INDEX idx_bill_tenant_vendor ON bill (tenant_id, vendor_id);
CREATE INDEX idx_bill_tenant_due_at ON bill (tenant_id, due_at);
