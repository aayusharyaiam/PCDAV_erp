-- All operational financial writes emit journal entries in the same transaction.
-- Balance is checked at COMMIT (including an entry inserted without any lines).
CREATE TABLE "JournalEntry" (
  "id" TEXT PRIMARY KEY, "schoolId" TEXT NOT NULL, "businessDate" DATE NOT NULL,
  "sourceType" TEXT NOT NULL, "sourceId" TEXT NOT NULL, "description" TEXT NOT NULL,
  "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP
);
CREATE UNIQUE INDEX "JournalEntry_id_schoolId_key" ON "JournalEntry"("id","schoolId");
CREATE INDEX "JournalEntry_schoolId_businessDate_idx" ON "JournalEntry"("schoolId","businessDate");
CREATE INDEX "JournalEntry_schoolId_sourceType_sourceId_idx" ON "JournalEntry"("schoolId","sourceType","sourceId");
CREATE TABLE "JournalLine" (
  "id" TEXT PRIMARY KEY, "schoolId" TEXT NOT NULL, "entryId" TEXT NOT NULL,
  "account" TEXT NOT NULL, "studentId" TEXT, "debitMinor" BIGINT NOT NULL DEFAULT 0, "creditMinor" BIGINT NOT NULL DEFAULT 0,
  CHECK (("debitMinor" > 0 AND "creditMinor"=0) OR ("creditMinor" > 0 AND "debitMinor"=0)),
  CONSTRAINT "JournalLine_entryId_schoolId_fkey" FOREIGN KEY ("entryId","schoolId") REFERENCES "JournalEntry"("id","schoolId") ON DELETE RESTRICT ON UPDATE CASCADE
);
CREATE INDEX "JournalLine_schoolId_studentId_account_idx" ON "JournalLine"("schoolId","studentId","account");
CREATE INDEX "JournalLine_entryId_idx" ON "JournalLine"("entryId");

CREATE FUNCTION check_journal_balance() RETURNS trigger AS $$
DECLARE target TEXT; n BIGINT; balance NUMERIC;
BEGIN
  IF TG_TABLE_NAME='JournalEntry' THEN target := NEW."id"; ELSE target := NEW."entryId"; END IF;
  SELECT count(*), coalesce(sum("debitMinor"::numeric-"creditMinor"::numeric),0) INTO n,balance FROM "JournalLine" WHERE "entryId"=target;
  IF n < 2 OR balance <> 0 THEN RAISE EXCEPTION 'Unbalanced journal entry %',target USING ERRCODE='23514'; END IF;
  RETURN NULL;
END; $$ LANGUAGE plpgsql;
CREATE CONSTRAINT TRIGGER "JournalEntry_balanced" AFTER INSERT ON "JournalEntry" DEFERRABLE INITIALLY DEFERRED FOR EACH ROW EXECUTE FUNCTION check_journal_balance();
CREATE CONSTRAINT TRIGGER "JournalLine_balanced" AFTER INSERT ON "JournalLine" DEFERRABLE INITIALLY DEFERRED FOR EACH ROW EXECUTE FUNCTION check_journal_balance();
CREATE TRIGGER "JournalEntry_immutable" BEFORE UPDATE OR DELETE ON "JournalEntry" FOR EACH ROW EXECUTE FUNCTION finance_immutable();
CREATE TRIGGER "JournalLine_immutable" BEFORE UPDATE OR DELETE ON "JournalLine" FOR EACH ROW EXECUTE FUNCTION finance_immutable();

CREATE FUNCTION journal_pair(school TEXT, student TEXT, day DATE, kind TEXT, source TEXT, description TEXT, debit TEXT, credit TEXT, amount BIGINT) RETURNS void AS $$
DECLARE entry TEXT;
BEGIN
  IF amount=0 THEN RETURN; END IF;
  IF amount < 0 THEN PERFORM journal_pair(school,student,day,kind,source,description,credit,debit,-amount); RETURN; END IF;
  entry := gen_random_uuid()::text;
  INSERT INTO "JournalEntry" ("id","schoolId","businessDate","sourceType","sourceId","description") VALUES (entry,school,day,kind,source,description);
  INSERT INTO "JournalLine" ("id","schoolId","entryId","account","studentId","debitMinor","creditMinor") VALUES
    (gen_random_uuid()::text,school,entry,debit,student,amount,0), (gen_random_uuid()::text,school,entry,credit,student,0,amount);
END; $$ LANGUAGE plpgsql;

