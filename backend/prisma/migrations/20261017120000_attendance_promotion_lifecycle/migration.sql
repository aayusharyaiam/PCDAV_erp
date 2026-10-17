-- Attendance submissions and marks are posted evidence. Corrections append a
-- separate event and never rewrite the submitted mark.
CREATE TABLE "AttendanceSubmission" (
    "id" TEXT NOT NULL,
    "schoolId" TEXT NOT NULL,
    "sessionId" TEXT NOT NULL,
    "classId" TEXT NOT NULL,
    "attendanceDate" DATE NOT NULL,
    "markedBy" TEXT NOT NULL,
    "submittedAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "status" TEXT NOT NULL DEFAULT 'SUBMITTED',
    CONSTRAINT "AttendanceSubmission_pkey" PRIMARY KEY ("id")
);

CREATE TABLE "AttendanceMark" (
    "id" TEXT NOT NULL,
    "schoolId" TEXT NOT NULL,
    "submissionId" TEXT NOT NULL,
    "studentId" TEXT NOT NULL,
    "enrollmentId" TEXT NOT NULL,
    "status" TEXT NOT NULL,
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    CONSTRAINT "AttendanceMark_pkey" PRIMARY KEY ("id")
);

CREATE TABLE "AttendanceCorrectionRequest" (
    "id" TEXT NOT NULL,
    "schoolId" TEXT NOT NULL,
    "attendanceMarkId" TEXT NOT NULL,
    "requestedBy" TEXT NOT NULL,
    "beforeStatus" TEXT NOT NULL,
    "requestedStatus" TEXT NOT NULL,
    "beforeCorrectionId" TEXT,
    "reason" TEXT NOT NULL,
    "status" TEXT NOT NULL DEFAULT 'REQUESTED',
    "version" INTEGER NOT NULL DEFAULT 1,
    "requestedAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "decidedBy" TEXT,
    "decidedAt" TIMESTAMP(3),
    "decisionReason" TEXT,
    CONSTRAINT "AttendanceCorrectionRequest_pkey" PRIMARY KEY ("id")
);

CREATE TABLE "AttendanceCorrection" (
    "id" TEXT NOT NULL,
    "schoolId" TEXT NOT NULL,
    "attendanceMarkId" TEXT NOT NULL,
    "requestId" TEXT NOT NULL,
    "originalStatus" TEXT NOT NULL,
    "correctedStatus" TEXT NOT NULL,
    "appliedBy" TEXT NOT NULL,
    "reason" TEXT NOT NULL,
    "appliedAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    CONSTRAINT "AttendanceCorrection_pkey" PRIMARY KEY ("id")
);

CREATE TABLE "PromotionDecision" (
    "id" TEXT NOT NULL,
    "schoolId" TEXT NOT NULL,
    "sourceSessionId" TEXT NOT NULL,
    "sourceEnrollmentId" TEXT NOT NULL,
    "studentId" TEXT NOT NULL,
    "sourceClassId" TEXT NOT NULL,
    "decision" TEXT NOT NULL,
    "decidedBy" TEXT NOT NULL,
    "reason" TEXT NOT NULL,
    "decidedAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    CONSTRAINT "PromotionDecision_pkey" PRIMARY KEY ("id")
);

CREATE TABLE "PromotionBatch" (
    "id" TEXT NOT NULL,
    "schoolId" TEXT NOT NULL,
    "sourceSessionId" TEXT NOT NULL,
    "targetSessionId" TEXT NOT NULL,
    "status" TEXT NOT NULL DEFAULT 'DRAFT',
    "version" INTEGER NOT NULL DEFAULT 1,
    "createdBy" TEXT NOT NULL,
    "validation" JSONB,
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "validatedAt" TIMESTAMP(3),
    "executedAt" TIMESTAMP(3),
    CONSTRAINT "PromotionBatch_pkey" PRIMARY KEY ("id")
);

CREATE TABLE "PromotionBatchItem" (
    "id" TEXT NOT NULL,
    "schoolId" TEXT NOT NULL,
    "batchId" TEXT NOT NULL,
    "sourceEnrollmentId" TEXT NOT NULL,
    "decisionId" TEXT NOT NULL,
    "studentId" TEXT NOT NULL,
    "decision" TEXT NOT NULL,
    "targetClassId" TEXT NOT NULL,
    "status" TEXT NOT NULL DEFAULT 'PENDING',
    "targetEnrollmentId" TEXT,
    "error" TEXT,
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "executedAt" TIMESTAMP(3),
    CONSTRAINT "PromotionBatchItem_pkey" PRIMARY KEY ("id")
);

ALTER TABLE "Enrollment" ADD CONSTRAINT "Enrollment_id_school_unique" UNIQUE ("id", "schoolId");

