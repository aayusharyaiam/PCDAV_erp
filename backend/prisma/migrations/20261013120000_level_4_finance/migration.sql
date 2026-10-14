-- Demo policy, durable commands, complete credit lineage and PDF outbox.
ALTER TABLE "FeeObligation" ADD COLUMN "bouncePaymentId" TEXT;
CREATE UNIQUE INDEX "FeeObligation_bouncePaymentId_key" ON "FeeObligation"("bouncePaymentId");
DROP INDEX "PaymentCreditRelease_applicationId_key";
CREATE INDEX "PaymentCreditRelease_applicationId_idx" ON "PaymentCreditRelease"("applicationId");

CREATE TABLE "FinancePolicy" (
  "schoolId" TEXT PRIMARY KEY, "version" INTEGER NOT NULL DEFAULT 1,
  "receiptPrefix" TEXT NOT NULL DEFAULT 'DEMO/FEE', "receiptScope" TEXT NOT NULL DEFAULT 'SCHOOL',
  "allowAdvance" BOOLEAN NOT NULL DEFAULT true, "blockPreviousSession" BOOLEAN NOT NULL DEFAULT false,
  "bounceFeeMinor" BIGINT NOT NULL DEFAULT 0,
  CHECK ("version" > 0 AND "bounceFeeMinor" >= 0 AND "receiptScope" IN ('SCHOOL','FINANCIAL_YEAR'))
);
CREATE TABLE "FinancePolicyVersion" (
  "id" TEXT PRIMARY KEY, "schoolId" TEXT NOT NULL, "version" INTEGER NOT NULL,
  "snapshot" JSONB NOT NULL, "reason" TEXT NOT NULL, "createdBy" TEXT NOT NULL,
  "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP
);
CREATE UNIQUE INDEX "FinancePolicyVersion_schoolId_version_key" ON "FinancePolicyVersion"("schoolId","version");
INSERT INTO "FinancePolicy" ("schoolId") SELECT "id" FROM "School";
INSERT INTO "FinancePolicyVersion" ("id","schoolId","version","snapshot","reason","createdBy")
SELECT gen_random_uuid()::text, "schoolId", 1, to_jsonb(p), 'Configurable DEMO defaults; not real school policy', 'MIGRATION' FROM "FinancePolicy" p;

CREATE TABLE "ReceiptSeries" (
  "id" TEXT PRIMARY KEY, "schoolId" TEXT NOT NULL, "prefix" TEXT NOT NULL,
  "scopeKey" TEXT NOT NULL, "nextNumber" INTEGER NOT NULL DEFAULT 1 CHECK ("nextNumber" > 0)
);
CREATE UNIQUE INDEX "ReceiptSeries_schoolId_prefix_scopeKey_key" ON "ReceiptSeries"("schoolId","prefix","scopeKey");

CREATE TABLE "FinanceRequest" (
  "id" TEXT PRIMARY KEY, "schoolId" TEXT NOT NULL, "paymentId" TEXT NOT NULL,
  "type" TEXT NOT NULL CHECK ("type" IN ('REFUND','REVERSE','BOUNCE')), "amountMinor" BIGINT,
  "reason" TEXT NOT NULL, "reference" TEXT NOT NULL DEFAULT '', "businessDate" DATE, "shiftId" TEXT,
  "status" TEXT NOT NULL DEFAULT 'REQUESTED' CHECK ("status" IN ('REQUESTED','APPLIED','REJECTED','STALE')),
  "requestedBy" TEXT NOT NULL, "idempotencyKey" TEXT NOT NULL, "requestHash" TEXT NOT NULL, "fingerprint" TEXT NOT NULL,
  "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP, "decidedBy" TEXT, "decidedAt" TIMESTAMP(3), "decisionReason" TEXT,
  CHECK (("type" = 'REFUND' AND "amountMinor" > 0) OR ("type" <> 'REFUND' AND "amountMinor" IS NULL)),
  FOREIGN KEY ("paymentId","schoolId") REFERENCES "Payment"("id","schoolId") ON DELETE RESTRICT
);
CREATE UNIQUE INDEX "FinanceRequest_schoolId_requestedBy_idempotencyKey_key" ON "FinanceRequest"("schoolId","requestedBy","idempotencyKey");
CREATE INDEX "FinanceRequest_schoolId_status_createdAt_idx" ON "FinanceRequest"("schoolId","status","createdAt");

