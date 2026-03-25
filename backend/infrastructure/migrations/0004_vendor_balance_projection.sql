CREATE TABLE vendor_balance (
  vendor_id UUID NOT NULL,
  tenant_id UUID NOT NULL REFERENCES tenant(id),
  balance BIGINT NOT NULL,
  currency CHAR(3) NOT NULL,
  updated_at TIMESTAMPTZ NOT NULL DEFAULT NOW(),
  PRIMARY KEY (tenant_id, vendor_id),
  CHECK (currency = UPPER(currency))
);

CREATE INDEX idx_vendor_balance_tenant_currency ON vendor_balance (tenant_id, currency);

CREATE OR REPLACE FUNCTION guard_vendor_balance_manual_mutation()
RETURNS TRIGGER AS $$
BEGIN
  IF current_setting('app.vendor_balance_derive', true) IS DISTINCT FROM 'on' THEN
    RAISE EXCEPTION 'vendor_balance is a derived projection and cannot be manually mutated';
  END IF;

  RETURN CASE WHEN TG_OP = 'DELETE' THEN OLD ELSE NEW END;
END;
$$ LANGUAGE plpgsql;

CREATE TRIGGER vendor_balance_guard_insert
BEFORE INSERT ON vendor_balance
FOR EACH ROW
EXECUTE FUNCTION guard_vendor_balance_manual_mutation();

CREATE TRIGGER vendor_balance_guard_update
BEFORE UPDATE ON vendor_balance
FOR EACH ROW
EXECUTE FUNCTION guard_vendor_balance_manual_mutation();

CREATE TRIGGER vendor_balance_guard_delete
BEFORE DELETE ON vendor_balance
FOR EACH ROW
EXECUTE FUNCTION guard_vendor_balance_manual_mutation();

CREATE OR REPLACE FUNCTION resolve_vendor_from_reference(
  p_tenant_id UUID,
  p_reference_type TEXT,
  p_reference_id UUID
)
RETURNS UUID AS $$
DECLARE
  v_vendor_id UUID;
BEGIN
  IF p_reference_type NOT IN ('bill', 'payment') THEN
    RETURN NULL;
  END IF;

  SELECT NULLIF(event_log.payload ->> 'vendor_id', '')::UUID
  INTO v_vendor_id
  FROM event_log
  WHERE event_log.tenant_id = p_tenant_id
    AND event_log.entity_type = p_reference_type
    AND event_log.entity_id = p_reference_id
    AND event_log.payload ? 'vendor_id'
  ORDER BY event_log.occurred_at DESC, event_log.created_at DESC
  LIMIT 1;

  RETURN v_vendor_id;
END;
$$ LANGUAGE plpgsql STABLE;

CREATE OR REPLACE FUNCTION derive_vendor_balance_from_ledger(p_tenant_id UUID, p_vendor_id UUID)
RETURNS VOID AS $$
DECLARE
  v_balance BIGINT;
  v_currency CHAR(3);
BEGIN
  WITH vendor_refs AS (
    SELECT DISTINCT
      le.tenant_id,
      le.reference_type,
      le.reference_id,
      resolve_vendor_from_reference(le.tenant_id, le.reference_type, le.reference_id) AS vendor_id
    FROM ledger_entries le
    WHERE le.tenant_id = p_tenant_id
      AND le.reference_type IN ('bill', 'payment')
  )
  SELECT
    COALESCE(SUM(CASE
      WHEN le.credit IS NOT NULL THEN le.credit
      WHEN le.debit IS NOT NULL THEN -le.debit
      ELSE 0
    END), 0)::BIGINT,
    CASE
      WHEN COUNT(DISTINCT le.currency) = 0 THEN NULL
      WHEN COUNT(DISTINCT le.currency) = 1 THEN MIN(le.currency)
      ELSE 'MIX'
    END
  INTO v_balance, v_currency
  FROM ledger_entries le
  JOIN vendor_refs vr
    ON vr.tenant_id = le.tenant_id
   AND vr.reference_type = le.reference_type
   AND vr.reference_id = le.reference_id
  WHERE le.tenant_id = p_tenant_id
    AND vr.vendor_id = p_vendor_id
    AND le.account_id IN (
      SELECT id
      FROM ledger_account
      WHERE tenant_id = p_tenant_id
        AND code = '2000'
    );

  IF v_currency = 'MIX' THEN
    RAISE EXCEPTION 'vendor_balance currency mismatch for tenant % vendor %', p_tenant_id, p_vendor_id;
  END IF;

  PERFORM set_config('app.vendor_balance_derive', 'on', true);

  IF v_currency IS NULL THEN
    DELETE FROM vendor_balance
    WHERE tenant_id = p_tenant_id
      AND vendor_id = p_vendor_id;
    RETURN;
  END IF;

  INSERT INTO vendor_balance (vendor_id, tenant_id, balance, currency, updated_at)
  VALUES (p_vendor_id, p_tenant_id, v_balance, v_currency, NOW())
  ON CONFLICT (tenant_id, vendor_id) DO UPDATE
  SET balance = EXCLUDED.balance,
      currency = EXCLUDED.currency,
      updated_at = EXCLUDED.updated_at;
