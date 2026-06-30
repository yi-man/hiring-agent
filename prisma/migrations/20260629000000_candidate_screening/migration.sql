CREATE EXTENSION IF NOT EXISTS vector;

-- CreateTable
CREATE TABLE "public"."candidates" (
    "id" TEXT NOT NULL,
    "user_id" TEXT NOT NULL,
    "display_name" TEXT NOT NULL,
    "current_title" TEXT,
    "current_company" TEXT,
    "location" TEXT,
    "experience_years" DOUBLE PRECISION,
    "source_platform" TEXT NOT NULL,
    "platform_candidate_id" TEXT,
    "profile_url" TEXT,
    "identity_key" TEXT NOT NULL,
    "identity_hash" TEXT NOT NULL,
    "last_active_at" TIMESTAMP(3),
    "contacted" BOOLEAN NOT NULL DEFAULT false,
    "replied" BOOLEAN NOT NULL DEFAULT false,
    "last_contact_at" TIMESTAMP(3),
    "created_at" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updated_at" TIMESTAMP(3) NOT NULL,

    CONSTRAINT "candidates_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "public"."candidate_resumes" (
    "id" TEXT NOT NULL,
    "user_id" TEXT NOT NULL,
    "candidate_id" TEXT NOT NULL,
    "source_platform" TEXT NOT NULL,
    "profile_url" TEXT,
    "raw_text" TEXT NOT NULL,
    "structured_summary" JSONB,
    "resume_hash" TEXT NOT NULL,
    "fetched_at" TIMESTAMP(3) NOT NULL,
    "created_at" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,

    CONSTRAINT "candidate_resumes_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "public"."candidate_resume_chunks" (
    "id" TEXT NOT NULL,
    "user_id" TEXT NOT NULL,
    "candidate_id" TEXT NOT NULL,
    "resume_id" TEXT NOT NULL,
    "chunk_index" INTEGER NOT NULL,
    "content" TEXT NOT NULL,
    "token_estimate" INTEGER,
    "embedding_model" TEXT NOT NULL,
    "embedding_dimension" INTEGER NOT NULL,
    "embedding" vector,
    "created_at" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,

    CONSTRAINT "candidate_resume_chunks_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "public"."candidate_screening_runs" (
    "id" TEXT NOT NULL,
    "user_id" TEXT NOT NULL,
    "job_description_id" TEXT NOT NULL,
    "platform" TEXT NOT NULL,
    "mode" TEXT NOT NULL DEFAULT 'dry_run',
    "status" TEXT NOT NULL DEFAULT 'pending',
    "current_stage" TEXT,
    "search_plan" JSONB,
    "evaluation_schema" JSONB,
    "stats" JSONB,
    "error_message" TEXT,
    "started_at" TIMESTAMP(3),
    "finished_at" TIMESTAMP(3),
    "created_at" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updated_at" TIMESTAMP(3) NOT NULL,

    CONSTRAINT "candidate_screening_runs_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "public"."candidate_screening_results" (
    "id" TEXT NOT NULL,
    "user_id" TEXT NOT NULL,
    "run_id" TEXT NOT NULL,
    "job_description_id" TEXT NOT NULL,
    "candidate_id" TEXT NOT NULL,
    "resume_id" TEXT,
    "source" TEXT NOT NULL,
    "tags" JSONB NOT NULL,
    "score_detail" JSONB NOT NULL,
    "final_score" DOUBLE PRECISION NOT NULL,
    "rank" INTEGER NOT NULL,
    "decision_action" TEXT NOT NULL,
    "decision_priority" TEXT NOT NULL,
    "decision_reason" TEXT NOT NULL,
    "action_plan" JSONB,
    "action_status" TEXT NOT NULL DEFAULT 'planned',
    "interview_stage" TEXT NOT NULL DEFAULT 'screened',
    "notes" TEXT,
    "created_at" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updated_at" TIMESTAMP(3) NOT NULL,

    CONSTRAINT "candidate_screening_results_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "public"."candidate_action_logs" (
    "id" TEXT NOT NULL,
    "user_id" TEXT NOT NULL,
    "run_id" TEXT NOT NULL,
    "screening_result_id" TEXT NOT NULL,
    "candidate_id" TEXT NOT NULL,
    "job_description_id" TEXT NOT NULL,
    "platform" TEXT NOT NULL,
    "mode" TEXT NOT NULL,
    "action" TEXT NOT NULL,
    "message" TEXT,
    "status" TEXT NOT NULL,
    "idempotency_key" TEXT NOT NULL,
    "browser_trace" JSONB,
    "error_message" TEXT,
    "created_at" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updated_at" TIMESTAMP(3) NOT NULL,

    CONSTRAINT "candidate_action_logs_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "public"."candidate_tag_stats" (
    "id" TEXT NOT NULL,
    "user_id" TEXT NOT NULL,
    "tag_type" TEXT NOT NULL,
    "tag" TEXT NOT NULL,
    "seen" INTEGER NOT NULL DEFAULT 0,
    "chatted" INTEGER NOT NULL DEFAULT 0,
    "replied" INTEGER NOT NULL DEFAULT 0,
    "created_at" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updated_at" TIMESTAMP(3) NOT NULL,

    CONSTRAINT "candidate_tag_stats_pkey" PRIMARY KEY ("id")
);

