ALTER TABLE "job_descriptions"
ADD COLUMN "active_publish_batch_id" TEXT;

ALTER TABLE "job_description_publish_runs"
ADD COLUMN "batch_id" TEXT;

UPDATE "job_description_publish_runs"
SET "batch_id" = "id"
WHERE "batch_id" IS NULL;

ALTER TABLE "job_description_publish_runs"
ALTER COLUMN "batch_id" SET NOT NULL;

CREATE INDEX "idx_jd_publish_runs_user_jd_batch"
ON "job_description_publish_runs"("user_id", "job_description_id", "batch_id");
