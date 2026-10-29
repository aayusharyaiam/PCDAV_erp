-- Rename index on Family to Family_id_school_unique to match schema map
DO $$
BEGIN
  IF EXISTS (SELECT 1 FROM pg_indexes WHERE indexname = 'Family_id_schoolId_key') THEN
    ALTER INDEX "Family_id_schoolId_key" RENAME TO "Family_id_school_unique";
  ELSIF NOT EXISTS (SELECT 1 FROM pg_indexes WHERE indexname = 'Family_id_school_unique') THEN
    CREATE UNIQUE INDEX "Family_id_school_unique" ON "Family"("id", "schoolId");
  END IF;
END $$;
