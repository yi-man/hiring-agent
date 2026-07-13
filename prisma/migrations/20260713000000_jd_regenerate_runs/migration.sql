-- JD regenerate runs decouple long-running continue_generate from the detail page.
CREATE TABLE "job_description_regenerate_runs" (
  "id" TEXT NOT NULL,
  "user_id" TEXT NOT NULL,
  "job_description_id" TEXT NOT NULL,
  "tone" TEXT NOT NULL DEFAULT 'tech',
  "extra_instruction" TEXT NOT NULL DEFAULT '',
  "current_jd" JSONB NOT NULL,
  "status" TEXT NOT NULL DEFAULT 'pending',
  "current_stage" TEXT,
  "error_message" TEXT,
  "started_at" TIMESTAMP(3),
  "finished_at" TIMESTAMP(3),
  "created_at" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
  "updated_at" TIMESTAMP(3) NOT NULL,

  CONSTRAINT "job_description_regenerate_runs_pkey" PRIMARY KEY ("id")
);

CREATE UNIQUE INDEX "job_description_regenerate_runs_id_user_id_key"
  ON "job_description_regenerate_runs"("id", "user_id");

CREATE UNIQUE INDEX "job_description_regenerate_runs_id_user_jd_key"
  ON "job_description_regenerate_runs"("id", "user_id", "job_description_id");

CREATE INDEX "idx_jd_regenerate_runs_user_jd_created"
  ON "job_description_regenerate_runs"("user_id", "job_description_id", "created_at" DESC);

CREATE INDEX "idx_jd_regenerate_runs_status_updated"
  ON "job_description_regenerate_runs"("status", "updated_at" DESC);

ALTER TABLE "job_description_regenerate_runs"
  ADD CONSTRAINT "job_description_regenerate_runs_user_id_fkey"
  FOREIGN KEY ("user_id")
  REFERENCES "users"("id")
  ON DELETE CASCADE ON UPDATE RESTRICT;

ALTER TABLE "job_description_regenerate_runs"
  ADD CONSTRAINT "job_description_regenerate_runs_job_description_id_user_id_fkey"
  FOREIGN KEY ("job_description_id", "user_id")
  REFERENCES "job_descriptions"("id", "user_id")
  ON DELETE CASCADE ON UPDATE RESTRICT;

CREATE TABLE "job_description_regenerate_run_events" (
  "id" TEXT NOT NULL,
  "user_id" TEXT NOT NULL,
  "run_id" TEXT NOT NULL,
  "job_description_id" TEXT NOT NULL,
  "stage" TEXT NOT NULL,
  "level" TEXT NOT NULL DEFAULT 'info',
  "message" TEXT NOT NULL,
  "detail" JSONB,
  "created_at" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,

  CONSTRAINT "job_description_regenerate_run_events_pkey" PRIMARY KEY ("id")
);

CREATE INDEX "idx_jd_regenerate_run_events_user_run_created"
  ON "job_description_regenerate_run_events"("user_id", "run_id", "created_at");

CREATE INDEX "idx_jd_regenerate_run_events_run_created"
  ON "job_description_regenerate_run_events"("run_id", "created_at");

ALTER TABLE "job_description_regenerate_run_events"
  ADD CONSTRAINT "job_description_regenerate_run_events_user_id_fkey"
  FOREIGN KEY ("user_id")
  REFERENCES "users"("id")
  ON DELETE CASCADE ON UPDATE RESTRICT;

ALTER TABLE "job_description_regenerate_run_events"
  ADD CONSTRAINT "job_description_regenerate_run_events_run_id_user_id_job_d_fkey"
  FOREIGN KEY ("run_id", "user_id", "job_description_id")
  REFERENCES "job_description_regenerate_runs"("id", "user_id", "job_description_id")
  ON DELETE CASCADE ON UPDATE RESTRICT;
