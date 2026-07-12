import { randomUUID } from 'node:crypto';
import { Prisma } from '@prisma/client';
import { prisma } from '@/lib/prisma';

export type KnowledgeDocumentStatus = 'processing' | 'ready' | 'failed';
export type KnowledgeDocumentIndexJobStatus = 'pending' | 'running' | 'success' | 'failed';

export type KnowledgeChunkInsert = {
  id?: string;
  chunkIndex: number;
  content: string;
  tokenEstimate?: number | null;
  embedding: number[];
};

export type KnowledgeChunkSearchResult = {
  id: string;
  documentId: string;
  userId: string;
  chunkIndex: number;
  content: string;
  filename: string;
  title: string | null;
  sourceLabel: string | null;
  score: number;
};

export type KnowledgeDocumentChunkSnapshot = {
  id: string;
  documentId: string;
  chunkIndex: number;
  content: string;
  filename: string;
  title: string | null;
  sourceLabel: string | null;
};

export function vectorToPgLiteral(vector: number[]): string {
  if (vector.length === 0) {
    throw new Error('Cannot format empty vector for pgvector');
  }
  for (const value of vector) {
    if (!Number.isFinite(value)) {
      throw new Error('Cannot format non-finite vector value for pgvector');
    }
  }
  return `[${vector.join(',')}]`;
}

export async function createKnowledgeDocument(params: {
  userId: string;
  filename: string;
  title?: string | null;
  sourceLabel?: string | null;
  contentMarkdown: string;
  status?: KnowledgeDocumentStatus;
  errorMessage?: string | null;
  version?: number;
}) {
  return prisma.knowledgeDocument.create({
    data: {
      userId: params.userId,
      filename: params.filename,
      title: params.title ?? null,
      sourceLabel: params.sourceLabel ?? null,
      contentMarkdown: params.contentMarkdown,
      status: params.status ?? 'processing',
      errorMessage: params.errorMessage ?? null,
      version: params.version ?? 1,
    },
  });
}

export async function listKnowledgeDocuments(userId: string) {
  return prisma.knowledgeDocument.findMany({
    where: { userId },
    orderBy: { createdAt: 'desc' },
  });
}

export async function getKnowledgeDocumentById(userId: string, id: string) {
  return prisma.knowledgeDocument.findFirst({
    where: { id, userId },
  });
}

export async function listKnowledgeDocumentChunksByIds(
  userId: string,
  chunkIds: string[],
): Promise<KnowledgeDocumentChunkSnapshot[]> {
  const uniqueChunkIds = Array.from(new Set(chunkIds.filter((id) => id.trim().length > 0)));
  if (uniqueChunkIds.length === 0) {
    return [];
  }

  const rows = await prisma.knowledgeDocumentChunk.findMany({
    where: {
      userId,
      id: { in: uniqueChunkIds },
      document: { userId },
    },
    select: {
      id: true,
      documentId: true,
      chunkIndex: true,
      content: true,
      document: {
        select: {
          filename: true,
          title: true,
          sourceLabel: true,
        },
      },
    },
  });

  return rows.map((row) => ({
    id: row.id,
    documentId: row.documentId,
    chunkIndex: row.chunkIndex,
    content: row.content,
    filename: row.document.filename,
    title: row.document.title,
    sourceLabel: row.document.sourceLabel,
  }));
}

export async function findKnowledgeDocumentBySourceLabel(userId: string, sourceLabel: string) {
  return prisma.knowledgeDocument.findFirst({
    where: { userId, sourceLabel },
    orderBy: { createdAt: 'desc' },
  });
}

export async function updateKnowledgeDocumentForReindex(params: {
  userId: string;
  id: string;
  filename: string;
  title?: string | null;
  contentMarkdown: string;
}) {
  const result = await prisma.knowledgeDocument.updateMany({
    where: { id: params.id, userId: params.userId },
    data: {
      filename: params.filename,
      title: params.title ?? null,
      contentMarkdown: params.contentMarkdown,
      status: 'processing',
      errorMessage: null,
      version: { increment: 1 },
    },
  });
  if (result.count === 0) {
    return null;
  }
  return getKnowledgeDocumentById(params.userId, params.id);
}

