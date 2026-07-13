-- Move conversation document chunk vectors from Qdrant into pgvector.
CREATE EXTENSION IF NOT EXISTS vector;

ALTER TABLE "public"."conversation_document_chunks"
ADD COLUMN "embedding_model" TEXT NOT NULL DEFAULT 'unknown',
ADD COLUMN "embedding_dimension" INTEGER NOT NULL DEFAULT 0,
ADD COLUMN "embedding" vector;

ALTER TABLE "public"."conversation_document_chunks"
ALTER COLUMN "embedding_model" DROP DEFAULT,
ALTER COLUMN "embedding_dimension" DROP DEFAULT;

DROP INDEX IF EXISTS "public"."conversation_document_chunks_qdrant_point_id_key";

ALTER TABLE "public"."conversation_document_chunks"
DROP COLUMN IF EXISTS "qdrant_point_id";

CREATE INDEX "idx_conversation_document_chunks_conversation_embedding"
ON "public"."conversation_document_chunks"("conversation_id", "embedding_model", "embedding_dimension");
