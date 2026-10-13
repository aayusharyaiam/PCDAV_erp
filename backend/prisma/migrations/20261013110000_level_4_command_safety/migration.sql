-- Commit refund command identity and its original response with all refund effects.
CREATE TABLE "RefundCommand" (
    "id" TEXT NOT NULL,
    "schoolId" TEXT NOT NULL,
    "actorId" TEXT NOT NULL,
    "idempotencyKey" TEXT NOT NULL,
    "requestHash" TEXT NOT NULL,
    "paymentId" TEXT NOT NULL,
    "result" JSONB NOT NULL,
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    CONSTRAINT "RefundCommand_pkey" PRIMARY KEY ("id"),
    CONSTRAINT "RefundCommand_paymentId_schoolId_fkey" FOREIGN KEY ("paymentId", "schoolId") REFERENCES "Payment"("id", "schoolId") ON DELETE RESTRICT ON UPDATE CASCADE
);
CREATE UNIQUE INDEX "RefundCommand_schoolId_actorId_idempotencyKey_key" ON "RefundCommand"("schoolId", "actorId", "idempotencyKey");
CREATE INDEX "RefundCommand_schoolId_paymentId_idx" ON "RefundCommand"("schoolId", "paymentId");

-- Legacy rows stay explicitly unverified; never manufacture staff confirmation.
ALTER TABLE "Payment" ADD COLUMN "electronicVerifiedAt" TIMESTAMP(3);
ALTER TABLE "Payment" ADD COLUMN "electronicVerifiedBy" TEXT;
ALTER TABLE "Payment" ADD COLUMN "electronicVerificationNote" TEXT;

-- Match JavaScript String.trim whitespace, including tabs/newlines and Unicode
-- spaces. Keep references case-sensitive and reserved even after refund/reversal.
-- Existing duplicate references must be reconciled before this index can deploy.
CREATE UNIQUE INDEX "Payment_electronic_reference_key" ON "Payment" (
    "schoolId", "electronicChannel",
    btrim("reference", U&'\0009\000A\000B\000C\000D\0020\00A0\1680\2000\2001\2002\2003\2004\2005\2006\2007\2008\2009\200A\2028\2029\202F\205F\3000\FEFF')
) WHERE "mode" = 'MANUAL_ELECTRONIC';