CREATE TABLE "CashMovement" (
  "id" TEXT PRIMARY KEY, "schoolId" TEXT NOT NULL, "shiftId" TEXT NOT NULL,
  "type" TEXT NOT NULL CHECK ("type" IN ('DEPOSIT','HANDOVER','EXPENSE')), "amountMinor" BIGINT NOT NULL CHECK ("amountMinor" > 0),
  "reason" TEXT NOT NULL, "reference" TEXT NOT NULL, "createdBy" TEXT NOT NULL,
  "idempotencyKey" TEXT NOT NULL, "requestHash" TEXT NOT NULL, "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP
);
CREATE UNIQUE INDEX "CashMovement_schoolId_createdBy_idempotencyKey_key" ON "CashMovement"("schoolId","createdBy","idempotencyKey");
CREATE INDEX "CashMovement_schoolId_shiftId_createdAt_idx" ON "CashMovement"("schoolId","shiftId","createdAt");
CREATE UNIQUE INDEX "CashierShift_id_schoolId_key" ON "CashierShift"("id","schoolId");
ALTER TABLE "CashMovement" ADD FOREIGN KEY ("shiftId","schoolId") REFERENCES "CashierShift"("id","schoolId") ON DELETE RESTRICT;

CREATE TABLE "FeeCreditAllocation" (
  "id" TEXT PRIMARY KEY, "schoolId" TEXT NOT NULL, "studentId" TEXT NOT NULL, "creditId" TEXT NOT NULL,
  "obligationId" TEXT NOT NULL, "paymentId" TEXT, "legacyApplicationId" TEXT, "source" TEXT NOT NULL,
  "amountMinor" BIGINT NOT NULL CHECK ("amountMinor" > 0), "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP
);
CREATE UNIQUE INDEX "FeeCreditAllocation_legacyApplicationId_key" ON "FeeCreditAllocation"("legacyApplicationId");
CREATE INDEX "FeeCreditAllocation_schoolId_creditId_idx" ON "FeeCreditAllocation"("schoolId","creditId");
CREATE INDEX "FeeCreditAllocation_schoolId_studentId_obligationId_idx" ON "FeeCreditAllocation"("schoolId","studentId","obligationId");
CREATE INDEX "FeeCreditAllocation_schoolId_paymentId_idx" ON "FeeCreditAllocation"("schoolId","paymentId");
CREATE TABLE "FeeCreditAllocationRelease" (
  "id" TEXT PRIMARY KEY, "schoolId" TEXT NOT NULL, "allocationId" TEXT NOT NULL, "correctionPaymentId" TEXT NOT NULL,
  "amountMinor" BIGINT NOT NULL CHECK ("amountMinor" > 0), "restoredToCredit" BOOLEAN NOT NULL,
  "reason" TEXT NOT NULL, "createdBy" TEXT NOT NULL, "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP
);
CREATE INDEX "FeeCreditAllocationRelease_schoolId_allocationId_idx" ON "FeeCreditAllocationRelease"("schoolId","allocationId");
CREATE INDEX "FeeCreditAllocationRelease_schoolId_correctionPaymentId_idx" ON "FeeCreditAllocationRelease"("schoolId","correctionPaymentId");
CREATE UNIQUE INDEX "FeeCredit_id_school_student_key" ON "FeeCredit"("id","schoolId","studentId");
CREATE UNIQUE INDEX "FeeObligation_id_school_student_key" ON "FeeObligation"("id","schoolId","studentId");
CREATE UNIQUE INDEX "FeeCreditAllocation_id_school_key" ON "FeeCreditAllocation"("id","schoolId");
ALTER TABLE "FeeCreditAllocation" ADD FOREIGN KEY ("creditId","schoolId","studentId") REFERENCES "FeeCredit"("id","schoolId","studentId") ON DELETE RESTRICT;
ALTER TABLE "FeeCreditAllocation" ADD FOREIGN KEY ("obligationId","schoolId","studentId") REFERENCES "FeeObligation"("id","schoolId","studentId") ON DELETE RESTRICT;
ALTER TABLE "FeeCreditAllocationRelease" ADD FOREIGN KEY ("allocationId","schoolId") REFERENCES "FeeCreditAllocation"("id","schoolId") ON DELETE RESTRICT;
ALTER TABLE "FeeCreditAllocationRelease" ADD FOREIGN KEY ("correctionPaymentId","schoolId") REFERENCES "Payment"("id","schoolId") ON DELETE RESTRICT;

