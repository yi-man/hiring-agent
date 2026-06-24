-- CreateSchema
CREATE SCHEMA IF NOT EXISTS "public";

-- CreateTable
CREATE TABLE "public"."conversations" (
    "id" TEXT NOT NULL,
    "user_id" TEXT,
    "title" TEXT,
    "status" TEXT NOT NULL DEFAULT 'active',
    "last_active_at" TIMESTAMP(3) NOT NULL,
    "created_at" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updated_at" TIMESTAMP(3) NOT NULL,

    CONSTRAINT "conversations_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "public"."users" (
    "id" TEXT NOT NULL,
    "username" TEXT NOT NULL,
    "password_hash" TEXT NOT NULL,
    "name" TEXT,
    "email" TEXT,
    "email_verified" TIMESTAMP(3),
    "image" TEXT,

    CONSTRAINT "users_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "public"."sessions" (
    "id" TEXT NOT NULL,
    "session_token" TEXT NOT NULL,
    "user_id" TEXT NOT NULL,
    "expires" TIMESTAMP(3) NOT NULL,

    CONSTRAINT "sessions_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "public"."messages" (
    "id" TEXT NOT NULL,
    "conversation_id" TEXT NOT NULL,
    "role" TEXT NOT NULL,
    "content" TEXT NOT NULL,
    "document_id" TEXT,
    "seq" INTEGER NOT NULL,
    "token_count" INTEGER,
    "created_at" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,

    CONSTRAINT "messages_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "public"."conversation_documents" (
    "id" TEXT NOT NULL,
    "conversation_id" TEXT NOT NULL,
    "filename" TEXT NOT NULL,
    "content_markdown" TEXT NOT NULL,
    "status" TEXT NOT NULL DEFAULT 'processing',
    "error_message" TEXT,
    "version" INTEGER NOT NULL DEFAULT 1,
    "created_at" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updated_at" TIMESTAMP(3) NOT NULL,

    CONSTRAINT "conversation_documents_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "public"."conversation_document_chunks" (
    "id" TEXT NOT NULL,
    "document_id" TEXT NOT NULL,
    "conversation_id" TEXT NOT NULL,
    "chunk_index" INTEGER NOT NULL,
    "content" TEXT NOT NULL,
    "token_estimate" INTEGER,
    "qdrant_point_id" TEXT,
    "created_at" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,

    CONSTRAINT "conversation_document_chunks_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "public"."conversation_document_index_jobs" (
    "id" TEXT NOT NULL,
    "document_id" TEXT NOT NULL,
    "status" TEXT NOT NULL DEFAULT 'pending',
    "attempts" INTEGER NOT NULL DEFAULT 0,
    "last_error" TEXT,
    "started_at" TIMESTAMP(3),
    "finished_at" TIMESTAMP(3),
    "created_at" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updated_at" TIMESTAMP(3) NOT NULL,

    CONSTRAINT "conversation_document_index_jobs_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "public"."llm_call_logs" (
    "id" TEXT NOT NULL,
    "call_id" TEXT,
    "trace_id" TEXT,
    "request_id" TEXT,
    "endpoint" TEXT NOT NULL,
    "provider" TEXT NOT NULL,
    "model" TEXT NOT NULL,
    "request_headers" JSONB NOT NULL,
    "request_payload" JSONB NOT NULL,
    "response_payload" JSONB,
    "input_tokens" INTEGER NOT NULL,
    "output_tokens" INTEGER NOT NULL,
    "total_tokens" INTEGER NOT NULL,
    "latency_ms" INTEGER NOT NULL,
    "http_status" INTEGER,
    "is_error" BOOLEAN NOT NULL DEFAULT false,
    "error_domain" TEXT,
    "error_code" TEXT,
    "provider_status" TEXT,
    "retry_count" INTEGER NOT NULL DEFAULT 0,
    "final_outcome" TEXT NOT NULL,
    "timestamp" TIMESTAMP(3) NOT NULL,
    "created_at" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,

    CONSTRAINT "llm_call_logs_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "public"."llm_usage_stats_daily" (
    "id" TEXT NOT NULL,
    "bucket_date" DATE NOT NULL,
    "provider" TEXT NOT NULL,
    "model" TEXT NOT NULL,
    "endpoint" TEXT NOT NULL,
    "total_calls" INTEGER NOT NULL DEFAULT 0,
    "success_calls" INTEGER NOT NULL DEFAULT 0,
    "error_calls" INTEGER NOT NULL DEFAULT 0,
    "input_tokens" INTEGER NOT NULL DEFAULT 0,
    "output_tokens" INTEGER NOT NULL DEFAULT 0,
    "total_tokens" INTEGER NOT NULL DEFAULT 0,
    "avg_latency_ms" DOUBLE PRECISION NOT NULL DEFAULT 0,
    "created_at" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updated_at" TIMESTAMP(3) NOT NULL,

    CONSTRAINT "llm_usage_stats_daily_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "public"."llm_usage_stats_weekly" (
    "id" TEXT NOT NULL,
    "bucket_week" DATE NOT NULL,
    "provider" TEXT NOT NULL,
    "model" TEXT NOT NULL,
    "endpoint" TEXT NOT NULL,
    "total_calls" INTEGER NOT NULL DEFAULT 0,
    "success_calls" INTEGER NOT NULL DEFAULT 0,
    "error_calls" INTEGER NOT NULL DEFAULT 0,
    "input_tokens" INTEGER NOT NULL DEFAULT 0,
    "output_tokens" INTEGER NOT NULL DEFAULT 0,
    "total_tokens" INTEGER NOT NULL DEFAULT 0,
    "avg_latency_ms" DOUBLE PRECISION NOT NULL DEFAULT 0,
    "created_at" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updated_at" TIMESTAMP(3) NOT NULL,

    CONSTRAINT "llm_usage_stats_weekly_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "public"."llm_usage_stats_total" (
    "id" TEXT NOT NULL,
    "provider" TEXT NOT NULL,
    "model" TEXT NOT NULL,
    "endpoint" TEXT NOT NULL,
    "total_calls" INTEGER NOT NULL DEFAULT 0,
    "success_calls" INTEGER NOT NULL DEFAULT 0,
    "error_calls" INTEGER NOT NULL DEFAULT 0,
    "input_tokens" INTEGER NOT NULL DEFAULT 0,
    "output_tokens" INTEGER NOT NULL DEFAULT 0,
    "total_tokens" INTEGER NOT NULL DEFAULT 0,
    "avg_latency_ms" DOUBLE PRECISION NOT NULL DEFAULT 0,
    "created_at" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updated_at" TIMESTAMP(3) NOT NULL,

    CONSTRAINT "llm_usage_stats_total_pkey" PRIMARY KEY ("id")
);

