ALTER TABLE "job_descriptions"
ADD COLUMN "publish_lease_expires_at" TIMESTAMP(3);

ALTER TABLE "job_publish_tasks"
ADD COLUMN "batch_id" TEXT;

UPDATE "job_descriptions"
SET "publish_lease_expires_at" = "updated_at" + INTERVAL '10 minutes'
WHERE "status" = 'publishing';

UPDATE "job_publish_tasks" AS "task"
SET "batch_id" = "run"."batch_id"
FROM "job_description_publish_runs" AS "run"
WHERE "task"."id" = "run"."publish_task_id"
  AND "task"."user_id" = "run"."user_id"
  AND "task"."job_description_id" = "run"."job_description_id"
  AND "task"."batch_id" IS NULL;

CREATE INDEX "idx_job_descriptions_publish_lease"
ON "job_descriptions"("user_id", "status", "publish_lease_expires_at");

CREATE INDEX "idx_job_publish_tasks_user_jd_batch"
ON "job_publish_tasks"("user_id", "job_description_id", "batch_id");
