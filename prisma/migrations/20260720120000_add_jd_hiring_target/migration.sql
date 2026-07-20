ALTER TABLE "job_descriptions"
ADD COLUMN "hiring_target" INTEGER,
ADD CONSTRAINT "job_descriptions_hiring_target_range_check"
CHECK ("hiring_target" BETWEEN 1 AND 999);
