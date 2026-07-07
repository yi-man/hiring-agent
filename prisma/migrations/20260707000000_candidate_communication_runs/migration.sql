CREATE TABLE "candidate_communication_runs" (
    "id" TEXT NOT NULL,
    "user_id" TEXT NOT NULL,
    "job_description_id" TEXT,
    "candidate_id" TEXT,
    "platform" TEXT NOT NULL,
    "mode" TEXT NOT NULL,
    "status" TEXT NOT NULL DEFAULT 'running',
    "stats" JSONB,
    "error_message" TEXT,
    "started_at" TIMESTAMP(3),
    "finished_at" TIMESTAMP(3),
    "created_at" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updated_at" TIMESTAMP(3) NOT NULL,

    CONSTRAINT "candidate_communication_runs_pkey" PRIMARY KEY ("id")
);

CREATE UNIQUE INDEX "candidate_communication_runs_id_user_id_key" ON "candidate_communication_runs"("id", "user_id");
CREATE INDEX "idx_candidate_communication_runs_user_created" ON "candidate_communication_runs"("user_id", "created_at" DESC);
CREATE INDEX "idx_candidate_communication_runs_user_jd_created" ON "candidate_communication_runs"("user_id", "job_description_id", "created_at" DESC);
CREATE INDEX "idx_candidate_communication_runs_user_candidate_created" ON "candidate_communication_runs"("user_id", "candidate_id", "created_at" DESC);
CREATE INDEX "idx_candidate_communication_runs_status_updated" ON "candidate_communication_runs"("status", "updated_at" DESC);

ALTER TABLE "candidate_communication_runs" ADD CONSTRAINT "candidate_communication_runs_user_id_fkey" FOREIGN KEY ("user_id") REFERENCES "users"("id") ON DELETE CASCADE ON UPDATE RESTRICT;
ALTER TABLE "candidate_communication_runs" ADD CONSTRAINT "candidate_communication_runs_job_description_id_user_id_fkey" FOREIGN KEY ("job_description_id", "user_id") REFERENCES "job_descriptions"("id", "user_id") ON DELETE CASCADE ON UPDATE RESTRICT;
ALTER TABLE "candidate_communication_runs" ADD CONSTRAINT "candidate_communication_runs_candidate_id_user_id_fkey" FOREIGN KEY ("candidate_id", "user_id") REFERENCES "candidates"("id", "user_id") ON DELETE CASCADE ON UPDATE RESTRICT;
