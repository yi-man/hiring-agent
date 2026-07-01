-- CreateTable
CREATE TABLE "public"."candidate_conversations" (
    "id" TEXT NOT NULL,
    "user_id" TEXT NOT NULL,
    "job_description_id" TEXT NOT NULL,
    "candidate_id" TEXT NOT NULL,
    "platform" TEXT NOT NULL,
    "stage" TEXT NOT NULL DEFAULT 'new',
    "status" TEXT NOT NULL DEFAULT 'active',
    "intent_level" TEXT,
    "message_count" INTEGER NOT NULL DEFAULT 0,
    "last_active_at" TIMESTAMP(3) NOT NULL,
    "last_candidate_message_at" TIMESTAMP(3),
    "last_agent_message_at" TIMESTAMP(3),
    "next_follow_up_at" TIMESTAMP(3),
    "outcome_result" TEXT,
    "outcome_reason" TEXT,
    "created_at" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updated_at" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,

    CONSTRAINT "candidate_conversations_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "public"."candidate_conversation_messages" (
    "id" TEXT NOT NULL,
    "conversation_id" TEXT NOT NULL,
    "user_id" TEXT NOT NULL,
    "job_description_id" TEXT NOT NULL,
    "candidate_id" TEXT NOT NULL,
    "platform" TEXT NOT NULL,
    "role" TEXT NOT NULL,
    "content" TEXT NOT NULL,
    "external_message_id" TEXT,
    "delivery_status" TEXT NOT NULL DEFAULT 'received',
    "browser_trace" JSONB,
    "error_message" TEXT,
    "occurred_at" TIMESTAMP(3) NOT NULL,
    "created_at" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,

    CONSTRAINT "candidate_conversation_messages_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "public"."candidate_conversation_decisions" (
    "id" TEXT NOT NULL,
    "conversation_id" TEXT NOT NULL,
    "user_id" TEXT NOT NULL,
    "job_description_id" TEXT NOT NULL,
    "candidate_id" TEXT NOT NULL,
    "input_message_id" TEXT NOT NULL,
    "output_message_id" TEXT,
    "intent" TEXT NOT NULL,
    "intent_level" TEXT NOT NULL,
    "next_stage" TEXT NOT NULL,
    "should_reply" BOOLEAN NOT NULL,
    "reply" TEXT,
    "actions" JSONB NOT NULL,
    "rationale" TEXT NOT NULL,
    "llm_meta" JSONB,
    "created_at" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,

    CONSTRAINT "candidate_conversation_decisions_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "public"."candidate_conversation_memories" (
    "id" TEXT NOT NULL,
    "conversation_id" TEXT NOT NULL,
    "user_id" TEXT NOT NULL,
    "job_description_id" TEXT NOT NULL,
    "candidate_id" TEXT NOT NULL,
    "outcome_result" TEXT NOT NULL,
    "outcome_reason" TEXT NOT NULL,
    "intent" JSONB NOT NULL,
    "profile_summary" JSONB NOT NULL,
    "key_points" JSONB NOT NULL,
    "drop_off_reason" TEXT,
    "next_follow_up_at" TIMESTAMP(3),
    "created_at" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,

    CONSTRAINT "candidate_conversation_memories_pkey" PRIMARY KEY ("id")
);

-- CreateIndex
CREATE UNIQUE INDEX "candidate_conversations_id_user_jd_candidate_key" ON "public"."candidate_conversations"("id", "user_id", "job_description_id", "candidate_id");

-- CreateIndex
CREATE UNIQUE INDEX "candidate_conversations_user_jd_candidate_key" ON "public"."candidate_conversations"("user_id", "job_description_id", "candidate_id");

-- CreateIndex
CREATE INDEX "idx_candidate_conversations_user_stage_updated" ON "public"."candidate_conversations"("user_id", "stage", "updated_at" DESC);

-- CreateIndex
CREATE INDEX "idx_candidate_conversations_candidate_id" ON "public"."candidate_conversations"("candidate_id");

-- CreateIndex
CREATE INDEX "idx_candidate_conversation_messages_conversation_time" ON "public"."candidate_conversation_messages"("conversation_id", "occurred_at");

-- CreateIndex
CREATE INDEX "idx_candidate_conversation_messages_user_jd_candidate_time" ON "public"."candidate_conversation_messages"("user_id", "job_description_id", "candidate_id", "occurred_at" DESC);

-- CreateIndex
CREATE INDEX "idx_candidate_conversation_messages_external" ON "public"."candidate_conversation_messages"("user_id", "platform", "external_message_id");

-- CreateIndex
CREATE INDEX "idx_candidate_conversation_decisions_conversation_created" ON "public"."candidate_conversation_decisions"("conversation_id", "created_at" DESC);

-- CreateIndex
CREATE INDEX "idx_candidate_conversation_decisions_input_message" ON "public"."candidate_conversation_decisions"("input_message_id");

-- CreateIndex
CREATE INDEX "idx_candidate_conversation_memories_conversation_created" ON "public"."candidate_conversation_memories"("conversation_id", "created_at" DESC);

-- CreateIndex
CREATE INDEX "idx_candidate_conversation_memories_user_outcome_created" ON "public"."candidate_conversation_memories"("user_id", "outcome_result", "created_at" DESC);

