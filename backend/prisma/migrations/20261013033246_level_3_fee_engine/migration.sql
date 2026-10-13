-- CreateTable
CREATE TABLE "FeeHead" (
    "id" TEXT NOT NULL,
    "schoolId" TEXT NOT NULL,
    "code" TEXT NOT NULL,
    "name" TEXT NOT NULL,
    "category" TEXT NOT NULL,
    "active" BOOLEAN NOT NULL DEFAULT true,
    "version" INTEGER NOT NULL DEFAULT 1,
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updatedAt" TIMESTAMP(3) NOT NULL,

    CONSTRAINT "FeeHead_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "FeePlan" (
    "id" TEXT NOT NULL,
    "schoolId" TEXT NOT NULL,
    "sessionId" TEXT NOT NULL,
    "name" TEXT NOT NULL,
    "status" TEXT NOT NULL DEFAULT 'DRAFT',
    "createdBy" TEXT NOT NULL,
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updatedAt" TIMESTAMP(3) NOT NULL,

    CONSTRAINT "FeePlan_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "FeePlanVersion" (
    "id" TEXT NOT NULL,
    "schoolId" TEXT NOT NULL,
    "planId" TEXT NOT NULL,
    "sessionId" TEXT NOT NULL,
    "versionNumber" INTEGER NOT NULL,
    "status" TEXT NOT NULL DEFAULT 'DRAFT',
    "effectiveFrom" DATE NOT NULL,
    "effectiveTo" DATE,
    "createdBy" TEXT NOT NULL,
    "publishedAt" TIMESTAMP(3),
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,

    CONSTRAINT "FeePlanVersion_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "FeeRule" (
    "id" TEXT NOT NULL,
    "schoolId" TEXT NOT NULL,
    "versionId" TEXT NOT NULL,
    "feeHeadId" TEXT NOT NULL,
    "classId" TEXT,
    "frequency" TEXT NOT NULL,
    "amountMinor" BIGINT NOT NULL,
    "assessmentMonth" INTEGER,
    "entryType" TEXT NOT NULL DEFAULT 'ALL',
    "category" TEXT NOT NULL DEFAULT 'ALL',
    "dueDay" INTEGER NOT NULL DEFAULT 10,
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,

    CONSTRAINT "FeeRule_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "ServiceAssignment" (
    "id" TEXT NOT NULL,
    "schoolId" TEXT NOT NULL,
    "enrollmentId" TEXT NOT NULL,
    "type" TEXT NOT NULL,
    "label" TEXT NOT NULL,
    "amountMinor" BIGINT NOT NULL,
    "frequency" TEXT NOT NULL DEFAULT 'MONTHLY',
    "startDate" DATE NOT NULL,
    "endDate" DATE,
    "active" BOOLEAN NOT NULL DEFAULT true,
    "assignedBy" TEXT NOT NULL,
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,

    CONSTRAINT "ServiceAssignment_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "FeeCredit" (
    "id" TEXT NOT NULL,
    "schoolId" TEXT NOT NULL,
    "studentId" TEXT NOT NULL,
    "amountMinor" BIGINT NOT NULL,
    "remainingMinor" BIGINT NOT NULL,
    "source" TEXT NOT NULL,
    "reason" TEXT NOT NULL,
    "createdBy" TEXT NOT NULL,
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,

    CONSTRAINT "FeeCredit_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "FeeObligation" (
    "id" TEXT NOT NULL,
    "schoolId" TEXT NOT NULL,
    "studentId" TEXT NOT NULL,
    "enrollmentId" TEXT NOT NULL,
    "feeHeadId" TEXT NOT NULL,
    "feeRuleId" TEXT,
    "serviceAssignmentId" TEXT,
    "periodKey" TEXT NOT NULL,
    "dueDate" DATE NOT NULL,
    "amountMinor" BIGINT NOT NULL,
    "creditAppliedMinor" BIGINT NOT NULL DEFAULT 0,
    "paidMinor" BIGINT NOT NULL DEFAULT 0,
    "status" TEXT NOT NULL DEFAULT 'OPEN',
    "assessedAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,

    CONSTRAINT "FeeObligation_pkey" PRIMARY KEY ("id")
);

-- CreateIndex
CREATE INDEX "FeeHead_schoolId_active_idx" ON "FeeHead"("schoolId", "active");

-- CreateIndex
CREATE UNIQUE INDEX "FeeHead_schoolId_code_key" ON "FeeHead"("schoolId", "code");

-- CreateIndex
CREATE UNIQUE INDEX "FeeHead_id_schoolId_key" ON "FeeHead"("id", "schoolId");

-- CreateIndex
CREATE UNIQUE INDEX "FeePlan_schoolId_sessionId_name_key" ON "FeePlan"("schoolId", "sessionId", "name");

-- CreateIndex
CREATE UNIQUE INDEX "FeePlan_id_schoolId_key" ON "FeePlan"("id", "schoolId");

-- CreateIndex
CREATE INDEX "FeePlanVersion_schoolId_sessionId_status_idx" ON "FeePlanVersion"("schoolId", "sessionId", "status");

-- CreateIndex
CREATE UNIQUE INDEX "FeePlanVersion_planId_versionNumber_key" ON "FeePlanVersion"("planId", "versionNumber");

-- CreateIndex
CREATE UNIQUE INDEX "FeePlanVersion_id_schoolId_key" ON "FeePlanVersion"("id", "schoolId");

-- CreateIndex
CREATE INDEX "FeeRule_schoolId_versionId_classId_idx" ON "FeeRule"("schoolId", "versionId", "classId");

-- CreateIndex
CREATE INDEX "FeeRule_schoolId_feeHeadId_idx" ON "FeeRule"("schoolId", "feeHeadId");

-- CreateIndex
CREATE INDEX "ServiceAssignment_schoolId_enrollmentId_type_active_idx" ON "ServiceAssignment"("schoolId", "enrollmentId", "type", "active");

-- CreateIndex
CREATE INDEX "FeeCredit_schoolId_studentId_remainingMinor_idx" ON "FeeCredit"("schoolId", "studentId", "remainingMinor");

-- CreateIndex
CREATE INDEX "FeeObligation_schoolId_studentId_dueDate_status_idx" ON "FeeObligation"("schoolId", "studentId", "dueDate", "status");

-- CreateIndex
CREATE INDEX "FeeObligation_schoolId_enrollmentId_periodKey_idx" ON "FeeObligation"("schoolId", "enrollmentId", "periodKey");

-- CreateIndex
CREATE UNIQUE INDEX "FeeObligation_schoolId_enrollmentId_feeHeadId_periodKey_key" ON "FeeObligation"("schoolId", "enrollmentId", "feeHeadId", "periodKey");

-- RenameIndex
ALTER INDEX "User_id_school_unique" RENAME TO "User_id_schoolId_key";
