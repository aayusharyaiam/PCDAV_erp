-- Level 4 payment collection, immutable receipts, corrections, and cashier close.

CREATE TABLE "PaymentQuote" (
    "id" TEXT NOT NULL,
    "schoolId" TEXT NOT NULL,
    "studentId" TEXT NOT NULL,
    "createdBy" TEXT NOT NULL,
    "amountMinor" BIGINT NOT NULL,
    "availableCreditMinor" BIGINT NOT NULL,
    "creditAppliedMinor" BIGINT NOT NULL,
    "paymentAllocatedMinor" BIGINT NOT NULL,
    "projectedOutstandingMinor" BIGINT NOT NULL,
    "projectedCreditMinor" BIGINT NOT NULL,
    "allocationPlan" JSONB NOT NULL,
    "version" INTEGER NOT NULL DEFAULT 1,
    "status" TEXT NOT NULL DEFAULT 'OPEN',
    "expiresAt" TIMESTAMP(3) NOT NULL,
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    CONSTRAINT "PaymentQuote_pkey" PRIMARY KEY ("id")
);

CREATE TABLE "Payment" (
    "id" TEXT NOT NULL,
    "schoolId" TEXT NOT NULL,
    "studentId" TEXT NOT NULL,
    "cashierId" TEXT NOT NULL,
    "shiftId" TEXT NOT NULL,
    "quoteId" TEXT,
    "idempotencyKey" TEXT NOT NULL,
    "requestHash" TEXT NOT NULL,
    "businessDate" DATE NOT NULL,
    "mode" TEXT NOT NULL,
    "status" TEXT NOT NULL,
    "currency" TEXT NOT NULL DEFAULT 'INR',
    "receivedAmountMinor" BIGINT NOT NULL,
    "tenderedAmountMinor" BIGINT,
    "changeMinor" BIGINT NOT NULL DEFAULT 0,
    "payerName" TEXT NOT NULL,
    "payerPhone" TEXT NOT NULL DEFAULT '',
    "reference" TEXT NOT NULL DEFAULT '',
    "electronicChannel" TEXT NOT NULL DEFAULT '',
    "chequeNumber" TEXT NOT NULL DEFAULT '',
    "chequeBank" TEXT NOT NULL DEFAULT '',
    "chequeDate" DATE,
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "capturedAt" TIMESTAMP(3),
    "updatedAt" TIMESTAMP(3) NOT NULL,
    CONSTRAINT "Payment_pkey" PRIMARY KEY ("id")
);

CREATE TABLE "PaymentAllocation" (
    "id" TEXT NOT NULL,
    "schoolId" TEXT NOT NULL,
    "paymentId" TEXT NOT NULL,
    "targetType" TEXT NOT NULL,
    "targetId" TEXT NOT NULL,
    "amountMinor" BIGINT NOT NULL,
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    CONSTRAINT "PaymentAllocation_pkey" PRIMARY KEY ("id")
);

CREATE TABLE "PaymentCreditApplication" (
    "id" TEXT NOT NULL,
    "schoolId" TEXT NOT NULL,
    "paymentId" TEXT NOT NULL,
    "creditId" TEXT NOT NULL,
    "targetId" TEXT NOT NULL,
    "amountMinor" BIGINT NOT NULL,
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    CONSTRAINT "PaymentCreditApplication_pkey" PRIMARY KEY ("id")
);

CREATE TABLE "PaymentAllocationRelease" (
    "id" TEXT NOT NULL,
    "schoolId" TEXT NOT NULL,
    "paymentId" TEXT NOT NULL,
    "allocationId" TEXT NOT NULL,
    "amountMinor" BIGINT NOT NULL,
    "reason" TEXT NOT NULL,
    "createdBy" TEXT NOT NULL,
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    CONSTRAINT "PaymentAllocationRelease_pkey" PRIMARY KEY ("id")
);

CREATE TABLE "PaymentRefund" (
    "id" TEXT NOT NULL,
    "schoolId" TEXT NOT NULL,
    "paymentId" TEXT NOT NULL,
    "shiftId" TEXT,
    "amountMinor" BIGINT NOT NULL,
    "reason" TEXT NOT NULL,
    "reference" TEXT NOT NULL DEFAULT '',
    "createdBy" TEXT NOT NULL,
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    CONSTRAINT "PaymentRefund_pkey" PRIMARY KEY ("id")
);

CREATE TABLE "PaymentEvent" (
    "id" TEXT NOT NULL,
    "schoolId" TEXT NOT NULL,
    "paymentId" TEXT NOT NULL,
    "type" TEXT NOT NULL,
    "amountMinor" BIGINT,
    "reason" TEXT NOT NULL,
    "actorId" TEXT NOT NULL,
    "metadata" JSONB,
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    CONSTRAINT "PaymentEvent_pkey" PRIMARY KEY ("id")
);

CREATE TABLE "ReceiptSequence" (
    "id" TEXT NOT NULL,
    "schoolId" TEXT NOT NULL,
    "nextNumber" INTEGER NOT NULL DEFAULT 1,
    CONSTRAINT "ReceiptSequence_pkey" PRIMARY KEY ("id")
);

