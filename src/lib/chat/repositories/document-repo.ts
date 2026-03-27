import { prisma } from '@/lib/prisma';

export type ConversationDocumentStatus = 'processing' | 'ready' | 'failed';

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

export async function bulkInsertDocumentChunks(
  rows: Array<{
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