CREATE UNIQUE INDEX "AttendanceSubmission_scope_unique"
  ON "AttendanceSubmission"("schoolId", "sessionId", "classId", "attendanceDate");
CREATE UNIQUE INDEX "AttendanceSubmission_id_school_unique" ON "AttendanceSubmission"("id", "schoolId");
CREATE INDEX "AttendanceSubmission_scope_idx"
  ON "AttendanceSubmission"("schoolId", "sessionId", "classId", "attendanceDate");

CREATE UNIQUE INDEX "AttendanceMark_id_school_unique" ON "AttendanceMark"("id", "schoolId");
CREATE UNIQUE INDEX "AttendanceMark_submission_student_unique" ON "AttendanceMark"("submissionId", "studentId");
CREATE INDEX "AttendanceMark_student_created_idx" ON "AttendanceMark"("schoolId", "studentId", "createdAt");
CREATE INDEX "AttendanceMark_enrollment_idx" ON "AttendanceMark"("schoolId", "enrollmentId");

CREATE UNIQUE INDEX "AttendanceCorrectionRequest_id_school_unique" ON "AttendanceCorrectionRequest"("id", "schoolId");
CREATE INDEX "AttendanceCorrectionRequest_status_idx"
  ON "AttendanceCorrectionRequest"("schoolId", "status", "requestedAt");
CREATE INDEX "AttendanceCorrectionRequest_mark_idx"
  ON "AttendanceCorrectionRequest"("schoolId", "attendanceMarkId", "requestedAt");

CREATE UNIQUE INDEX "AttendanceCorrection_id_school_unique" ON "AttendanceCorrection"("id", "schoolId");
CREATE UNIQUE INDEX "AttendanceCorrection_requestId_key" ON "AttendanceCorrection"("requestId");
CREATE INDEX "AttendanceCorrection_mark_idx"
  ON "AttendanceCorrection"("schoolId", "attendanceMarkId", "appliedAt");

CREATE UNIQUE INDEX "PromotionDecision_source_unique"
  ON "PromotionDecision"("schoolId", "sourceEnrollmentId");
CREATE UNIQUE INDEX "PromotionDecision_id_school_unique" ON "PromotionDecision"("id", "schoolId");
CREATE INDEX "PromotionDecision_scope_idx"
  ON "PromotionDecision"("schoolId", "sourceSessionId", "sourceClassId", "decision");

CREATE UNIQUE INDEX "PromotionBatch_id_school_unique" ON "PromotionBatch"("id", "schoolId");
CREATE INDEX "PromotionBatch_scope_idx"
  ON "PromotionBatch"("schoolId", "sourceSessionId", "targetSessionId", "status");

CREATE UNIQUE INDEX "PromotionBatchItem_source_unique"
  ON "PromotionBatchItem"("batchId", "sourceEnrollmentId");
CREATE UNIQUE INDEX "PromotionBatchItem_id_school_unique" ON "PromotionBatchItem"("id", "schoolId");
CREATE INDEX "PromotionBatchItem_batch_status_idx"
  ON "PromotionBatchItem"("schoolId", "batchId", "status");
CREATE INDEX "PromotionBatchItem_student_idx" ON "PromotionBatchItem"("schoolId", "studentId");

ALTER TABLE "AttendanceSubmission" ADD CONSTRAINT "AttendanceSubmission_school_fk"
  FOREIGN KEY ("schoolId") REFERENCES "School"("id") ON DELETE RESTRICT ON UPDATE CASCADE;
ALTER TABLE "AttendanceSubmission" ADD CONSTRAINT "AttendanceSubmission_session_fk"
  FOREIGN KEY ("sessionId", "schoolId") REFERENCES "AcademicSession"("id", "schoolId") ON DELETE RESTRICT ON UPDATE CASCADE;
ALTER TABLE "AttendanceSubmission" ADD CONSTRAINT "AttendanceSubmission_class_fk"
  FOREIGN KEY ("classId", "schoolId") REFERENCES "ClassOffering"("id", "schoolId") ON DELETE RESTRICT ON UPDATE CASCADE;
ALTER TABLE "AttendanceSubmission" ADD CONSTRAINT "AttendanceSubmission_actor_fk"
  FOREIGN KEY ("markedBy", "schoolId") REFERENCES "User"("id", "schoolId") ON DELETE RESTRICT ON UPDATE CASCADE;

ALTER TABLE "AttendanceMark" ADD CONSTRAINT "AttendanceMark_submission_fk"
  FOREIGN KEY ("submissionId", "schoolId") REFERENCES "AttendanceSubmission"("id", "schoolId") ON DELETE RESTRICT ON UPDATE CASCADE;
