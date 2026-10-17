-- Dated student lifecycle events preserve the reason/authority for leaving,
-- transfer and readmission while current status fields remain operational.
CREATE TABLE "StudentLifecycleEvent" (
    "id" TEXT NOT NULL,
    "schoolId" TEXT NOT NULL,
    "studentId" TEXT NOT NULL,
    "enrollmentId" TEXT,
    "eventType" TEXT NOT NULL,
    "effectiveDate" DATE NOT NULL,
    "reason" TEXT NOT NULL,
    "fromStudentStatus" TEXT NOT NULL,
    "toStudentStatus" TEXT NOT NULL,
    "fromEnrollmentStatus" TEXT,
    "toEnrollmentStatus" TEXT,
    "actorId" TEXT NOT NULL,
    "metadata" JSONB,
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    CONSTRAINT "StudentLifecycleEvent_pkey" PRIMARY KEY ("id"),
    CONSTRAINT "StudentLifecycleEvent_type_check" CHECK ("eventType" IN ('WITHDRAWN', 'STRUCK_OFF', 'TRANSFERRED', 'READMITTED'))
);

-- Imports are reviewed previews followed by a commit against the exact batch.
-- Keeping rows in the database makes rejected CSV rows visible and retryable.
CREATE TABLE "ImportBatch" (
    "id" TEXT NOT NULL,
    "schoolId" TEXT NOT NULL,
    "kind" TEXT NOT NULL,
    "status" TEXT NOT NULL DEFAULT 'PREVIEWED',
    "sourceName" TEXT NOT NULL DEFAULT '',
    "reason" TEXT NOT NULL,
    "totalRows" INTEGER NOT NULL,
    "validRows" INTEGER NOT NULL,
    "invalidRows" INTEGER NOT NULL,
    "createdBy" TEXT NOT NULL,
    "committedAt" TIMESTAMP(3),
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    CONSTRAINT "ImportBatch_pkey" PRIMARY KEY ("id")
);

CREATE TABLE "ImportRow" (
    "id" TEXT NOT NULL,
    "schoolId" TEXT NOT NULL,
    "batchId" TEXT NOT NULL,
    "rowNumber" INTEGER NOT NULL,
    "payload" JSONB NOT NULL,
    "status" TEXT NOT NULL DEFAULT 'VALID',
    "error" TEXT,
    "entityType" TEXT,
    "entityId" TEXT,
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    CONSTRAINT "ImportRow_pkey" PRIMARY KEY ("id")
);

CREATE UNIQUE INDEX "StudentLifecycleEvent_id_school_unique" ON "StudentLifecycleEvent"("id", "schoolId");
CREATE INDEX "StudentLifecycleEvent_student_date_idx" ON "StudentLifecycleEvent"("schoolId", "studentId", "effectiveDate");
CREATE INDEX "StudentLifecycleEvent_type_date_idx" ON "StudentLifecycleEvent"("schoolId", "eventType", "effectiveDate");

CREATE UNIQUE INDEX "ImportBatch_id_school_unique" ON "ImportBatch"("id", "schoolId");
CREATE INDEX "ImportBatch_scope_idx" ON "ImportBatch"("schoolId", "kind", "status", "createdAt");
CREATE UNIQUE INDEX "ImportRow_batch_row_unique" ON "ImportRow"("batchId", "rowNumber");
CREATE UNIQUE INDEX "ImportRow_id_school_unique" ON "ImportRow"("id", "schoolId");
CREATE INDEX "ImportRow_batch_status_idx" ON "ImportRow"("schoolId", "batchId", "status");

ALTER TABLE "StudentLifecycleEvent" ADD CONSTRAINT "StudentLifecycleEvent_school_fk"
  FOREIGN KEY ("schoolId") REFERENCES "School"("id") ON DELETE RESTRICT ON UPDATE CASCADE;
ALTER TABLE "StudentLifecycleEvent" ADD CONSTRAINT "StudentLifecycleEvent_student_fk"
  FOREIGN KEY ("studentId", "schoolId") REFERENCES "Student"("id", "schoolId") ON DELETE RESTRICT ON UPDATE CASCADE;
ALTER TABLE "StudentLifecycleEvent" ADD CONSTRAINT "StudentLifecycleEvent_enrollment_fk"
  FOREIGN KEY ("enrollmentId", "schoolId") REFERENCES "Enrollment"("id", "schoolId") ON DELETE RESTRICT ON UPDATE CASCADE;
ALTER TABLE "StudentLifecycleEvent" ADD CONSTRAINT "StudentLifecycleEvent_actor_fk"
  FOREIGN KEY ("actorId", "schoolId") REFERENCES "User"("id", "schoolId") ON DELETE RESTRICT ON UPDATE CASCADE;

ALTER TABLE "ImportBatch" ADD CONSTRAINT "ImportBatch_school_fk"
  FOREIGN KEY ("schoolId") REFERENCES "School"("id") ON DELETE RESTRICT ON UPDATE CASCADE;
ALTER TABLE "ImportBatch" ADD CONSTRAINT "ImportBatch_actor_fk"
  FOREIGN KEY ("createdBy", "schoolId") REFERENCES "User"("id", "schoolId") ON DELETE RESTRICT ON UPDATE CASCADE;
ALTER TABLE "ImportRow" ADD CONSTRAINT "ImportRow_school_fk"
  FOREIGN KEY ("schoolId") REFERENCES "School"("id") ON DELETE RESTRICT ON UPDATE CASCADE;
ALTER TABLE "ImportRow" ADD CONSTRAINT "ImportRow_batch_fk"
  FOREIGN KEY ("batchId", "schoolId") REFERENCES "ImportBatch"("id", "schoolId") ON DELETE RESTRICT ON UPDATE CASCADE;

CREATE TRIGGER "StudentLifecycleEvent_immutable" BEFORE UPDATE OR DELETE ON "StudentLifecycleEvent"
  FOR EACH ROW EXECUTE FUNCTION lifecycle_history_immutable();
