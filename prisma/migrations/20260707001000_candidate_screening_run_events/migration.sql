-- Candidate screening run events provide detailed, chronological execution logs per run.
CREATE TABLE "candidate_screening_run_events" (
  "id" TEXT NOT NULL,
  "user_id" TEXT NOT NULL,
  "run_id" TEXT NOT NULL,
  "job_description_id" TEXT NOT NULL,
  "candidate_id" TEXT,
  "stage" TEXT NOT NULL,
  "level" TEXT NOT NULL DEFAULT 'info',
  "message" TEXT NOT NULL,
  "detail" JSONB,
  "created_at" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,

  CONSTRAINT "candidate_screening_run_events_pkey" PRIMARY KEY ("id")
);

CREATE INDEX "idx_candidate_screening_run_events_user_run_created"
  ON "candidate_screening_run_events"("user_id", "run_id", "created_at");

CREATE INDEX "idx_candidate_screening_run_events_run_created"
  ON "candidate_screening_run_events"("run_id", "created_at");

CREATE INDEX "idx_candidate_screening_run_events_candidate_id"
  ON "candidate_screening_run_events"("candidate_id");

ALTER TABLE "candidate_screening_run_events"
  ADD CONSTRAINT "candidate_screening_run_events_run_fkey"
  FOREIGN KEY ("run_id", "user_id", "job_description_id")
  REFERENCES "candidate_screening_runs"("id", "user_id", "job_description_id")
  ON DELETE CASCADE ON UPDATE RESTRICT;