-- CreateIndex
CREATE INDEX "idx_candidates_user_updated_at" ON "public"."candidates"("user_id", "updated_at" DESC);

-- CreateIndex
CREATE INDEX "idx_candidates_user_contacted_replied" ON "public"."candidates"("user_id", "contacted", "replied");

-- CreateIndex
CREATE UNIQUE INDEX "candidates_id_user_id_key" ON "public"."candidates"("id", "user_id");

-- CreateIndex
CREATE UNIQUE INDEX "candidates_user_source_identity_hash_key" ON "public"."candidates"("user_id", "source_platform", "identity_hash");

-- CreateIndex
CREATE INDEX "idx_candidate_resumes_candidate_id" ON "public"."candidate_resumes"("candidate_id");

-- CreateIndex
CREATE INDEX "idx_candidate_resumes_user_candidate_fetched" ON "public"."candidate_resumes"("user_id", "candidate_id", "fetched_at" DESC);

-- CreateIndex
CREATE UNIQUE INDEX "candidate_resumes_id_user_id_key" ON "public"."candidate_resumes"("id", "user_id");

-- CreateIndex
CREATE UNIQUE INDEX "candidate_resumes_id_candidate_user_key" ON "public"."candidate_resumes"("id", "candidate_id", "user_id");

-- CreateIndex
CREATE UNIQUE INDEX "candidate_resumes_candidate_hash_key" ON "public"."candidate_resumes"("candidate_id", "resume_hash");

-- CreateIndex
CREATE INDEX "idx_candidate_resume_chunks_candidate_id" ON "public"."candidate_resume_chunks"("candidate_id");

-- CreateIndex
CREATE INDEX "idx_candidate_resume_chunks_user_embedding" ON "public"."candidate_resume_chunks"("user_id", "embedding_model", "embedding_dimension");

-- CreateIndex
CREATE UNIQUE INDEX "candidate_resume_chunks_resume_chunk_key" ON "public"."candidate_resume_chunks"("resume_id", "chunk_index");

-- CreateIndex
CREATE INDEX "idx_candidate_screening_runs_user_jd_created" ON "public"."candidate_screening_runs"("user_id", "job_description_id", "created_at" DESC);

-- CreateIndex
CREATE INDEX "idx_candidate_screening_runs_status_updated" ON "public"."candidate_screening_runs"("status", "updated_at" DESC);

-- CreateIndex
CREATE UNIQUE INDEX "candidate_screening_runs_id_user_id_key" ON "public"."candidate_screening_runs"("id", "user_id");

-- CreateIndex
CREATE UNIQUE INDEX "candidate_screening_runs_id_user_jd_key" ON "public"."candidate_screening_runs"("id", "user_id", "job_description_id");

-- CreateIndex
CREATE INDEX "idx_candidate_screening_results_run_id" ON "public"."candidate_screening_results"("run_id");

-- CreateIndex
CREATE INDEX "idx_candidate_screening_results_candidate_id" ON "public"."candidate_screening_results"("candidate_id");

-- CreateIndex
CREATE INDEX "idx_candidate_screening_results_user_jd_score" ON "public"."candidate_screening_results"("user_id", "job_description_id", "final_score" DESC);

