import { randomUUID } from 'node:crypto';
import { Prisma } from '@prisma/client';
import { prisma } from '@/lib/prisma';
import { vectorToPgLiteral } from '@/lib/rag/knowledge-repo';

export type ConversationDocumentStatus = 'processing' | 'ready' | 'failed';
export type ConversationDocumentIndexJobStatus = 'pending' | 'running' | 'success' | 'failed';

export type ConversationChunkInsert = {
  id?: string;
  conversationId: string;
  chunkIndex: number;
  content: string;
  tokenEstimate?: number | null;
  embedding: number[];
};

export type ConversationChunkSearchResult = {
  id: string;
  documentId: string;
  conversationId: string;
  chunkIndex: number;
  content: string;
  filename: string;
  score: number;
};

export async function createConversationDocument(params: {
  conversationId: string;
  filename: string;
  contentMarkdown: string;
  status?: ConversationDocumentStatus;
  errorMessage?: string | null;
  version?: number;
}) {
  return prisma.conversationDocument.create({
    data: {
      conversationId: params.conversationId,
      filename: params.filename,
      contentMarkdown: params.contentMarkdown,
      status: params.status ?? 'processing',
      errorMessage: params.errorMessage ?? null,
      version: params.version ?? 1,
    },
  });
}

export async function setConversationDocumentStatus(
  conversationId: string,
  id: string,
  status: ConversationDocumentStatus,
  errorMessage?: string | null,
) {
  const result = await prisma.conversationDocument.updateMany({
    where: { id, conversationId },
    data: {
      status,
      errorMessage: errorMessage ?? null,
    },
  });

  if (result.count === 0) {
    return null;
  }

  return prisma.conversationDocument.findFirst({
    where: { id, conversationId },
  });
}

export async function claimConversationDocumentIngest(
  conversationId: string,
  id: string,
  claimToken: string,
  staleBefore?: Date,
) {
  const result = await prisma.conversationDocument.updateMany({
    where: {
      id,
      conversationId,
      status: 'processing',
      OR: [{ errorMessage: null }, ...(staleBefore ? [{ updatedAt: { lt: staleBefore } }] : [])],
    },
    data: {
      errorMessage: claimToken,
    },
  });
  if (result.count === 0) {
    return null;
  }
  return prisma.conversationDocument.findFirst({
    where: { id, conversationId },
  });
}

export async function completeConversationDocumentIngest(
  conversationId: string,
  id: string,
  claimToken: string,
) {
  const result = await prisma.conversationDocument.updateMany({
    where: {
      id,
      conversationId,
      status: 'processing',
      errorMessage: claimToken,
    },
    data: {
      status: 'ready',
      errorMessage: null,
    },
  });
  return result.count > 0;
}

export async function failConversationDocumentIngest(
  conversationId: string,
  id: string,
  claimToken: string,
  failureMessage: string,
) {
  const result = await prisma.conversationDocument.updateMany({
    where: {
      id,
      conversationId,
      status: 'processing',
      errorMessage: claimToken,
    },
    data: {
      status: 'failed',
      errorMessage: failureMessage,
    },
  });
  return result.count > 0;
}

export async function replaceConversationDocumentChunks(
  documentId: string,
  embeddingModel: string,
  rows: ConversationChunkInsert[],
): Promise<number> {
  await prisma.$transaction(async (tx) => {
    await tx.conversationDocumentChunk.deleteMany({
      where: { documentId },
    });

    for (const row of rows) {
      const id = row.id ?? randomUUID();
      const vectorLiteral = vectorToPgLiteral(row.embedding);
      await tx.$executeRaw`
        INSERT INTO "public"."conversation_document_chunks"
          ("id", "document_id", "conversation_id", "chunk_index", "content", "token_estimate",
           "embedding_model", "embedding_dimension", "embedding", "created_at")
        VALUES
          (${id}, ${documentId}, ${row.conversationId}, ${row.chunkIndex}, ${row.content},
           ${row.tokenEstimate ?? null}, ${embeddingModel}, ${row.embedding.length},
           ${vectorLiteral}::vector, CURRENT_TIMESTAMP)
      `;
    }
  });

  return rows.length;
}

