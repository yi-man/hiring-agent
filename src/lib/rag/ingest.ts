import {
  claimConversationDocumentIngest,
  completeConversationDocumentIngest,
  failConversationDocumentIngest,
  getConversationDocumentById,
  replaceConversationDocumentChunks,
} from '@/lib/chat/repositories/document-repo';
import { env } from '@/lib/env';
import { embedDocuments } from '@/lib/rag/embed';
import { splitMarkdownToChunks } from '@/lib/rag/markdown';
import {
  createDeterministicQdrantPointId,
  deleteDocumentPoints,
  ensureCollection,
  getQdrantClient,
  qdrantCollectionName,
} from '@/lib/rag/qdrant';

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
  const claimToken = `ingest:${Date.now()}:${Math.random().toString(16).slice(2)}`;
  const staleBefore = new Date(Date.now() - env.RAG_INGEST_LEASE_MS);
  const claimedDocument = await claimConversationDocumentIngest(
    conversationId,
    documentId,
    claimToken,
    staleBefore,
  );
  if (!claimedDocument) {
    return;
  }

  try {
    const document = await getConversationDocumentById(conversationId, documentId);
    if (!document) {
      throw new Error('conversation document not found');
    }

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
      const qdrantPointId = createDeterministicQdrantPointId({
        documentId: document.id,
        version: document.version,
        chunkIndex: chunk.index,
      });
      return {
        chunkId: qdrantPointId,
        qdrantPointId,
        chunkIndex: chunk.index,
        content: chunk.content,
        vector: embeddings[index],
      };
    });

    await deleteDocumentPoints({ conversationId, documentId: document.id });

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

    const chunkRows = chunks.map((chunk) => ({
      id: chunk.chunkId,
      conversationId,
      chunkIndex: chunk.chunkIndex,
      content: chunk.content,
      tokenEstimate: null,
      qdrantPointId: chunk.qdrantPointId,
    }));

    await replaceConversationDocumentChunks(document.id, chunkRows);

    const completed = await completeConversationDocumentIngest(
      conversationId,
      documentId,
      claimToken,
    );
    if (!completed) {
      throw new Error('ingest lost ownership before marking document ready');
    }
  } catch (error) {
    const message = error instanceof Error ? error.message : 'document ingest failed';
    const failed = await failConversationDocumentIngest(
      conversationId,
      documentId,
      claimToken,
      message,
    );
    if (!failed) {
      throw new Error(`${message}; and failed to atomically mark document failed`);
    }
    throw error;
  }
}