-- CreateIndex
CREATE INDEX "idx_candidate_screening_results_user_jd_stage" ON "public"."candidate_screening_results"("user_id", "job_description_id", "interview_stage");

-- CreateIndex
CREATE UNIQUE INDEX "candidate_screening_results_id_user_id_key" ON "public"."candidate_screening_results"("id", "user_id");

-- CreateIndex
CREATE UNIQUE INDEX "candidate_screening_results_id_user_run_jd_candidate_key" ON "public"."candidate_screening_results"("id", "user_id", "run_id", "job_description_id", "candidate_id");

-- CreateIndex
CREATE UNIQUE INDEX "candidate_screening_results_id_user_jd_candidate_key" ON "public"."candidate_screening_results"("id", "user_id", "job_description_id", "candidate_id");

-- CreateIndex
CREATE UNIQUE INDEX "candidate_screening_results_jd_candidate_key" ON "public"."candidate_screening_results"("job_description_id", "candidate_id");

-- CreateIndex
CREATE INDEX "idx_candidate_action_logs_run_id" ON "public"."candidate_action_logs"("run_id");

-- CreateIndex
CREATE INDEX "idx_candidate_action_logs_screening_result_id" ON "public"."candidate_action_logs"("screening_result_id");

-- CreateIndex
CREATE INDEX "idx_candidate_action_logs_candidate_id" ON "public"."candidate_action_logs"("candidate_id");

-- CreateIndex
CREATE INDEX "idx_candidate_action_logs_user_jd_candidate_created" ON "public"."candidate_action_logs"("user_id", "job_description_id", "candidate_id", "created_at" DESC);

-- CreateIndex
CREATE UNIQUE INDEX "candidate_action_logs_user_idempotency_key" ON "public"."candidate_action_logs"("user_id", "idempotency_key");

-- CreateIndex
CREATE UNIQUE INDEX "candidate_tag_stats_user_type_tag_key" ON "public"."candidate_tag_stats"("user_id", "tag_type", "tag");

-- CreateIndex
CREATE UNIQUE INDEX "job_descriptions_id_user_id_key" ON "public"."job_descriptions"("id", "user_id");

-- AddForeignKey
ALTER TABLE "public"."candidates" ADD CONSTRAINT "candidates_user_id_fkey" FOREIGN KEY ("user_id") REFERENCES "public"."users"("id") ON DELETE CASCADE ON UPDATE RESTRICT;

-- AddForeignKey
ALTER TABLE "public"."candidate_resumes" ADD CONSTRAINT "candidate_resumes_user_id_fkey" FOREIGN KEY ("user_id") REFERENCES "public"."users"("id") ON DELETE CASCADE ON UPDATE RESTRICT;

-- AddForeignKey
ALTER TABLE "public"."candidate_resumes" ADD CONSTRAINT "candidate_resumes_candidate_id_user_id_fkey" FOREIGN KEY ("candidate_id", "user_id") REFERENCES "public"."candidates"("id", "user_id") ON DELETE CASCADE ON UPDATE RESTRICT;

-- AddForeignKey
ALTER TABLE "public"."candidate_resume_chunks" ADD CONSTRAINT "candidate_resume_chunks_user_id_fkey" FOREIGN KEY ("user_id") REFERENCES "public"."users"("id") ON DELETE CASCADE ON UPDATE RESTRICT;

-- AddForeignKey
ALTER TABLE "public"."candidate_resume_chunks" ADD CONSTRAINT "candidate_resume_chunks_candidate_id_user_id_fkey" FOREIGN KEY ("candidate_id", "user_id") REFERENCES "public"."candidates"("id", "user_id") ON DELETE CASCADE ON UPDATE RESTRICT;

-- AddForeignKey
ALTER TABLE "public"."candidate_resume_chunks" ADD CONSTRAINT "candidate_resume_chunks_resume_id_candidate_id_user_id_fkey" FOREIGN KEY ("resume_id", "candidate_id", "user_id") REFERENCES "public"."candidate_resumes"("id", "candidate_id", "user_id") ON DELETE CASCADE ON UPDATE RESTRICT;

-- AddForeignKey
ALTER TABLE "public"."candidate_screening_runs" ADD CONSTRAINT "candidate_screening_runs_user_id_fkey" FOREIGN KEY ("user_id") REFERENCES "public"."users"("id") ON DELETE CASCADE ON UPDATE RESTRICT;