export async function searchConversationDocumentChunks(params: {
  conversationId: string;
  queryVector: number[];
  embeddingModel: string;
  topK: number;
  minScore?: number;
  documentId?: string | null;
}): Promise<ConversationChunkSearchResult[]> {
  if (params.topK <= 0 || params.queryVector.length === 0) {
    return [];
  }

  const vectorLiteral = vectorToPgLiteral(params.queryVector);
  const documentFilter = params.documentId
    ? Prisma.sql`AND c.document_id = ${params.documentId}`
    : Prisma.empty;
  const minScore = params.minScore ?? Number.NEGATIVE_INFINITY;

  const rows = await prisma.$queryRaw<
    Array<{
      id: string;
      documentId: string;
      conversationId: string;
      chunkIndex: number;
      content: string;
      filename: string;
      score: number | string;
    }>
  >(Prisma.sql`
    SELECT
      c.id,
      c.document_id AS "documentId",
      c.conversation_id AS "conversationId",
      c.chunk_index AS "chunkIndex",
      c.content,
      d.filename,
      1 - (c.embedding <=> ${vectorLiteral}::vector) AS score
    FROM "public"."conversation_document_chunks" c
    INNER JOIN "public"."conversation_documents" d ON d.id = c.document_id
    WHERE c.conversation_id = ${params.conversationId}
      AND d.conversation_id = ${params.conversationId}
      AND d.status = 'ready'
      AND c.embedding IS NOT NULL
      AND c.embedding_model = ${params.embeddingModel}
      AND c.embedding_dimension = ${params.queryVector.length}
      ${documentFilter}
    ORDER BY c.embedding <=> ${vectorLiteral}::vector
    LIMIT ${params.topK}
  `);

  return rows
    .map((row) => ({
      ...row,
      score: typeof row.score === 'number' ? row.score : Number(row.score),
    }))
    .filter((row) => Number.isFinite(row.score) && row.score >= minScore);
}

export async function listConversationDocuments(conversationId: string) {
  return prisma.conversationDocument.findMany({
    where: { conversationId },
    orderBy: {
      createdAt: 'desc',
    },
  });
}

export async function getConversationDocumentById(conversationId: string, id: string) {
  return prisma.conversationDocument.findFirst({
    where: { id, conversationId },
  });
}

export async function deleteConversationDocument(
  conversationId: string,
  id: string,
): Promise<boolean> {
  const result = await prisma.conversationDocument.deleteMany({
    where: { id, conversationId },
  });
  return result.count > 0;
}

export async function createConversationDocumentIndexJob(documentId: string) {
  return prisma.conversationDocumentIndexJob.create({
    data: {
      documentId,
      status: 'pending',
      attempts: 0,
      lastError: null,
      startedAt: null,
      finishedAt: null,
    },
  });
}

export async function markConversationDocumentIndexJobRunning(jobId: string) {
  const now = new Date();
  return prisma.conversationDocumentIndexJob.update({
    where: { id: jobId },
    data: {
      status: 'running',
      attempts: {
        increment: 1,
      },
      startedAt: now,
      finishedAt: null,
      lastError: null,
    },
  });
}

export async function markConversationDocumentIndexJobSuccess(jobId: string) {
  return prisma.conversationDocumentIndexJob.update({
    where: { id: jobId },
    data: {
      status: 'success',
      finishedAt: new Date(),
      lastError: null,
    },
  });
}

export async function markConversationDocumentIndexJobFailed(jobId: string, lastError: string) {
  return prisma.conversationDocumentIndexJob.update({
    where: { id: jobId },
    data: {
      status: 'failed',
      finishedAt: new Date(),
      lastError,
    },
  });
}
