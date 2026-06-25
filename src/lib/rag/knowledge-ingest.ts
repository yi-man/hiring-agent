import { randomUUID } from 'node:crypto';
import { env } from '@/lib/env';
import { embedDocuments } from '@/lib/rag/embed';
import { splitMarkdownToChunks } from '@/lib/rag/markdown';
import {
  claimKnowledgeDocumentIngest,
  completeKnowledgeDocumentIngest,
  failKnowledgeDocumentIngest,
  getKnowledgeDocumentById,
  replaceKnowledgeDocumentChunks,
} from '@/lib/rag/knowledge-repo';

function createClaimToken(): string {
  return `ingest:${Date.now()}:${Math.random().toString(16).slice(2)}`;
}

export async function ingestKnowledgeDocument(params: {
  userId: string;
  documentId: string;
}): Promise<void> {
  const claimToken = createClaimToken();
  const staleBefore = new Date(Date.now() - env.RAG_INGEST_LEASE_MS);
  const claimed = await claimKnowledgeDocumentIngest(
    params.userId,
    params.documentId,
    claimToken,
    staleBefore,
  );

  if (!claimed) {
    const snapshot = await getKnowledgeDocumentById(params.userId, params.documentId);
    if (!snapshot) {
      throw new Error('knowledge document not found');
    }
    if (snapshot.status === 'ready') {
      return;
    }
    if (snapshot.status === 'failed') {
      throw new Error(snapshot.errorMessage ?? 'knowledge document ingest failed');
    }
    return;
  }

  try {
    const document = await getKnowledgeDocumentById(params.userId, params.documentId);
    if (!document) {
      throw new Error('knowledge document not found');
    }

    const markdownChunks = await splitMarkdownToChunks(document.contentMarkdown);
    if (markdownChunks.length === 0) {
      throw new Error('knowledge document produced no indexable markdown chunks');
    }

    const embeddings = await embedDocuments(markdownChunks.map((chunk) => chunk.content));
    if (embeddings.length !== markdownChunks.length) {
      throw new Error('embedding count does not match knowledge chunks');
    }
    if (embeddings.some((embedding) => embedding.length === 0)) {
      throw new Error('embedding vectors are empty');
    }

    await replaceKnowledgeDocumentChunks({
      documentId: document.id,
      userId: params.userId,
      embeddingModel: env.OPENAI_EMBEDDING_MODEL,
      chunks: markdownChunks.map((chunk, index) => ({
        id: randomUUID(),
        chunkIndex: chunk.index,
        content: chunk.content,
        tokenEstimate: null,
        embedding: embeddings[index] ?? [],
      })),
    });

    const completed = await completeKnowledgeDocumentIngest(
      params.userId,
      params.documentId,
      claimToken,
    );
    if (!completed) {
      throw new Error('knowledge ingest lost ownership before marking document ready');
    }
  } catch (error) {
    const message = error instanceof Error ? error.message : 'knowledge document ingest failed';
    const failed = await failKnowledgeDocumentIngest(
      params.userId,
      params.documentId,
      claimToken,
      message,
    );
    if (!failed) {
      throw new Error(`${message}; and failed to atomically mark knowledge document failed`);
    }
    throw error;
  }
}
