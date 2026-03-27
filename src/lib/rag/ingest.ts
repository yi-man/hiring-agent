import { randomUUID } from 'crypto';
import {
  getConversationDocumentById,
  replaceConversationDocumentChunks,
  setConversationDocumentStatus,
} from '@/lib/chat/repositories/document-repo';
import { embedDocuments } from '@/lib/rag/embed';
import { splitMarkdownToChunks } from '@/lib/rag/markdown';
import { ensureCollection, getQdrantClient, qdrantCollectionName } from '@/lib/rag/qdrant';

type QdrantPointPayload = {
  conversationId: string;
  documentId: string;
  chunkId: string;
  chunkIndex: number;
  filename: string;
  version: number;
};

export async function ingestConversationDocument(
  documentId: string,
  conversationId: string,
): Promise<void> {
  const document = await getConversationDocumentById(conversationId, documentId);
  if (!document) {
    throw new Error('conversation document not found');
  }

  try {
    const markdownChunks = await splitMarkdownToChunks(document.contentMarkdown);
    if (markdownChunks.length === 0) {
      throw new Error('document produced no indexable markdown chunks');
    }

    const embeddings = await embedDocuments(markdownChunks.map((chunk) => chunk.content));
    if (embeddings.length !== markdownChunks.length) {
      throw new Error('embedding count does not match markdown chunks');
    }
    if (!embeddings[0] || embeddings[0].length === 0) {
      throw new Error('embedding vectors are empty');
    }

    await ensureCollection({ vectorSize: embeddings[0].length });

    const chunks = markdownChunks.map((chunk, index) => {
      const chunkId = randomUUID();
      return {
        chunkId,
        qdrantPointId: `doc-${document.id}-chunk-${chunk.index}-${chunkId}`,
        chunkIndex: chunk.index,
        content: chunk.content,
        vector: embeddings[index],
      };
    });

    const client = getQdrantClient();
    await client.upsert(qdrantCollectionName, {
      wait: true,
      points: chunks.map((chunk) => ({
        id: chunk.qdrantPointId,
        vector: chunk.vector,
        payload: {
          conversationId,
          documentId: document.id,
          chunkId: chunk.chunkId,
          chunkIndex: chunk.chunkIndex,
          filename: document.filename,
          version: document.version,
        } satisfies QdrantPointPayload,
      })),
    });

    await replaceConversationDocumentChunks(
      document.id,
      chunks.map((chunk) => ({
        id: chunk.chunkId,
        conversationId,
        chunkIndex: chunk.chunkIndex,
        content: chunk.content,
        tokenEstimate: null,
        qdrantPointId: chunk.qdrantPointId,
      })),
    );

    await setConversationDocumentStatus(conversationId, documentId, 'ready', null);
  } catch (error) {
    const message = error instanceof Error ? error.message : 'document ingest failed';
    await setConversationDocumentStatus(conversationId, documentId, 'failed', message);
    throw error;
  }
}
