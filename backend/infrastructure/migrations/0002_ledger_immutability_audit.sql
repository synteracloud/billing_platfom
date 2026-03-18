CREATE EXTENSION IF NOT EXISTS pgcrypto;

ALTER TABLE journal_entry
  ADD COLUMN reversal_of_journal_entry_id UUID NULL,
  ADD COLUMN reversal_reason TEXT NULL,
  ADD CONSTRAINT fk_journal_entry_reversal
    FOREIGN KEY (tenant_id, reversal_of_journal_entry_id)
    REFERENCES journal_entry(tenant_id, id),
  ADD CONSTRAINT chk_journal_entry_reversal_reason
    CHECK (
      (reversal_of_journal_entry_id IS NULL AND reversal_reason IS NULL)
      OR reversal_of_journal_entry_id IS NOT NULL
    ),
  ADD CONSTRAINT chk_journal_entry_not_self_reversal
    CHECK (reversal_of_journal_entry_id IS NULL OR reversal_of_journal_entry_id <> id);

CREATE UNIQUE INDEX uq_journal_entry_single_reversal
  ON journal_entry (tenant_id, reversal_of_journal_entry_id)
  WHERE reversal_of_journal_entry_id IS NOT NULL;

CREATE OR REPLACE FUNCTION raise_immutable_financial_record()
RETURNS trigger
LANGUAGE plpgsql
AS $$
BEGIN
  RAISE EXCEPTION '% is immutable; use a reversal entry instead', TG_TABLE_NAME;
END;
$$;

CREATE TRIGGER trg_journal_entry_no_update
BEFORE UPDATE ON journal_entry
FOR EACH ROW
EXECUTE FUNCTION raise_immutable_financial_record();

CREATE TRIGGER trg_journal_entry_no_delete
BEFORE DELETE ON journal_entry
FOR EACH ROW
EXECUTE FUNCTION raise_immutable_financial_record();

CREATE TRIGGER trg_journal_line_no_update
BEFORE UPDATE ON journal_line
FOR EACH ROW
EXECUTE FUNCTION raise_immutable_financial_record();

CREATE TRIGGER trg_journal_line_no_delete
BEFORE DELETE ON journal_line
FOR EACH ROW
EXECUTE FUNCTION raise_immutable_financial_record();

CREATE TRIGGER trg_event_log_no_update
BEFORE UPDATE ON event_log
FOR EACH ROW
EXECUTE FUNCTION raise_immutable_financial_record();

CREATE TRIGGER trg_event_log_no_delete
BEFORE DELETE ON event_log
FOR EACH ROW
EXECUTE FUNCTION raise_immutable_financial_record();

CREATE OR REPLACE FUNCTION validate_journal_reversal()
RETURNS trigger
LANGUAGE plpgsql
AS $$
DECLARE
  original_entry journal_entry%ROWTYPE;
BEGIN
  IF NEW.reversal_of_journal_entry_id IS NULL THEN
    RETURN NEW;
  END IF;

  SELECT *
    INTO original_entry
    FROM journal_entry
   WHERE tenant_id = NEW.tenant_id
     AND id = NEW.reversal_of_journal_entry_id;

  IF NOT FOUND THEN
    RAISE EXCEPTION 'reversal target % does not exist for tenant %', NEW.reversal_of_journal_entry_id, NEW.tenant_id;
  END IF;

  IF original_entry.currency <> NEW.currency THEN
    RAISE EXCEPTION 'reversal entry currency % must match original currency %', NEW.currency, original_entry.currency;
  END IF;

  IF NEW.source_event_id = original_entry.source_event_id THEN
    RAISE EXCEPTION 'reversal entry must reference a distinct source_event_id';
  END IF;

  RETURN NEW;
END;
$$;

CREATE TRIGGER trg_validate_journal_reversal
BEFORE INSERT ON journal_entry
FOR EACH ROW
EXECUTE FUNCTION validate_journal_reversal();

CREATE OR REPLACE FUNCTION record_journal_posting_audit()
RETURNS trigger
LANGUAGE plpgsql
AS $$
DECLARE
  line_count INTEGER;
  correlation_key TEXT;
BEGIN
  SELECT COUNT(*)
    INTO line_count
    FROM journal_line
   WHERE tenant_id = NEW.tenant_id
     AND journal_entry_id = NEW.id;

  IF line_count = 0 THEN
    RAISE EXCEPTION 'journal_entry % must have journal_line rows before commit', NEW.id;
  END IF;

  correlation_key := 'journal-entry:' || NEW.id::text;

  INSERT INTO event_log (
    id,
    tenant_id,
    event_type,
    event_category,
    entity_type,
    entity_id,
    actor_type,
    actor_id,
    occurred_at,
    payload,
    correlation_id,
    idempotency_key,
    created_at,
    updated_at
  ) VALUES (
    gen_random_uuid(),
    NEW.tenant_id,
    'accounting.journal.posted.v1',
    'financial',
    'journal_entry',
    NEW.id,
    'system',
    NULL,
    COALESCE(NEW.posted_at, NEW.created_at),
    jsonb_build_object(
      'journal_entry_id', NEW.id,
      'source_type', CASE WHEN NEW.reversal_of_journal_entry_id IS NULL THEN 'domain_event' ELSE 'journal_reversal' END,
      'source_id', COALESCE(NEW.reversal_of_journal_entry_id, NEW.source_event_id),
      'source_event_id', NEW.source_event_id,
      'currency_code', NEW.currency,
      'line_count', line_count,
      'reversal_of_journal_entry_id', NEW.reversal_of_journal_entry_id,
      'reversal_reason', NEW.reversal_reason
    ),
    NULL,
    correlation_key || ':posted',
    NEW.created_at,
    NEW.created_at
  );

  IF NEW.reversal_of_journal_entry_id IS NOT NULL THEN
    INSERT INTO event_log (
      id,
      tenant_id,
      event_type,
      event_category,
      entity_type,
      entity_id,
      actor_type,
      actor_id,
      occurred_at,
      payload,
      correlation_id,
      idempotency_key,
      created_at,
      updated_at
    ) VALUES (
      gen_random_uuid(),
      NEW.tenant_id,
      'accounting.journal.reversed.v1',
      'audit',
      'journal_entry',
      NEW.reversal_of_journal_entry_id,
      'system',
      NULL,
      COALESCE(NEW.posted_at, NEW.created_at),
      jsonb_build_object(
        'journal_entry_id', NEW.reversal_of_journal_entry_id,
        'reversed_by_journal_entry_id', NEW.id,
        'reason', NEW.reversal_reason
      ),
      NULL,
      correlation_key || ':reversed',
      NEW.created_at,
      NEW.created_at
    );
  END IF;

  RETURN NULL;
END;
$$;

CREATE CONSTRAINT TRIGGER trg_record_journal_posting_audit
AFTER INSERT ON journal_entry
DEFERRABLE INITIALLY DEFERRED
FOR EACH ROW
EXECUTE FUNCTION record_journal_posting_audit();
