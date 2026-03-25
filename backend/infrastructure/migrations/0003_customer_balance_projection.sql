CREATE TABLE customer_balance (
  customer_id UUID NOT NULL,
  tenant_id UUID NOT NULL REFERENCES tenant(id),
  balance BIGINT NOT NULL,
  currency CHAR(3) NOT NULL,
  updated_at TIMESTAMPTZ NOT NULL DEFAULT NOW(),
  PRIMARY KEY (tenant_id, customer_id),
  FOREIGN KEY (tenant_id, customer_id) REFERENCES customer(tenant_id, id),
  CHECK (currency = UPPER(currency))
);

CREATE INDEX idx_customer_balance_tenant_currency ON customer_balance (tenant_id, currency);

CREATE OR REPLACE FUNCTION guard_customer_balance_manual_mutation()
RETURNS TRIGGER AS $$
BEGIN
  IF current_setting('app.customer_balance_derive', true) IS DISTINCT FROM 'on' THEN
    RAISE EXCEPTION 'customer_balance is a derived projection and cannot be manually mutated';
  END IF;

  RETURN CASE WHEN TG_OP = 'DELETE' THEN OLD ELSE NEW END;
END;
$$ LANGUAGE plpgsql;

CREATE TRIGGER customer_balance_guard_insert
BEFORE INSERT ON customer_balance
FOR EACH ROW
EXECUTE FUNCTION guard_customer_balance_manual_mutation();

CREATE TRIGGER customer_balance_guard_update
BEFORE UPDATE ON customer_balance
FOR EACH ROW
EXECUTE FUNCTION guard_customer_balance_manual_mutation();

CREATE TRIGGER customer_balance_guard_delete
BEFORE DELETE ON customer_balance
FOR EACH ROW
EXECUTE FUNCTION guard_customer_balance_manual_mutation();

CREATE OR REPLACE FUNCTION derive_customer_balance_from_ledger(p_tenant_id UUID, p_customer_id UUID)
RETURNS VOID AS $$
DECLARE
  v_balance BIGINT;
  v_currency CHAR(3);
BEGIN
  SELECT
    COALESCE(SUM(CASE
      WHEN le.debit IS NOT NULL THEN le.debit
      WHEN le.credit IS NOT NULL THEN -le.credit
      ELSE 0
    END), 0)::BIGINT,
    CASE
      WHEN COUNT(DISTINCT le.currency) = 0 THEN NULL
      WHEN COUNT(DISTINCT le.currency) = 1 THEN MIN(le.currency)
      ELSE 'MIX'
    END
  INTO v_balance, v_currency
  FROM ledger_entries le
  LEFT JOIN invoice i
    ON i.tenant_id = le.tenant_id
   AND le.reference_type = 'invoice'
   AND i.id = le.reference_id
  LEFT JOIN payment p
    ON p.tenant_id = le.tenant_id
   AND le.reference_type = 'payment'
   AND p.id = le.reference_id
  WHERE le.tenant_id = p_tenant_id
    AND le.account_id IN (
      SELECT id
      FROM ledger_account
      WHERE tenant_id = p_tenant_id
        AND code = '1100'
    )
    AND COALESCE(i.customer_id, p.customer_id) = p_customer_id;

  IF v_currency = 'MIX' THEN
    RAISE EXCEPTION 'customer_balance currency mismatch for tenant % customer %', p_tenant_id, p_customer_id;
  END IF;

  PERFORM set_config('app.customer_balance_derive', 'on', true);

  IF v_currency IS NULL THEN
    DELETE FROM customer_balance
    WHERE tenant_id = p_tenant_id
      AND customer_id = p_customer_id;
    RETURN;
  END IF;

  INSERT INTO customer_balance (customer_id, tenant_id, balance, currency, updated_at)
  VALUES (p_customer_id, p_tenant_id, v_balance, v_currency, NOW())
  ON CONFLICT (tenant_id, customer_id) DO UPDATE
  SET balance = EXCLUDED.balance,
      currency = EXCLUDED.currency,
      updated_at = EXCLUDED.updated_at;
END;
$$ LANGUAGE plpgsql;

CREATE OR REPLACE FUNCTION sync_customer_balance_on_ledger_entry_change()
RETURNS TRIGGER AS $$
DECLARE
  v_tenant_id UUID;
  v_customer_id UUID;
BEGIN
  v_tenant_id := COALESCE(NEW.tenant_id, OLD.tenant_id);

  IF COALESCE(NEW.reference_type, OLD.reference_type) = 'invoice' THEN
    SELECT customer_id INTO v_customer_id
    FROM invoice
    WHERE tenant_id = v_tenant_id
      AND id = COALESCE(NEW.reference_id, OLD.reference_id);
  ELSIF COALESCE(NEW.reference_type, OLD.reference_type) = 'payment' THEN
    SELECT customer_id INTO v_customer_id
    FROM payment
    WHERE tenant_id = v_tenant_id
      AND id = COALESCE(NEW.reference_id, OLD.reference_id);
  END IF;

  IF v_customer_id IS NULL THEN
    RETURN COALESCE(NEW, OLD);
  END IF;

  PERFORM derive_customer_balance_from_ledger(v_tenant_id, v_customer_id);

  RETURN COALESCE(NEW, OLD);
END;
$$ LANGUAGE plpgsql;

CREATE TRIGGER ledger_entries_customer_balance_projection
AFTER INSERT OR UPDATE OR DELETE ON ledger_entries
FOR EACH ROW
EXECUTE FUNCTION sync_customer_balance_on_ledger_entry_change();

CREATE OR REPLACE VIEW customer_balance_reconciliation_v AS
SELECT
  cb.tenant_id,
  cb.customer_id,
  cb.currency,
  cb.balance AS projected_balance,
  COALESCE(SUM(CASE
    WHEN le.debit IS NOT NULL THEN le.debit
    WHEN le.credit IS NOT NULL THEN -le.credit
    ELSE 0
  END), 0)::BIGINT AS ledger_ar_balance,
  cb.balance - COALESCE(SUM(CASE
    WHEN le.debit IS NOT NULL THEN le.debit
    WHEN le.credit IS NOT NULL THEN -le.credit
    ELSE 0
  END), 0)::BIGINT AS variance
FROM customer_balance cb
LEFT JOIN ledger_entries le
  ON le.tenant_id = cb.tenant_id
 AND le.account_id IN (
   SELECT id
   FROM ledger_account la
   WHERE la.tenant_id = cb.tenant_id
     AND la.code = '1100'
 )
LEFT JOIN invoice i
  ON i.tenant_id = le.tenant_id
 AND le.reference_type = 'invoice'
 AND i.id = le.reference_id
LEFT JOIN payment p
  ON p.tenant_id = le.tenant_id
 AND le.reference_type = 'payment'
 AND p.id = le.reference_id
WHERE cb.customer_id = COALESCE(i.customer_id, p.customer_id)
GROUP BY cb.tenant_id, cb.customer_id, cb.currency, cb.balance;