-- CreateIndex
CREATE INDEX "conversations_last_active_at_idx" ON "public"."conversations"("last_active_at" DESC);

-- CreateIndex
CREATE INDEX "idx_conversations_user_id" ON "public"."conversations"("user_id");

-- CreateIndex
CREATE UNIQUE INDEX "users_username_key" ON "public"."users"("username");

-- CreateIndex
CREATE UNIQUE INDEX "users_email_key" ON "public"."users"("email");

-- CreateIndex
CREATE UNIQUE INDEX "sessions_session_token_key" ON "public"."sessions"("session_token");

-- CreateIndex
CREATE INDEX "idx_sessions_user_id" ON "public"."sessions"("user_id");

-- CreateIndex
CREATE INDEX "idx_messages_conversation_seq" ON "public"."messages"("conversation_id", "seq");

-- CreateIndex
CREATE UNIQUE INDEX "messages_conversation_id_seq_key" ON "public"."messages"("conversation_id", "seq");

-- CreateIndex
CREATE INDEX "idx_conversation_documents_conversation_id" ON "public"."conversation_documents"("conversation_id");

-- CreateIndex
CREATE INDEX "idx_conversation_documents_status" ON "public"."conversation_documents"("status");

-- CreateIndex
CREATE UNIQUE INDEX "conversation_documents_id_conversation_id_key" ON "public"."conversation_documents"("id", "conversation_id");

-- CreateIndex
CREATE UNIQUE INDEX "conversation_document_chunks_qdrant_point_id_key" ON "public"."conversation_document_chunks"("qdrant_point_id");

-- CreateIndex
CREATE INDEX "idx_conversation_document_chunks_document_id" ON "public"."conversation_document_chunks"("document_id");

-- CreateIndex
CREATE INDEX "idx_conversation_document_chunks_conversation_id" ON "public"."conversation_document_chunks"("conversation_id");

-- CreateIndex
CREATE INDEX "idx_conversation_document_chunks_conversation_chunk_index" ON "public"."conversation_document_chunks"("conversation_id", "chunk_index");

