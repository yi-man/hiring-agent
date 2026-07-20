ALTER TABLE "public"."job_description_publish_runs"
ALTER COLUMN "batch_id" SET DEFAULT gen_random_uuid()::text;

WITH "latest_publish_runs" AS (
    SELECT DISTINCT ON ("user_id", "job_description_id")
        "user_id",
        "job_description_id",
        "batch_id"
    FROM "public"."job_description_publish_runs"
    ORDER BY
        "user_id",
        "job_description_id",
        CASE
            WHEN "status" = 'success' THEN 0
            WHEN "status" IN ('pending', 'running') THEN 1
            ELSE 2
        END,
        "created_at" DESC,
        "id" DESC
)
UPDATE "public"."job_descriptions" AS "job_description"
SET "active_publish_batch_id" = "latest_publish_run"."batch_id"
FROM "latest_publish_runs" AS "latest_publish_run"
WHERE "job_description"."status" = 'publishing'
  AND "job_description"."active_publish_batch_id" IS NULL
  AND "job_description"."user_id" = "latest_publish_run"."user_id"
  AND "job_description"."id" = "latest_publish_run"."job_description_id";
