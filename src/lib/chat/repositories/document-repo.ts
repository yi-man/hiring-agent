import { prisma } from '@/lib/prisma';

export type ConversationDocumentStatus = 'processing' | 'ready' | 'failed';
export type ConversationDocumentIndexJobStatus = 'pending' | 'running' | 'success' | 'failed';

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

export async function bulkInsertDocumentChunks(
  rows: Array<{
    id?: string;
    documentId: string;
    conversationId: string;
    chunkIndex: number;
    content: string;
    tokenEstimate?: number | null;
    qdrantPointId?: string | null;
  }>,
): Promise<number> {
  if (rows.length === 0) {
    return 0;
  }

  const result = await prisma.conversationDocumentChunk.createMany({
    data: rows.map((row) => ({
      id: row.id,
      documentId: row.documentId,
      conversationId: row.conversationId,
      chunkIndex: row.chunkIndex,
      content: row.content,
      tokenEstimate: row.tokenEstimate ?? null,
      qdrantPointId: row.qdrantPointId ?? null,
    })),
  });

  return result.count;
}

export async function replaceConversationDocumentChunks(
  documentId: string,
  rows: Array<{
    id?: string;
    conversationId: string;
    chunkIndex: number;
    content: string;
    tokenEstimate?: number | null;
    qdrantPointId?: string | null;
  }>,
): Promise<number> {
  await prisma.conversationDocumentChunk.deleteMany({
    where: { documentId },
  });
  return bulkInsertDocumentChunks(
    rows.map((row) => ({
      ...row,
      documentId,
    })),
  );
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
