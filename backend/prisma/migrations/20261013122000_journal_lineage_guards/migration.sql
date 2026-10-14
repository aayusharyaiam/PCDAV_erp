-- PL/pgSQL must resolve each trigger record shape in its own statement.
CREATE OR REPLACE FUNCTION check_journal_balance() RETURNS trigger AS $$
DECLARE target TEXT; n BIGINT; balance NUMERIC;
BEGIN
  IF TG_TABLE_NAME='JournalEntry' THEN target := NEW."id"; ELSE target := NEW."entryId"; END IF;
  SELECT count(*), coalesce(sum("debitMinor"::numeric-"creditMinor"::numeric),0) INTO n,balance FROM "JournalLine" WHERE "entryId"=target;
  IF n < 2 OR balance <> 0 THEN RAISE EXCEPTION 'Unbalanced journal entry %',target USING ERRCODE='23514'; END IF;
  RETURN NULL;
END; $$ LANGUAGE plpgsql;

-- Even balanced lines cannot be appended to an already-committed entry.
CREATE FUNCTION journal_line_same_transaction() RETURNS trigger AS $$
BEGIN
  IF NOT EXISTS (SELECT 1 FROM "JournalEntry" WHERE "id"=NEW."entryId" AND "schoolId"=NEW."schoolId" AND xmin::text=(pg_current_xact_id()::text)) THEN
    RAISE EXCEPTION 'Journal lines must be inserted with their original entry' USING ERRCODE='23514';
  END IF;
  RETURN NEW;
END; $$ LANGUAGE plpgsql;
CREATE TRIGGER "JournalLine_original_transaction" BEFORE INSERT ON "JournalLine" FOR EACH ROW EXECUTE FUNCTION journal_line_same_transaction();

CREATE FUNCTION check_credit_release_bound() RETURNS trigger AS $$
DECLARE total NUMERIC; original BIGINT;
BEGIN
  -- Lock serializes even callers using weaker transaction isolation.
  SELECT "amountMinor" INTO STRICT original FROM "FeeCreditAllocation" WHERE "id"=NEW."allocationId" AND "schoolId"=NEW."schoolId" FOR UPDATE;
  SELECT coalesce(sum("amountMinor"),0) INTO total FROM "FeeCreditAllocationRelease" WHERE "allocationId"=NEW."allocationId";
  IF total > original THEN RAISE EXCEPTION 'Credit releases exceed original allocation' USING ERRCODE='23514'; END IF;
  RETURN NULL;
END; $$ LANGUAGE plpgsql;
CREATE CONSTRAINT TRIGGER "FeeCreditAllocationRelease_bound" AFTER INSERT ON "FeeCreditAllocationRelease" DEFERRABLE INITIALLY DEFERRED FOR EACH ROW EXECUTE FUNCTION check_credit_release_bound();