ALTER TABLE "AttendanceMark" ADD CONSTRAINT "AttendanceMark_student_fk"
  FOREIGN KEY ("studentId", "schoolId") REFERENCES "Student"("id", "schoolId") ON DELETE RESTRICT ON UPDATE CASCADE;
ALTER TABLE "AttendanceMark" ADD CONSTRAINT "AttendanceMark_enrollment_fk"
  FOREIGN KEY ("enrollmentId", "schoolId") REFERENCES "Enrollment"("id", "schoolId") ON DELETE RESTRICT ON UPDATE CASCADE;

ALTER TABLE "AttendanceCorrectionRequest" ADD CONSTRAINT "AttendanceCorrectionRequest_mark_fk"
  FOREIGN KEY ("attendanceMarkId", "schoolId") REFERENCES "AttendanceMark"("id", "schoolId") ON DELETE RESTRICT ON UPDATE CASCADE;
ALTER TABLE "AttendanceCorrectionRequest" ADD CONSTRAINT "AttendanceCorrectionRequest_actor_fk"
  FOREIGN KEY ("requestedBy", "schoolId") REFERENCES "User"("id", "schoolId") ON DELETE RESTRICT ON UPDATE CASCADE;
ALTER TABLE "AttendanceCorrectionRequest" ADD CONSTRAINT "AttendanceCorrectionRequest_decider_fk"
  FOREIGN KEY ("decidedBy", "schoolId") REFERENCES "User"("id", "schoolId") ON DELETE RESTRICT ON UPDATE CASCADE;
ALTER TABLE "AttendanceCorrectionRequest" ADD CONSTRAINT "AttendanceCorrectionRequest_before_correction_fk"
  FOREIGN KEY ("beforeCorrectionId", "schoolId") REFERENCES "AttendanceCorrection"("id", "schoolId") ON DELETE RESTRICT ON UPDATE CASCADE;

ALTER TABLE "AttendanceCorrection" ADD CONSTRAINT "AttendanceCorrection_mark_fk"
  FOREIGN KEY ("attendanceMarkId", "schoolId") REFERENCES "AttendanceMark"("id", "schoolId") ON DELETE RESTRICT ON UPDATE CASCADE;
ALTER TABLE "AttendanceCorrection" ADD CONSTRAINT "AttendanceCorrection_request_fk"
  FOREIGN KEY ("requestId", "schoolId") REFERENCES "AttendanceCorrectionRequest"("id", "schoolId") ON DELETE RESTRICT ON UPDATE CASCADE;
ALTER TABLE "AttendanceCorrection" ADD CONSTRAINT "AttendanceCorrection_actor_fk"
  FOREIGN KEY ("appliedBy", "schoolId") REFERENCES "User"("id", "schoolId") ON DELETE RESTRICT ON UPDATE CASCADE;

ALTER TABLE "PromotionDecision" ADD CONSTRAINT "PromotionDecision_session_fk"
  FOREIGN KEY ("sourceSessionId", "schoolId") REFERENCES "AcademicSession"("id", "schoolId") ON DELETE RESTRICT ON UPDATE CASCADE;
ALTER TABLE "PromotionDecision" ADD CONSTRAINT "PromotionDecision_enrollment_fk"
  FOREIGN KEY ("sourceEnrollmentId", "schoolId") REFERENCES "Enrollment"("id", "schoolId") ON DELETE RESTRICT ON UPDATE CASCADE;
ALTER TABLE "PromotionDecision" ADD CONSTRAINT "PromotionDecision_student_fk"
  FOREIGN KEY ("studentId", "schoolId") REFERENCES "Student"("id", "schoolId") ON DELETE RESTRICT ON UPDATE CASCADE;
ALTER TABLE "PromotionDecision" ADD CONSTRAINT "PromotionDecision_class_fk"
  FOREIGN KEY ("sourceClassId", "schoolId") REFERENCES "ClassOffering"("id", "schoolId") ON DELETE RESTRICT ON UPDATE CASCADE;
ALTER TABLE "PromotionDecision" ADD CONSTRAINT "PromotionDecision_actor_fk"
  FOREIGN KEY ("decidedBy", "schoolId") REFERENCES "User"("id", "schoolId") ON DELETE RESTRICT ON UPDATE CASCADE;

ALTER TABLE "PromotionBatch" ADD CONSTRAINT "PromotionBatch_school_fk"
  FOREIGN KEY ("schoolId") REFERENCES "School"("id") ON DELETE RESTRICT ON UPDATE CASCADE;
ALTER TABLE "PromotionBatch" ADD CONSTRAINT "PromotionBatch_source_session_fk"
  FOREIGN KEY ("sourceSessionId", "schoolId") REFERENCES "AcademicSession"("id", "schoolId") ON DELETE RESTRICT ON UPDATE CASCADE;
