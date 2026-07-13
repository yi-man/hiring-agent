-- AlterTable
ALTER TABLE "public"."candidate_conversations" ALTER COLUMN "updated_at" DROP DEFAULT;

-- CreateTable
CREATE TABLE "public"."job_description_publish_runs" (
    "id" TEXT NOT NULL,
    "user_id" TEXT NOT NULL,
    "job_description_id" TEXT NOT NULL,
    "platform" TEXT NOT NULL,
    "status" TEXT NOT NULL DEFAULT 'pending',
    "current_stage" TEXT,
    "error_message" TEXT,
    "publish_task_id" TEXT,
    "skill_id" TEXT,
    "started_at" TIMESTAMP(3),
    "finished_at" TIMESTAMP(3),
    "created_at" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updated_at" TIMESTAMP(3) NOT NULL,

    CONSTRAINT "job_description_publish_runs_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "public"."job_description_publish_run_events" (
    "id" TEXT NOT NULL,
    "user_id" TEXT NOT NULL,
    "run_id" TEXT NOT NULL,
    "stage" TEXT NOT NULL,
    "level" TEXT NOT NULL DEFAULT 'info',
    "message" TEXT NOT NULL,
    "detail" JSONB,
    "created_at" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,

    CONSTRAINT "job_description_publish_run_events_pkey" PRIMARY KEY ("id")
);

-- CreateIndex
CREATE INDEX "idx_jd_publish_runs_user_created" ON "public"."job_description_publish_runs"("user_id", "created_at" DESC);

-- CreateIndex
CREATE INDEX "idx_jd_publish_runs_user_jd_created" ON "public"."job_description_publish_runs"("user_id", "job_description_id", "created_at" DESC);

-- CreateIndex
CREATE INDEX "idx_jd_publish_runs_status_updated" ON "public"."job_description_publish_runs"("status", "updated_at" DESC);

-- CreateIndex
CREATE UNIQUE INDEX "job_description_publish_runs_id_user_id_key" ON "public"."job_description_publish_runs"("id", "user_id");

-- CreateIndex
CREATE INDEX "idx_jd_publish_run_events_user_run_created" ON "public"."job_description_publish_run_events"("user_id", "run_id", "created_at");

-- CreateIndex
CREATE INDEX "idx_jd_publish_run_events_run_created" ON "public"."job_description_publish_run_events"("run_id", "created_at");

-- RenameForeignKey
ALTER TABLE "public"."candidate_action_logs" RENAME CONSTRAINT "candidate_action_logs_screening_result_user_jd_candidate_fkey" TO "candidate_action_logs_screening_result_id_user_id_job_desc_fkey";

-- RenameForeignKey
ALTER TABLE "public"."candidate_conversation_decisions" RENAME CONSTRAINT "candidate_conversation_decisions_conversation_id_user_jd_candid" TO "candidate_conversation_decisions_conversation_id_user_id_j_fkey";

-- RenameForeignKey
ALTER TABLE "public"."candidate_conversation_decisions" RENAME CONSTRAINT "candidate_conversation_decisions_job_description_id_user_id_fke" TO "candidate_conversation_decisions_job_description_id_user_i_fkey";

-- RenameForeignKey
ALTER TABLE "public"."candidate_conversation_memories" RENAME CONSTRAINT "candidate_conversation_memories_conversation_id_user_jd_candida" TO "candidate_conversation_memories_conversation_id_user_id_jo_fkey";

-- RenameForeignKey
ALTER TABLE "public"."candidate_conversation_messages" RENAME CONSTRAINT "candidate_conversation_messages_conversation_id_user_jd_candida" TO "candidate_conversation_messages_conversation_id_user_id_jo_fkey";

-- RenameForeignKey
ALTER TABLE "public"."candidate_screening_run_events" RENAME CONSTRAINT "candidate_screening_run_events_run_fkey" TO "candidate_screening_run_events_run_id_user_id_job_descript_fkey";

-- RenameForeignKey
ALTER TABLE "public"."job_description_create_run_events" RENAME CONSTRAINT "job_description_create_run_events_run_fkey" TO "job_description_create_run_events_run_id_user_id_fkey";

-- RenameForeignKey
ALTER TABLE "public"."job_description_create_runs" RENAME CONSTRAINT "job_description_create_runs_job_description_fkey" TO "job_description_create_runs_job_description_id_user_id_fkey";

-- AddForeignKey
ALTER TABLE "public"."job_description_publish_runs" ADD CONSTRAINT "job_description_publish_runs_user_id_fkey" FOREIGN KEY ("user_id") REFERENCES "public"."users"("id") ON DELETE CASCADE ON UPDATE RESTRICT;

-- AddForeignKey
ALTER TABLE "public"."job_description_publish_runs" ADD CONSTRAINT "job_description_publish_runs_job_description_id_user_id_fkey" FOREIGN KEY ("job_description_id", "user_id") REFERENCES "public"."job_descriptions"("id", "user_id") ON DELETE CASCADE ON UPDATE RESTRICT;

-- AddForeignKey
ALTER TABLE "public"."job_description_publish_run_events" ADD CONSTRAINT "job_description_publish_run_events_user_id_fkey" FOREIGN KEY ("user_id") REFERENCES "public"."users"("id") ON DELETE CASCADE ON UPDATE RESTRICT;

-- AddForeignKey
ALTER TABLE "public"."job_description_publish_run_events" ADD CONSTRAINT "job_description_publish_run_events_run_id_user_id_fkey" FOREIGN KEY ("run_id", "user_id") REFERENCES "public"."job_description_publish_runs"("id", "user_id") ON DELETE CASCADE ON UPDATE RESTRICT;