-- AddForeignKey
ALTER TABLE "public"."candidate_conversations" ADD CONSTRAINT "candidate_conversations_user_id_fkey" FOREIGN KEY ("user_id") REFERENCES "public"."users"("id") ON DELETE CASCADE ON UPDATE RESTRICT;

-- AddForeignKey
ALTER TABLE "public"."candidate_conversations" ADD CONSTRAINT "candidate_conversations_job_description_id_user_id_fkey" FOREIGN KEY ("job_description_id", "user_id") REFERENCES "public"."job_descriptions"("id", "user_id") ON DELETE CASCADE ON UPDATE RESTRICT;

-- AddForeignKey
ALTER TABLE "public"."candidate_conversations" ADD CONSTRAINT "candidate_conversations_candidate_id_user_id_fkey" FOREIGN KEY ("candidate_id", "user_id") REFERENCES "public"."candidates"("id", "user_id") ON DELETE CASCADE ON UPDATE RESTRICT;

-- AddForeignKey
ALTER TABLE "public"."candidate_conversation_messages" ADD CONSTRAINT "candidate_conversation_messages_conversation_id_user_jd_candidate_fkey" FOREIGN KEY ("conversation_id", "user_id", "job_description_id", "candidate_id") REFERENCES "public"."candidate_conversations"("id", "user_id", "job_description_id", "candidate_id") ON DELETE CASCADE ON UPDATE RESTRICT;

-- AddForeignKey
ALTER TABLE "public"."candidate_conversation_messages" ADD CONSTRAINT "candidate_conversation_messages_user_id_fkey" FOREIGN KEY ("user_id") REFERENCES "public"."users"("id") ON DELETE CASCADE ON UPDATE RESTRICT;

-- AddForeignKey
ALTER TABLE "public"."candidate_conversation_messages" ADD CONSTRAINT "candidate_conversation_messages_job_description_id_user_id_fkey" FOREIGN KEY ("job_description_id", "user_id") REFERENCES "public"."job_descriptions"("id", "user_id") ON DELETE CASCADE ON UPDATE RESTRICT;

-- AddForeignKey
ALTER TABLE "public"."candidate_conversation_messages" ADD CONSTRAINT "candidate_conversation_messages_candidate_id_user_id_fkey" FOREIGN KEY ("candidate_id", "user_id") REFERENCES "public"."candidates"("id", "user_id") ON DELETE CASCADE ON UPDATE RESTRICT;

-- AddForeignKey
ALTER TABLE "public"."candidate_conversation_decisions" ADD CONSTRAINT "candidate_conversation_decisions_conversation_id_user_jd_candidate_fkey" FOREIGN KEY ("conversation_id", "user_id", "job_description_id", "candidate_id") REFERENCES "public"."candidate_conversations"("id", "user_id", "job_description_id", "candidate_id") ON DELETE CASCADE ON UPDATE RESTRICT;

-- AddForeignKey
ALTER TABLE "public"."candidate_conversation_decisions" ADD CONSTRAINT "candidate_conversation_decisions_user_id_fkey" FOREIGN KEY ("user_id") REFERENCES "public"."users"("id") ON DELETE CASCADE ON UPDATE RESTRICT;

-- AddForeignKey
ALTER TABLE "public"."candidate_conversation_decisions" ADD CONSTRAINT "candidate_conversation_decisions_job_description_id_user_id_fkey" FOREIGN KEY ("job_description_id", "user_id") REFERENCES "public"."job_descriptions"("id", "user_id") ON DELETE CASCADE ON UPDATE RESTRICT;

-- AddForeignKey
ALTER TABLE "public"."candidate_conversation_decisions" ADD CONSTRAINT "candidate_conversation_decisions_candidate_id_user_id_fkey" FOREIGN KEY ("candidate_id", "user_id") REFERENCES "public"."candidates"("id", "user_id") ON DELETE CASCADE ON UPDATE RESTRICT;

-- AddForeignKey
ALTER TABLE "public"."candidate_conversation_memories" ADD CONSTRAINT "candidate_conversation_memories_conversation_id_user_jd_candidate_fkey" FOREIGN KEY ("conversation_id", "user_id", "job_description_id", "candidate_id") REFERENCES "public"."candidate_conversations"("id", "user_id", "job_description_id", "candidate_id") ON DELETE CASCADE ON UPDATE RESTRICT;

-- AddForeignKey
ALTER TABLE "public"."candidate_conversation_memories" ADD CONSTRAINT "candidate_conversation_memories_user_id_fkey" FOREIGN KEY ("user_id") REFERENCES "public"."users"("id") ON DELETE CASCADE ON UPDATE RESTRICT;

-- AddForeignKey
ALTER TABLE "public"."candidate_conversation_memories" ADD CONSTRAINT "candidate_conversation_memories_job_description_id_user_id_fkey" FOREIGN KEY ("job_description_id", "user_id") REFERENCES "public"."job_descriptions"("id", "user_id") ON DELETE CASCADE ON UPDATE RESTRICT;

-- AddForeignKey
ALTER TABLE "public"."candidate_conversation_memories" ADD CONSTRAINT "candidate_conversation_memories_candidate_id_user_id_fkey" FOREIGN KEY ("candidate_id", "user_id") REFERENCES "public"."candidates"("id", "user_id") ON DELETE CASCADE ON UPDATE RESTRICT;