-- AddForeignKey
ALTER TABLE "public"."candidate_screening_runs" ADD CONSTRAINT "candidate_screening_runs_job_description_id_user_id_fkey" FOREIGN KEY ("job_description_id", "user_id") REFERENCES "public"."job_descriptions"("id", "user_id") ON DELETE CASCADE ON UPDATE RESTRICT;

-- AddForeignKey
ALTER TABLE "public"."candidate_screening_results" ADD CONSTRAINT "candidate_screening_results_user_id_fkey" FOREIGN KEY ("user_id") REFERENCES "public"."users"("id") ON DELETE CASCADE ON UPDATE RESTRICT;

-- AddForeignKey
ALTER TABLE "public"."candidate_screening_results" ADD CONSTRAINT "candidate_screening_results_run_id_user_id_job_description_fkey" FOREIGN KEY ("run_id", "user_id", "job_description_id") REFERENCES "public"."candidate_screening_runs"("id", "user_id", "job_description_id") ON DELETE CASCADE ON UPDATE RESTRICT;

-- AddForeignKey
ALTER TABLE "public"."candidate_screening_results" ADD CONSTRAINT "candidate_screening_results_job_description_id_user_id_fkey" FOREIGN KEY ("job_description_id", "user_id") REFERENCES "public"."job_descriptions"("id", "user_id") ON DELETE CASCADE ON UPDATE RESTRICT;

-- AddForeignKey
ALTER TABLE "public"."candidate_screening_results" ADD CONSTRAINT "candidate_screening_results_candidate_id_user_id_fkey" FOREIGN KEY ("candidate_id", "user_id") REFERENCES "public"."candidates"("id", "user_id") ON DELETE CASCADE ON UPDATE RESTRICT;

-- AddForeignKey
ALTER TABLE "public"."candidate_screening_results" ADD CONSTRAINT "candidate_screening_results_resume_id_candidate_id_user_id_fkey" FOREIGN KEY ("resume_id", "candidate_id", "user_id") REFERENCES "public"."candidate_resumes"("id", "candidate_id", "user_id") ON DELETE RESTRICT ON UPDATE RESTRICT;

-- AddForeignKey
ALTER TABLE "public"."candidate_action_logs" ADD CONSTRAINT "candidate_action_logs_user_id_fkey" FOREIGN KEY ("user_id") REFERENCES "public"."users"("id") ON DELETE CASCADE ON UPDATE RESTRICT;

-- AddForeignKey
ALTER TABLE "public"."candidate_action_logs" ADD CONSTRAINT "candidate_action_logs_run_id_user_id_job_description_id_fkey" FOREIGN KEY ("run_id", "user_id", "job_description_id") REFERENCES "public"."candidate_screening_runs"("id", "user_id", "job_description_id") ON DELETE CASCADE ON UPDATE RESTRICT;

-- AddForeignKey
ALTER TABLE "public"."candidate_action_logs" ADD CONSTRAINT "candidate_action_logs_screening_result_user_jd_candidate_fkey" FOREIGN KEY ("screening_result_id", "user_id", "job_description_id", "candidate_id") REFERENCES "public"."candidate_screening_results"("id", "user_id", "job_description_id", "candidate_id") ON DELETE CASCADE ON UPDATE RESTRICT;

-- AddForeignKey
ALTER TABLE "public"."candidate_action_logs" ADD CONSTRAINT "candidate_action_logs_candidate_id_user_id_fkey" FOREIGN KEY ("candidate_id", "user_id") REFERENCES "public"."candidates"("id", "user_id") ON DELETE CASCADE ON UPDATE RESTRICT;

-- AddForeignKey
ALTER TABLE "public"."candidate_action_logs" ADD CONSTRAINT "candidate_action_logs_job_description_id_user_id_fkey" FOREIGN KEY ("job_description_id", "user_id") REFERENCES "public"."job_descriptions"("id", "user_id") ON DELETE CASCADE ON UPDATE RESTRICT;

-- AddForeignKey
ALTER TABLE "public"."candidate_tag_stats" ADD CONSTRAINT "candidate_tag_stats_user_id_fkey" FOREIGN KEY ("user_id") REFERENCES "public"."users"("id") ON DELETE CASCADE ON UPDATE RESTRICT;