-- A cutover snapshot, not fabricated past revenue/capture events. Each balance
-- retains its actual source ID. Pending cheques contribute no settled assets.
SELECT journal_pair("schoolId","studentId",CURRENT_DATE,'OPENING_FEE_RECEIVABLE',"id",'Existing current fee balance at journal cutover','FEE_RECEIVABLE','OPENING_EQUITY',"amountMinor"-"paidMinor"-"creditAppliedMinor") FROM "FeeObligation";
SELECT journal_pair("schoolId","studentId",CURRENT_DATE,'OPENING_STORE_RECEIVABLE',"id",'Existing current store balance at journal cutover','STORE_RECEIVABLE','OPENING_EQUITY',"totalMinor"-"paidMinor") FROM "StoreIssue" WHERE "status" <> 'VOID';
SELECT journal_pair("schoolId","studentId",CURRENT_DATE,'OPENING_STUDENT_CREDIT',"id",'Existing unused student credit at journal cutover','OPENING_EQUITY','STUDENT_CREDIT',"remainingMinor") FROM "FeeCredit";
SELECT journal_pair(p."schoolId",p."studentId",CURRENT_DATE,'OPENING_PAYMENT_ASSET',p."id",'Existing net recorded funds at journal cutover; not bank settlement',CASE WHEN p."mode"='CASH' THEN 'CASH' ELSE 'BANK_CLEARING' END,'OPENING_EQUITY',
 p."receivedAmountMinor"-coalesce((SELECT sum(r."amountMinor") FROM "PaymentRefund" r WHERE r."paymentId"=p."id"),0)::bigint)
FROM "Payment" p WHERE p."status" IN ('CAPTURED','CLEARED','PARTIALLY_REFUNDED','REFUNDED','REVERSED');
SELECT journal_pair("schoolId",NULL,CURRENT_DATE,'OPENING_SHIFT_FLOAT',"id",'Existing recorded float at journal cutover','CASH','OPENING_EQUITY',"openingFloatMinor") FROM "CashierShift";

CREATE FUNCTION finance_event_date(school TEXT) RETURNS date AS $$
  SELECT coalesce(nullif(current_setting('app.finance_date',true),'')::date, (CURRENT_TIMESTAMP AT TIME ZONE coalesce((SELECT "timezone" FROM "School" WHERE "id"=school),'Asia/Kolkata'))::date);
$$ LANGUAGE sql STABLE;

CREATE FUNCTION journal_fee() RETURNS trigger AS $$
DECLARE assessed BIGINT; settled BIGINT;
BEGIN
  assessed := CASE WHEN TG_OP='INSERT' THEN NEW."amountMinor" ELSE NEW."amountMinor"-OLD."amountMinor" END;
  settled := NEW."paidMinor"+NEW."creditAppliedMinor" - CASE WHEN TG_OP='INSERT' THEN 0 ELSE OLD."paidMinor"+OLD."creditAppliedMinor" END;
  PERFORM journal_pair(NEW."schoolId",NEW."studentId",finance_event_date(NEW."schoolId"),'FEE_ASSESSMENT',NEW."id",'Assessed fee; head '||NEW."feeHeadId",'FEE_RECEIVABLE','FEE_INCOME:'||NEW."feeHeadId",assessed);
  PERFORM journal_pair(NEW."schoolId",NEW."studentId",finance_event_date(NEW."schoolId"),CASE WHEN settled >= 0 THEN 'FEE_ALLOCATION' ELSE 'FEE_RELEASE' END,NEW."id",'Fee allocation or traced release','STUDENT_CREDIT','FEE_RECEIVABLE',settled);
  RETURN NEW;
END; $$ LANGUAGE plpgsql;
CREATE TRIGGER "FeeObligation_journal" AFTER INSERT OR UPDATE ON "FeeObligation" FOR EACH ROW EXECUTE FUNCTION journal_fee();

CREATE FUNCTION journal_store() RETURNS trigger AS $$
DECLARE assessed BIGINT; settled BIGINT;
BEGIN
  assessed := CASE WHEN NEW."status"='VOID' THEN 0 ELSE NEW."totalMinor" END - CASE WHEN TG_OP='INSERT' THEN 0 WHEN OLD."status"='VOID' THEN 0 ELSE OLD."totalMinor" END;
  settled := NEW."paidMinor" - CASE WHEN TG_OP='INSERT' THEN 0 ELSE OLD."paidMinor" END;
  PERFORM journal_pair(NEW."schoolId",NEW."studentId",CASE WHEN TG_OP='INSERT' THEN NEW."issuedAt" ELSE finance_event_date(NEW."schoolId") END,'STORE_ISSUE',NEW."id",'Store assessment or cancellation','STORE_RECEIVABLE','STORE_INCOME',assessed);
  PERFORM journal_pair(NEW."schoolId",NEW."studentId",finance_event_date(NEW."schoolId"),CASE WHEN settled >= 0 THEN 'STORE_ALLOCATION' ELSE 'STORE_RELEASE' END,NEW."id",'Store allocation or release','STUDENT_CREDIT','STORE_RECEIVABLE',settled);
  RETURN NEW;
