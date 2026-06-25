CREATE EXTENSION IF NOT EXISTS vector;

CREATE TABLE "public"."knowledge_documents" (
    "id" TEXT NOT NULL,
    "user_id" TEXT NOT NULL,
    "filename" TEXT NOT NULL,
    "title" TEXT,
    "source_label" TEXT,
    "content_markdown" TEXT NOT NULL,
    "status" TEXT NOT NULL DEFAULT 'processing',
    "error_message" TEXT,
    "version" INTEGER NOT NULL DEFAULT 1,
    "created_at" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updated_at" TIMESTAMP(3) NOT NULL,

    CONSTRAINT "knowledge_documents_pkey" PRIMARY KEY ("id")
);

CREATE TABLE "public"."knowledge_document_chunks" (
    "id" TEXT NOT NULL,
    "document_id" TEXT NOT NULL,
    "user_id" TEXT NOT NULL,
    "chunk_index" INTEGER NOT NULL,
    "content" TEXT NOT NULL,
    "token_estimate" INTEGER,
    "embedding_model" TEXT NOT NULL,
    "embedding_dimension" INTEGER NOT NULL,
    "embedding" vector,
    "created_at" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,

    CONSTRAINT "knowledge_document_chunks_pkey" PRIMARY KEY ("id")
);

CREATE TABLE "public"."knowledge_document_index_jobs" (
    "id" TEXT NOT NULL,
    "document_id" TEXT NOT NULL,
    "status" TEXT NOT NULL DEFAULT 'pending',
    "attempts" INTEGER NOT NULL DEFAULT 0,
    "last_error" TEXT,
    "started_at" TIMESTAMP(3),
    "finished_at" TIMESTAMP(3),
    "created_at" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updated_at" TIMESTAMP(3) NOT NULL,

    CONSTRAINT "knowledge_document_index_jobs_pkey" PRIMARY KEY ("id")
);

CREATE INDEX "idx_knowledge_documents_user_id" ON "public"."knowledge_documents"("user_id");
CREATE INDEX "idx_knowledge_documents_status" ON "public"."knowledge_documents"("status");
CREATE INDEX "idx_knowledge_documents_user_source_label" ON "public"."knowledge_documents"("user_id", "source_label");
CREATE UNIQUE INDEX "knowledge_documents_id_user_id_key"
ON "public"."knowledge_documents"("id", "user_id");

CREATE UNIQUE INDEX "knowledge_document_chunks_document_id_chunk_index_key"
ON "public"."knowledge_document_chunks"("document_id", "chunk_index");

CREATE INDEX "idx_knowledge_document_chunks_document_id" ON "public"."knowledge_document_chunks"("document_id");
CREATE INDEX "idx_knowledge_document_chunks_user_id" ON "public"."knowledge_document_chunks"("user_id");
CREATE INDEX "idx_knowledge_document_chunks_user_embedding"
ON "public"."knowledge_document_chunks"("user_id", "embedding_model", "embedding_dimension");

CREATE INDEX "idx_knowledge_document_index_jobs_document_id"
ON "public"."knowledge_document_index_jobs"("document_id");

CREATE INDEX "idx_knowledge_document_index_jobs_status"
ON "public"."knowledge_document_index_jobs"("status");

ALTER TABLE "public"."knowledge_documents"
ADD CONSTRAINT "knowledge_documents_user_id_fkey"
FOREIGN KEY ("user_id") REFERENCES "public"."users"("id")
ON DELETE CASCADE ON UPDATE RESTRICT;

ALTER TABLE "public"."knowledge_document_chunks"
ADD CONSTRAINT "knowledge_document_chunks_document_id_user_id_fkey"
FOREIGN KEY ("document_id", "user_id") REFERENCES "public"."knowledge_documents"("id", "user_id")
ON DELETE CASCADE ON UPDATE RESTRICT;

ALTER TABLE "public"."knowledge_document_chunks"
ADD CONSTRAINT "knowledge_document_chunks_user_id_fkey"
FOREIGN KEY ("user_id") REFERENCES "public"."users"("id")
ON DELETE CASCADE ON UPDATE RESTRICT;

ALTER TABLE "public"."knowledge_document_index_jobs"
ADD CONSTRAINT "knowledge_document_index_jobs_document_id_fkey"
FOREIGN KEY ("document_id") REFERENCES "public"."knowledge_documents"("id")
ON DELETE CASCADE ON UPDATE RESTRICT;