export async function deleteKnowledgeDocument(userId: string, id: string): Promise<boolean> {
  const result = await prisma.knowledgeDocument.deleteMany({
    where: { id, userId },
  });
  return result.count > 0;
}

export async function claimKnowledgeDocumentIngest(
  userId: string,
  id: string,
  claimToken: string,
  staleBefore?: Date,
) {
  const result = await prisma.knowledgeDocument.updateMany({
    where: {
      id,
      userId,
      status: 'processing',
      OR: [{ errorMessage: null }, ...(staleBefore ? [{ updatedAt: { lt: staleBefore } }] : [])],
    },
    data: { errorMessage: claimToken },
  });
  if (result.count === 0) {
    return null;
  }
  return getKnowledgeDocumentById(userId, id);
}

export async function completeKnowledgeDocumentIngest(
  userId: string,
  id: string,
  claimToken: string,
) {
  const result = await prisma.knowledgeDocument.updateMany({
    where: { id, userId, status: 'processing', errorMessage: claimToken },
    data: { status: 'ready', errorMessage: null },
  });
  return result.count > 0;
}

export async function failKnowledgeDocumentIngest(
  userId: string,
  id: string,
  claimToken: string,
  failureMessage: string,
) {
  const result = await prisma.knowledgeDocument.updateMany({
    where: { id, userId, status: 'processing', errorMessage: claimToken },
    data: { status: 'failed', errorMessage: failureMessage },
  });
  return result.count > 0;
}