ALTER TABLE "PromotionBatch" ADD CONSTRAINT "PromotionBatch_target_session_fk"
  FOREIGN KEY ("targetSessionId", "schoolId") REFERENCES "AcademicSession"("id", "schoolId") ON DELETE RESTRICT ON UPDATE CASCADE;
ALTER TABLE "PromotionBatch" ADD CONSTRAINT "PromotionBatch_actor_fk"
  FOREIGN KEY ("createdBy", "schoolId") REFERENCES "User"("id", "schoolId") ON DELETE RESTRICT ON UPDATE CASCADE;

ALTER TABLE "PromotionBatchItem" ADD CONSTRAINT "PromotionBatchItem_batch_fk"
  FOREIGN KEY ("batchId", "schoolId") REFERENCES "PromotionBatch"("id", "schoolId") ON DELETE RESTRICT ON UPDATE CASCADE;
ALTER TABLE "PromotionBatchItem" ADD CONSTRAINT "PromotionBatchItem_enrollment_fk"
  FOREIGN KEY ("sourceEnrollmentId", "schoolId") REFERENCES "Enrollment"("id", "schoolId") ON DELETE RESTRICT ON UPDATE CASCADE;
ALTER TABLE "PromotionBatchItem" ADD CONSTRAINT "PromotionBatchItem_decision_fk"
  FOREIGN KEY ("decisionId", "schoolId") REFERENCES "PromotionDecision"("id", "schoolId") ON DELETE RESTRICT ON UPDATE CASCADE;
ALTER TABLE "PromotionBatchItem" ADD CONSTRAINT "PromotionBatchItem_student_fk"
  FOREIGN KEY ("studentId", "schoolId") REFERENCES "Student"("id", "schoolId") ON DELETE RESTRICT ON UPDATE CASCADE;
ALTER TABLE "PromotionBatchItem" ADD CONSTRAINT "PromotionBatchItem_class_fk"
  FOREIGN KEY ("targetClassId", "schoolId") REFERENCES "ClassOffering"("id", "schoolId") ON DELETE RESTRICT ON UPDATE CASCADE;
ALTER TABLE "PromotionBatchItem" ADD CONSTRAINT "PromotionBatchItem_target_enrollment_fk"
  FOREIGN KEY ("targetEnrollmentId", "schoolId") REFERENCES "Enrollment"("id", "schoolId") ON DELETE RESTRICT ON UPDATE CASCADE;

CREATE FUNCTION lifecycle_history_immutable() RETURNS trigger AS $$
BEGIN
  RAISE EXCEPTION 'Submitted school history is immutable' USING ERRCODE='23514';
END;
$$ LANGUAGE plpgsql;

CREATE TRIGGER "AttendanceSubmission_immutable" BEFORE UPDATE OR DELETE ON "AttendanceSubmission"
  FOR EACH ROW EXECUTE FUNCTION lifecycle_history_immutable();
CREATE TRIGGER "AttendanceMark_immutable" BEFORE UPDATE OR DELETE ON "AttendanceMark"
  FOR EACH ROW EXECUTE FUNCTION lifecycle_history_immutable();
CREATE TRIGGER "AttendanceCorrection_immutable" BEFORE UPDATE OR DELETE ON "AttendanceCorrection"
  FOR EACH ROW EXECUTE FUNCTION lifecycle_history_immutable();
CREATE TRIGGER "PromotionDecision_immutable" BEFORE UPDATE OR DELETE ON "PromotionDecision"
  FOR EACH ROW EXECUTE FUNCTION lifecycle_history_immutable();

CREATE FUNCTION attendance_request_transition() RETURNS trigger AS $$
BEGIN
  IF TG_OP='DELETE' THEN
    RAISE EXCEPTION 'Attendance correction request history is immutable' USING ERRCODE='23514';
  END IF;
  IF OLD."status" <> 'REQUESTED' OR
     (to_jsonb(NEW) - ARRAY['status','version','decidedBy','decidedAt','decisionReason']) IS DISTINCT FROM
     (to_jsonb(OLD) - ARRAY['status','version','decidedBy','decidedAt','decisionReason']) THEN
    RAISE EXCEPTION 'Attendance correction request details are immutable' USING ERRCODE='23514';
  END IF;
  RETURN NEW;
END;
$$ LANGUAGE plpgsql;

CREATE TRIGGER "AttendanceCorrectionRequest_transition" BEFORE UPDATE OR DELETE ON "AttendanceCorrectionRequest"
  FOR EACH ROW EXECUTE FUNCTION attendance_request_transition();