CREATE TABLE "Receipt" (
    "id" TEXT NOT NULL,
    "schoolId" TEXT NOT NULL,
    "paymentId" TEXT NOT NULL,
    "studentId" TEXT NOT NULL,
    "receiptNumber" TEXT NOT NULL,
    "status" TEXT NOT NULL DEFAULT 'ISSUED',
    "pdfStatus" TEXT NOT NULL DEFAULT 'UNAVAILABLE',
    "templateVersion" TEXT NOT NULL DEFAULT 'receipt-v1',
    "snapshot" JSONB NOT NULL,
    "issuedAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    CONSTRAINT "Receipt_pkey" PRIMARY KEY ("id")
);

CREATE TABLE "ReceiptEvent" (
    "id" TEXT NOT NULL,
    "schoolId" TEXT NOT NULL,
    "receiptId" TEXT NOT NULL,
    "type" TEXT NOT NULL,
    "actorId" TEXT NOT NULL,
    "metadata" JSONB,
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    CONSTRAINT "ReceiptEvent_pkey" PRIMARY KEY ("id")
);

CREATE TABLE "CashierShift" (
    "id" TEXT NOT NULL,
    "schoolId" TEXT NOT NULL,
    "cashierId" TEXT NOT NULL,
    "businessDate" DATE NOT NULL,
    "status" TEXT NOT NULL DEFAULT 'OPEN',
    "openingFloatMinor" BIGINT NOT NULL,
    "expectedCashMinor" BIGINT,
    "countedCashMinor" BIGINT,
    "varianceMinor" BIGINT,
    "openedAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "closedAt" TIMESTAMP(3),
    "closeReason" TEXT NOT NULL DEFAULT '',
    CONSTRAINT "CashierShift_pkey" PRIMARY KEY ("id")
);

CREATE UNIQUE INDEX "PaymentQuote_id_schoolId_key" ON "PaymentQuote"("id", "schoolId");
CREATE INDEX "PaymentQuote_schoolId_studentId_status_expiresAt_idx" ON "PaymentQuote"("schoolId", "studentId", "status", "expiresAt");
CREATE INDEX "PaymentQuote_schoolId_createdAt_idx" ON "PaymentQuote"("schoolId", "createdAt");
CREATE UNIQUE INDEX "Payment_schoolId_cashierId_idempotencyKey_key" ON "Payment"("schoolId", "cashierId", "idempotencyKey");
CREATE INDEX "Payment_schoolId_studentId_businessDate_idx" ON "Payment"("schoolId", "studentId", "businessDate");
CREATE INDEX "Payment_schoolId_status_businessDate_idx" ON "Payment"("schoolId", "status", "businessDate");
CREATE INDEX "Payment_schoolId_shiftId_mode_status_idx" ON "Payment"("schoolId", "shiftId", "mode", "status");
CREATE UNIQUE INDEX "PaymentAllocation_paymentId_targetType_targetId_key" ON "PaymentAllocation"("paymentId", "targetType", "targetId");
CREATE INDEX "PaymentAllocation_schoolId_targetType_targetId_idx" ON "PaymentAllocation"("schoolId", "targetType", "targetId");
CREATE INDEX "PaymentAllocation_schoolId_paymentId_idx" ON "PaymentAllocation"("schoolId", "paymentId");
CREATE INDEX "PaymentCreditApplication_schoolId_paymentId_idx" ON "PaymentCreditApplication"("schoolId", "paymentId");
CREATE INDEX "PaymentCreditApplication_schoolId_creditId_idx" ON "PaymentCreditApplication"("schoolId", "creditId");
CREATE INDEX "PaymentAllocationRelease_schoolId_paymentId_idx" ON "PaymentAllocationRelease"("schoolId", "paymentId");
CREATE INDEX "PaymentAllocationRelease_allocationId_idx" ON "PaymentAllocationRelease"("allocationId");
CREATE INDEX "PaymentRefund_schoolId_paymentId_createdAt_idx" ON "PaymentRefund"("schoolId", "paymentId", "createdAt");
CREATE INDEX "PaymentRefund_schoolId_shiftId_idx" ON "PaymentRefund"("schoolId", "shiftId");
CREATE INDEX "PaymentEvent_schoolId_paymentId_createdAt_idx" ON "PaymentEvent"("schoolId", "paymentId", "createdAt");
CREATE INDEX "PaymentEvent_schoolId_type_createdAt_idx" ON "PaymentEvent"("schoolId", "type", "createdAt");
CREATE UNIQUE INDEX "ReceiptSequence_schoolId_key" ON "ReceiptSequence"("schoolId");
CREATE UNIQUE INDEX "Receipt_paymentId_key" ON "Receipt"("paymentId");
CREATE UNIQUE INDEX "Receipt_schoolId_receiptNumber_key" ON "Receipt"("schoolId", "receiptNumber");
CREATE INDEX "Receipt_schoolId_studentId_issuedAt_idx" ON "Receipt"("schoolId", "studentId", "issuedAt");
CREATE INDEX "Receipt_schoolId_status_issuedAt_idx" ON "Receipt"("schoolId", "status", "issuedAt");
CREATE INDEX "ReceiptEvent_schoolId_receiptId_createdAt_idx" ON "ReceiptEvent"("schoolId", "receiptId", "createdAt");
CREATE UNIQUE INDEX "CashierShift_schoolId_cashierId_businessDate_key" ON "CashierShift"("schoolId", "cashierId", "businessDate");
CREATE INDEX "CashierShift_schoolId_businessDate_status_idx" ON "CashierShift"("schoolId", "businessDate", "status");
CREATE INDEX "CashierShift_schoolId_cashierId_status_idx" ON "CashierShift"("schoolId", "cashierId", "status");