END;
$$ LANGUAGE plpgsql;

CREATE OR REPLACE FUNCTION sync_vendor_balance_on_ledger_entry_change()
RETURNS TRIGGER AS $$
DECLARE
  v_tenant_id UUID;
  v_vendor_id UUID;
BEGIN
  v_tenant_id := COALESCE(NEW.tenant_id, OLD.tenant_id);

  v_vendor_id := resolve_vendor_from_reference(
    v_tenant_id,
    COALESCE(NEW.reference_type, OLD.reference_type),
    COALESCE(NEW.reference_id, OLD.reference_id)
  );

  IF v_vendor_id IS NULL THEN
    RETURN COALESCE(NEW, OLD);
  END IF;

  PERFORM derive_vendor_balance_from_ledger(v_tenant_id, v_vendor_id);

  RETURN COALESCE(NEW, OLD);
END;
$$ LANGUAGE plpgsql;

CREATE TRIGGER ledger_entries_vendor_balance_projection
AFTER INSERT OR UPDATE OR DELETE ON ledger_entries
FOR EACH ROW
EXECUTE FUNCTION sync_vendor_balance_on_ledger_entry_change();

CREATE OR REPLACE FUNCTION sync_vendor_balance_on_vendor_event()
RETURNS TRIGGER AS $$
DECLARE
  v_vendor_id UUID;
BEGIN
  IF COALESCE(NEW.entity_type, OLD.entity_type) NOT IN ('bill', 'payment') THEN
    RETURN COALESCE(NEW, OLD);
  END IF;

  v_vendor_id := NULLIF(COALESCE(NEW.payload, OLD.payload) ->> 'vendor_id', '')::UUID;
  IF v_vendor_id IS NULL THEN
    RETURN COALESCE(NEW, OLD);
  END IF;

  PERFORM derive_vendor_balance_from_ledger(COALESCE(NEW.tenant_id, OLD.tenant_id), v_vendor_id);

  RETURN COALESCE(NEW, OLD);
END;
$$ LANGUAGE plpgsql;

CREATE TRIGGER event_log_vendor_balance_projection
AFTER INSERT OR UPDATE ON event_log
FOR EACH ROW
EXECUTE FUNCTION sync_vendor_balance_on_vendor_event();

CREATE OR REPLACE VIEW vendor_balance_reconciliation_v AS
WITH vendor_refs AS (
  SELECT DISTINCT
    le.tenant_id,
    le.reference_type,
    le.reference_id,
    resolve_vendor_from_reference(le.tenant_id, le.reference_type, le.reference_id) AS vendor_id
  FROM ledger_entries le
  WHERE le.reference_type IN ('bill', 'payment')
)
SELECT
  vb.tenant_id,
  vb.vendor_id,
  vb.currency,
  vb.balance AS projected_balance,
  COALESCE(SUM(CASE
    WHEN le.credit IS NOT NULL THEN le.credit
    WHEN le.debit IS NOT NULL THEN -le.debit
    ELSE 0
  END), 0)::BIGINT AS ledger_ap_balance,
  vb.balance - COALESCE(SUM(CASE
    WHEN le.credit IS NOT NULL THEN le.credit
    WHEN le.debit IS NOT NULL THEN -le.debit
    ELSE 0
  END), 0)::BIGINT AS variance
FROM vendor_balance vb
LEFT JOIN vendor_refs vr
  ON vr.tenant_id = vb.tenant_id
 AND vr.vendor_id = vb.vendor_id
LEFT JOIN ledger_entries le
  ON le.tenant_id = vr.tenant_id
 AND le.reference_type = vr.reference_type
 AND le.reference_id = vr.reference_id
 AND le.account_id IN (
   SELECT id
   FROM ledger_account la
   WHERE la.tenant_id = vb.tenant_id
     AND la.code = '2000'
 )
GROUP BY vb.tenant_id, vb.vendor_id, vb.currency, vb.balance;