-- Recover only evidenced lineage. No guessed assignment of historical credit.
INSERT INTO "FeeCreditAllocation" ("id","schoolId","studentId","creditId","obligationId","paymentId","legacyApplicationId","source","amountMinor","createdAt")
SELECT a."id", a."schoolId", c."studentId", a."creditId", a."targetId", a."paymentId", a."id", 'PAYMENT', a."amountMinor", a."createdAt"
FROM "PaymentCreditApplication" a JOIN "FeeCredit" c ON c."id"=a."creditId" AND c."schoolId"=a."schoolId";
INSERT INTO "FeeCreditAllocationRelease" ("id","schoolId","allocationId","correctionPaymentId","amountMinor","restoredToCredit","reason","createdBy","createdAt")
SELECT "id","schoolId","applicationId","paymentId","amountMinor",true,"reason","createdBy","createdAt" FROM "PaymentCreditRelease";
INSERT INTO "FeeCreditAllocation" ("id","schoolId","studentId","creditId","obligationId","source","amountMinor","createdAt")
SELECT a."id",a."schoolId",c."studentId",c."id",o."id",'ASSESSMENT_AUDIT', (a."after"->>'amountMinor')::bigint,a."createdAt"
FROM "AuditEvent" a JOIN "FeeCredit" c ON c."id"=a."after"->>'creditId' AND c."schoolId"=a."schoolId"
JOIN "FeeObligation" o ON o."id"=a."entityId" AND o."schoolId"=c."schoolId" AND o."studentId"=c."studentId"
WHERE a."action"='FEE_CREDIT_ALLOCATED' AND (a."after"->>'amountMinor') ~ '^[0-9]+$' AND (a."after"->>'amountMinor')::bigint > 0;

CREATE TABLE "ReceiptPdfJob" (
  "id" TEXT PRIMARY KEY, "schoolId" TEXT NOT NULL, "receiptId" TEXT NOT NULL, "receiptStatus" TEXT NOT NULL,
  "status" TEXT NOT NULL DEFAULT 'PENDING', "attempts" INTEGER NOT NULL DEFAULT 0, "content" BYTEA, "sha256" TEXT,
  "errorCode" TEXT, "requestedBy" TEXT NOT NULL, "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP, "updatedAt" TIMESTAMP(3) NOT NULL
);
CREATE UNIQUE INDEX "ReceiptPdfJob_receiptId_receiptStatus_key" ON "ReceiptPdfJob"("receiptId","receiptStatus");
CREATE INDEX "ReceiptPdfJob_schoolId_status_idx" ON "ReceiptPdfJob"("schoolId","status");
INSERT INTO "ReceiptPdfJob" ("id","schoolId","receiptId","receiptStatus","requestedBy","updatedAt")
SELECT gen_random_uuid()::text,"schoolId","id","status",'MIGRATION',CURRENT_TIMESTAMP FROM "Receipt";
UPDATE "Receipt" SET "pdfStatus"='PENDING';

CREATE FUNCTION finance_immutable() RETURNS trigger AS $$
BEGIN RAISE EXCEPTION 'Posted financial history is immutable' USING ERRCODE='23514'; END;
$$ LANGUAGE plpgsql;
CREATE TRIGGER "FinancePolicyVersion_immutable" BEFORE UPDATE OR DELETE ON "FinancePolicyVersion" FOR EACH ROW EXECUTE FUNCTION finance_immutable();
CREATE TRIGGER "CashMovement_immutable" BEFORE UPDATE OR DELETE ON "CashMovement" FOR EACH ROW EXECUTE FUNCTION finance_immutable();
CREATE TRIGGER "FeeCreditAllocation_immutable" BEFORE UPDATE OR DELETE ON "FeeCreditAllocation" FOR EACH ROW EXECUTE FUNCTION finance_immutable();
CREATE TRIGGER "FeeCreditAllocationRelease_immutable" BEFORE UPDATE OR DELETE ON "FeeCreditAllocationRelease" FOR EACH ROW EXECUTE FUNCTION finance_immutable();
CREATE FUNCTION finance_request_immutable() RETURNS trigger AS $$
BEGIN
  IF TG_OP='DELETE' THEN RAISE EXCEPTION 'Correction request history is immutable' USING ERRCODE='23514'; END IF;
  IF (to_jsonb(NEW) - ARRAY['status','decidedBy','decidedAt','decisionReason']) IS DISTINCT FROM
     (to_jsonb(OLD) - ARRAY['status','decidedBy','decidedAt','decisionReason']) OR OLD."status" <> 'REQUESTED' THEN
    RAISE EXCEPTION 'Requested correction and final decisions are immutable' USING ERRCODE='23514';
  END IF;
  RETURN NEW;
END; $$ LANGUAGE plpgsql;
CREATE TRIGGER "FinanceRequest_immutable" BEFORE UPDATE OR DELETE ON "FinanceRequest" FOR EACH ROW EXECUTE FUNCTION finance_request_immutable();