END; $$ LANGUAGE plpgsql;
CREATE TRIGGER "StoreIssue_journal" AFTER INSERT OR UPDATE ON "StoreIssue" FOR EACH ROW EXECUTE FUNCTION journal_store();

CREATE FUNCTION journal_credit_grant() RETURNS trigger AS $$
BEGIN
  IF NEW."sourcePaymentId" IS NULL THEN
    PERFORM journal_pair(NEW."schoolId",NEW."studentId",finance_event_date(NEW."schoolId"),'CREDIT_GRANT',NEW."id",NEW."reason",'CREDIT_GRANT','STUDENT_CREDIT',NEW."amountMinor");
  END IF;
  RETURN NEW;
END; $$ LANGUAGE plpgsql;
CREATE TRIGGER "FeeCredit_journal" AFTER INSERT ON "FeeCredit" FOR EACH ROW EXECUTE FUNCTION journal_credit_grant();

CREATE FUNCTION journal_payment() RETURNS trigger AS $$
DECLARE captured BOOLEAN;
BEGIN
  captured := CASE WHEN TG_OP='INSERT' THEN NEW."status"='CAPTURED' ELSE OLD."status"='PENDING_CHEQUE' AND NEW."status"='CLEARED' END;
  IF captured THEN
    PERFORM journal_pair(NEW."schoolId",NEW."studentId",coalesce(NEW."captureBusinessDate",NEW."businessDate"),'PAYMENT_CAPTURE',NEW."id",'Recorded funds; electronic/cheque use clearing, not confirmed bank settlement',CASE WHEN NEW."mode"='CASH' THEN 'CASH' ELSE 'BANK_CLEARING' END,'STUDENT_CREDIT',NEW."receivedAmountMinor");
  END IF;
  IF TG_OP='UPDATE' AND OLD."status"='CLEARED' AND NEW."status"='BOUNCED' THEN
    PERFORM journal_pair(NEW."schoolId",NEW."studentId",finance_event_date(NEW."schoolId"),'CHEQUE_BOUNCE',NEW."id",'Return previously cleared cheque','STUDENT_CREDIT','BANK_CLEARING',NEW."receivedAmountMinor");
  END IF;
  RETURN NEW;
END; $$ LANGUAGE plpgsql;
CREATE TRIGGER "Payment_journal" AFTER INSERT OR UPDATE ON "Payment" FOR EACH ROW EXECUTE FUNCTION journal_payment();

CREATE FUNCTION journal_refund() RETURNS trigger AS $$
DECLARE payment "Payment";
BEGIN
  SELECT * INTO STRICT payment FROM "Payment" WHERE "id"=NEW."paymentId" AND "schoolId"=NEW."schoolId";
  PERFORM journal_pair(NEW."schoolId",payment."studentId",NEW."businessDate",'PAYMENT_REFUND_OR_REVERSAL',NEW."id",NEW."reason",'STUDENT_CREDIT',CASE WHEN payment."mode"='CASH' THEN 'CASH' ELSE 'BANK_CLEARING' END,NEW."amountMinor");
  RETURN NEW;
END; $$ LANGUAGE plpgsql;
CREATE TRIGGER "PaymentRefund_journal" AFTER INSERT ON "PaymentRefund" FOR EACH ROW EXECUTE FUNCTION journal_refund();

CREATE FUNCTION journal_cash() RETURNS trigger AS $$
DECLARE day DATE;
BEGIN
  IF TG_TABLE_NAME='CashierShift' THEN
    PERFORM journal_pair(NEW."schoolId",NULL,NEW."businessDate",'SHIFT_FLOAT',NEW."id",'Recorded opening float','CASH','FLOAT_FUNDING',NEW."openingFloatMinor");
  ELSE
    SELECT "businessDate" INTO STRICT day FROM "CashierShift" WHERE "id"=NEW."shiftId" AND "schoolId"=NEW."schoolId";
    PERFORM journal_pair(NEW."schoolId",NULL,day,'CASH_'||NEW."type",NEW."id",NEW."reason",CASE NEW."type" WHEN 'DEPOSIT' THEN 'BANK_DEPOSIT_CLEARING' WHEN 'HANDOVER' THEN 'CASH_HANDOVER_CLEARING' ELSE 'CASH_EXPENSE' END,'CASH',NEW."amountMinor");
  END IF;
  RETURN NEW;
END; $$ LANGUAGE plpgsql;
CREATE TRIGGER "CashierShift_journal" AFTER INSERT ON "CashierShift" FOR EACH ROW EXECUTE FUNCTION journal_cash();
CREATE TRIGGER "CashMovement_journal" AFTER INSERT ON "CashMovement" FOR EACH ROW EXECUTE FUNCTION journal_cash();
