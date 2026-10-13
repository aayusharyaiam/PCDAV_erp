-- Level 4 financial invariants: payment lineage, bounded balances, and immutable receipt originals.

ALTER TABLE "FeeCredit" ADD COLUMN "sourcePaymentId" TEXT;
CREATE UNIQUE INDEX "FeeCredit_sourcePaymentId_key" ON "FeeCredit"("sourcePaymentId");

ALTER TABLE "Payment" ADD COLUMN "captureBusinessDate" DATE;
ALTER TABLE "Payment" ADD COLUMN "captureShiftId" TEXT;
CREATE UNIQUE INDEX "Payment_quoteId_key" ON "Payment"("quoteId");
CREATE UNIQUE INDEX "Payment_id_schoolId_key" ON "Payment"("id", "schoolId");
CREATE UNIQUE INDEX "Receipt_paymentId_schoolId_key" ON "Receipt"("paymentId", "schoolId");

CREATE TABLE "PaymentCreditRelease" (
    "id" TEXT NOT NULL,
    "schoolId" TEXT NOT NULL,
    "paymentId" TEXT NOT NULL,
    "applicationId" TEXT NOT NULL,
    "amountMinor" BIGINT NOT NULL,
    "reason" TEXT NOT NULL,
    "createdBy" TEXT NOT NULL,
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    CONSTRAINT "PaymentCreditRelease_pkey" PRIMARY KEY ("id")
);
CREATE UNIQUE INDEX "PaymentCreditRelease_applicationId_key" ON "PaymentCreditRelease"("applicationId");
CREATE INDEX "PaymentCreditRelease_schoolId_paymentId_idx" ON "PaymentCreditRelease"("schoolId", "paymentId");

ALTER TABLE "PaymentRefund" ADD COLUMN "businessDate" DATE NOT NULL DEFAULT CURRENT_DATE;
ALTER TABLE "PaymentRefund" ALTER COLUMN "businessDate" DROP DEFAULT;
ALTER TABLE "PaymentEvent" ADD COLUMN "businessDate" DATE NOT NULL DEFAULT CURRENT_DATE;
ALTER TABLE "PaymentEvent" ALTER COLUMN "businessDate" DROP DEFAULT;
CREATE INDEX "PaymentEvent_schoolId_businessDate_type_idx" ON "PaymentEvent"("schoolId", "businessDate", "type");

ALTER TABLE "Receipt" ADD CONSTRAINT "Receipt_paymentId_schoolId_fkey" FOREIGN KEY ("paymentId", "schoolId") REFERENCES "Payment"("id", "schoolId") ON DELETE RESTRICT ON UPDATE CASCADE;

ALTER TABLE "StoreIssue" ADD CONSTRAINT "StoreIssue_balance_check" CHECK ("totalMinor" >= 0 AND "paidMinor" >= 0 AND "paidMinor" <= "totalMinor" AND ("status" <> 'VOID' OR "paidMinor" = 0));
ALTER TABLE "FeeObligation" ADD CONSTRAINT "FeeObligation_balance_check" CHECK ("amountMinor" >= 0 AND "paidMinor" >= 0 AND "creditAppliedMinor" >= 0 AND "paidMinor" <= "amountMinor" - "creditAppliedMinor");
ALTER TABLE "FeeCredit" ADD CONSTRAINT "FeeCredit_balance_check" CHECK ("amountMinor" > 0 AND "remainingMinor" >= 0 AND "remainingMinor" <= "amountMinor");
ALTER TABLE "Payment" ADD CONSTRAINT "Payment_amount_check" CHECK ("receivedAmountMinor" > 0 AND "changeMinor" >= 0 AND "currency" = 'INR' AND "mode" IN ('CASH', 'MANUAL_ELECTRONIC', 'CHEQUE') AND (("mode" = 'CASH' AND "tenderedAmountMinor" IS NOT NULL AND "tenderedAmountMinor" >= "receivedAmountMinor" AND "changeMinor" = "tenderedAmountMinor" - "receivedAmountMinor") OR ("mode" <> 'CASH' AND "changeMinor" = 0)));
ALTER TABLE "PaymentAllocation" ADD CONSTRAINT "PaymentAllocation_amount_check" CHECK ("amountMinor" > 0 AND "targetType" IN ('FEE', 'STORE'));
ALTER TABLE "PaymentAllocationRelease" ADD CONSTRAINT "PaymentAllocationRelease_amount_check" CHECK ("amountMinor" > 0);
ALTER TABLE "PaymentCreditApplication" ADD CONSTRAINT "PaymentCreditApplication_amount_check" CHECK ("amountMinor" > 0);
ALTER TABLE "PaymentCreditRelease" ADD CONSTRAINT "PaymentCreditRelease_amount_check" CHECK ("amountMinor" > 0);
ALTER TABLE "PaymentRefund" ADD CONSTRAINT "PaymentRefund_amount_check" CHECK ("amountMinor" > 0);
ALTER TABLE "CashierShift" ADD CONSTRAINT "CashierShift_close_check" CHECK ("openingFloatMinor" >= 0 AND (("status" = 'OPEN' AND "closedAt" IS NULL AND "expectedCashMinor" IS NULL AND "countedCashMinor" IS NULL AND "varianceMinor" IS NULL) OR ("status" = 'CLOSED' AND "closedAt" IS NOT NULL AND "expectedCashMinor" IS NOT NULL AND "countedCashMinor" >= 0 AND "varianceMinor" = "countedCashMinor" - "expectedCashMinor")));

CREATE FUNCTION protect_receipt_snapshot() RETURNS trigger AS $$
BEGIN
  IF ROW(NEW."id", NEW."schoolId", NEW."paymentId", NEW."studentId", NEW."receiptNumber", NEW."snapshot", NEW."issuedAt", NEW."templateVersion")
     IS DISTINCT FROM ROW(OLD."id", OLD."schoolId", OLD."paymentId", OLD."studentId", OLD."receiptNumber", OLD."snapshot", OLD."issuedAt", OLD."templateVersion") THEN
    RAISE EXCEPTION 'Original receipt identity and snapshot are immutable' USING ERRCODE = '23514';
  END IF;
  RETURN NEW;
END;
$$ LANGUAGE plpgsql;
CREATE TRIGGER "Receipt_immutable_snapshot" BEFORE UPDATE ON "Receipt" FOR EACH ROW EXECUTE FUNCTION protect_receipt_snapshot();