export async function createKnowledgeDocumentIndexJob(documentId: string) {
  return prisma.knowledgeDocumentIndexJob.create({
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

export async function markKnowledgeDocumentIndexJobRunning(jobId: string) {
  const now = new Date();
  return prisma.knowledgeDocumentIndexJob.update({
    where: { id: jobId },
    data: {
      status: 'running',
      attempts: { increment: 1 },
      startedAt: now,
      finishedAt: null,
      lastError: null,
    },
  });
}

export async function markKnowledgeDocumentIndexJobSuccess(jobId: string) {
  return prisma.knowledgeDocumentIndexJob.update({
    where: { id: jobId },
    data: { status: 'success', finishedAt: new Date(), lastError: null },
  });
}

export async function markKnowledgeDocumentIndexJobFailed(jobId: string, lastError: string) {
  return prisma.knowledgeDocumentIndexJob.update({
    where: { id: jobId },
    data: { status: 'failed', finishedAt: new Date(), lastError },
  });
}

export async function hasReadyKnowledgeDocuments(userId: string): Promise<boolean> {
  const doc = await prisma.knowledgeDocument.findFirst({
    where: { userId, status: 'ready' },
    select: { id: true },
  });
  return Boolean(doc);
}

export async function replaceKnowledgeDocumentChunks(params: {
  documentId: string;
  userId: string;
  embeddingModel: string;
  chunks: KnowledgeChunkInsert[];
}): Promise<number> {
  await prisma.$transaction(async (tx) => {
    await tx.knowledgeDocumentChunk.deleteMany({
      where: { documentId: params.documentId, userId: params.userId },
    });

    for (const chunk of params.chunks) {
      const id = chunk.id ?? randomUUID();
      const vectorLiteral = vectorToPgLiteral(chunk.embedding);
      await tx.$executeRaw`
        INSERT INTO "public"."knowledge_document_chunks"
          ("id", "document_id", "user_id", "chunk_index", "content", "token_estimate",
           "embedding_model", "embedding_dimension", "embedding", "created_at")
        VALUES
          (${id}, ${params.documentId}, ${params.userId}, ${chunk.chunkIndex}, ${chunk.content},
           ${chunk.tokenEstimate ?? null}, ${params.embeddingModel}, ${chunk.embedding.length},
           ${vectorLiteral}::vector, CURRENT_TIMESTAMP)
      `;
    }
  });

  return params.chunks.length;
}

export async function replaceAndCompleteKnowledgeDocumentIngest(params: {
  userId: string;
  documentId: string;
  claimToken: string;
  embeddingModel: string;
  chunks: KnowledgeChunkInsert[];
}): Promise<boolean> {
  return prisma.$transaction(async (tx) => {
    const claimed = await tx.knowledgeDocument.updateMany({
      where: {
        id: params.documentId,
        userId: params.userId,
        status: 'processing',
        errorMessage: params.claimToken,
      },
      data: { updatedAt: new Date() },
    });
    if (claimed.count === 0) {
      return false;
    }

    await tx.knowledgeDocumentChunk.deleteMany({
      where: { documentId: params.documentId, userId: params.userId },
    });

    for (const chunk of params.chunks) {
      const id = chunk.id ?? randomUUID();
      const vectorLiteral = vectorToPgLiteral(chunk.embedding);
      await tx.$executeRaw`
        INSERT INTO "public"."knowledge_document_chunks"
          ("id", "document_id", "user_id", "chunk_index", "content", "token_estimate",
           "embedding_model", "embedding_dimension", "embedding", "created_at")
        VALUES
          (${id}, ${params.documentId}, ${params.userId}, ${chunk.chunkIndex}, ${chunk.content},
           ${chunk.tokenEstimate ?? null}, ${params.embeddingModel}, ${chunk.embedding.length},
           ${vectorLiteral}::vector, CURRENT_TIMESTAMP)
      `;
    }

    const completed = await tx.knowledgeDocument.updateMany({
      where: {
        id: params.documentId,
        userId: params.userId,
        status: 'processing',
        errorMessage: params.claimToken,
      },
      data: { status: 'ready', errorMessage: null },
    });
    return completed.count > 0;
  });
}

export async function searchKnowledgeDocumentChunks(params: {
  userId: string;
  queryVector: number[];
  embeddingModel: string;
  topK: number;
  documentId?: string | null;
}): Promise<KnowledgeChunkSearchResult[]> {
  if (params.topK <= 0 || params.queryVector.length === 0) {
    return [];
  }

  const vectorLiteral = vectorToPgLiteral(params.queryVector);
  const documentFilter = params.documentId
    ? Prisma.sql`AND c.document_id = ${params.documentId}`
    : Prisma.empty;

  const rows = await prisma.$queryRaw<
    Array<{
      id: string;
      documentId: string;
      userId: string;
      chunkIndex: number;
      content: string;
      filename: string;
      title: string | null;
      sourceLabel: string | null;
      score: number | string;
    }>
  >(Prisma.sql`
    SELECT
      c.id,
      c.document_id AS "documentId",
      c.user_id AS "userId",
      c.chunk_index AS "chunkIndex",
      c.content,
      d.filename,
      d.title,
      d.source_label AS "sourceLabel",
      1 - (c.embedding <=> ${vectorLiteral}::vector) AS score
    FROM "public"."knowledge_document_chunks" c
    INNER JOIN "public"."knowledge_documents" d ON d.id = c.document_id
    WHERE c.user_id = ${params.userId}
      AND d.user_id = ${params.userId}
      AND d.status = 'ready'
      AND c.embedding IS NOT NULL
      AND c.embedding_model = ${params.embeddingModel}
      AND c.embedding_dimension = ${params.queryVector.length}
      ${documentFilter}
    ORDER BY c.embedding <=> ${vectorLiteral}::vector
    LIMIT ${params.topK}
  `);

  return rows.map((row) => ({
    ...row,
    score: typeof row.score === 'number' ? row.score : Number(row.score),
  }));
}