-- CreateIndex
CREATE UNIQUE INDEX "conversation_document_chunks_document_id_chunk_index_key" ON "public"."conversation_document_chunks"("document_id", "chunk_index");

-- CreateIndex
CREATE INDEX "idx_conversation_document_index_jobs_document_id" ON "public"."conversation_document_index_jobs"("document_id");

-- CreateIndex
CREATE INDEX "idx_conversation_document_index_jobs_status" ON "public"."conversation_document_index_jobs"("status");

-- CreateIndex
CREATE INDEX "idx_llm_call_logs_timestamp" ON "public"."llm_call_logs"("timestamp");

-- CreateIndex
CREATE INDEX "idx_llm_call_logs_is_error_timestamp" ON "public"."llm_call_logs"("is_error", "timestamp");

-- CreateIndex
CREATE INDEX "idx_llm_call_logs_provider_model_timestamp" ON "public"."llm_call_logs"("provider", "model", "timestamp");

-- CreateIndex
CREATE INDEX "idx_llm_call_logs_endpoint_timestamp" ON "public"."llm_call_logs"("endpoint", "timestamp");

-- CreateIndex
CREATE UNIQUE INDEX "llm_call_logs_call_id_key" ON "public"."llm_call_logs"("call_id");

-- CreateIndex
CREATE UNIQUE INDEX "llm_call_logs_provider_request_id_key" ON "public"."llm_call_logs"("provider", "request_id");

-- CreateIndex
CREATE INDEX "idx_llm_usage_stats_daily_bucket_date" ON "public"."llm_usage_stats_daily"("bucket_date");

-- CreateIndex
CREATE UNIQUE INDEX "llm_usage_stats_daily_bucket_provider_model_endpoint_key" ON "public"."llm_usage_stats_daily"("bucket_date", "provider", "model", "endpoint");

-- CreateIndex
CREATE INDEX "idx_llm_usage_stats_weekly_bucket_week" ON "public"."llm_usage_stats_weekly"("bucket_week");

-- CreateIndex
CREATE UNIQUE INDEX "llm_usage_stats_weekly_bucket_provider_model_endpoint_key" ON "public"."llm_usage_stats_weekly"("bucket_week", "provider", "model", "endpoint");

-- CreateIndex
CREATE UNIQUE INDEX "llm_usage_stats_total_provider_model_endpoint_key" ON "public"."llm_usage_stats_total"("provider", "model", "endpoint");

-- AddForeignKey
ALTER TABLE "public"."conversations" ADD CONSTRAINT "conversations_user_id_fkey" FOREIGN KEY ("user_id") REFERENCES "public"."users"("id") ON DELETE SET NULL ON UPDATE RESTRICT;

-- AddForeignKey
ALTER TABLE "public"."sessions" ADD CONSTRAINT "sessions_user_id_fkey" FOREIGN KEY ("user_id") REFERENCES "public"."users"("id") ON DELETE CASCADE ON UPDATE RESTRICT;

-- AddForeignKey
ALTER TABLE "public"."messages" ADD CONSTRAINT "messages_conversation_id_fkey" FOREIGN KEY ("conversation_id") REFERENCES "public"."conversations"("id") ON DELETE RESTRICT ON UPDATE RESTRICT;

-- AddForeignKey
ALTER TABLE "public"."conversation_documents" ADD CONSTRAINT "conversation_documents_conversation_id_fkey" FOREIGN KEY ("conversation_id") REFERENCES "public"."conversations"("id") ON DELETE CASCADE ON UPDATE RESTRICT;

-- AddForeignKey
ALTER TABLE "public"."conversation_document_chunks" ADD CONSTRAINT "conversation_document_chunks_document_id_conversation_id_fkey" FOREIGN KEY ("document_id", "conversation_id") REFERENCES "public"."conversation_documents"("id", "conversation_id") ON DELETE CASCADE ON UPDATE RESTRICT;

-- AddForeignKey
ALTER TABLE "public"."conversation_document_chunks" ADD CONSTRAINT "conversation_document_chunks_conversation_id_fkey" FOREIGN KEY ("conversation_id") REFERENCES "public"."conversations"("id") ON DELETE CASCADE ON UPDATE RESTRICT;

-- AddForeignKey
ALTER TABLE "public"."conversation_document_index_jobs" ADD CONSTRAINT "conversation_document_index_jobs_document_id_fkey" FOREIGN KEY ("document_id") REFERENCES "public"."conversation_documents"("id") ON DELETE CASCADE ON UPDATE RESTRICT;
