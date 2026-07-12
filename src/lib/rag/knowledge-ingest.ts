import { randomUUID } from 'node:crypto';
import { env } from '@/lib/env';
import { embedDocuments, getConfiguredEmbeddingModel } from '@/lib/rag/embed';
import { splitMarkdownToChunks } from '@/lib/rag/markdown';
import {
  claimKnowledgeDocumentIngest,
  failKnowledgeDocumentIngest,
  getKnowledgeDocumentById,
  replaceAndCompleteKnowledgeDocumentIngest,
} from '@/lib/rag/knowledge-repo';

const CONCURRENT_KNOWLEDGE_INGEST_MAX_WAIT_MS = 90_000;
const CONCURRENT_KNOWLEDGE_INGEST_POLL_MS = 400;

function sleep(ms: number): Promise<void> {
  return new Promise((resolve) => setTimeout(resolve, ms));
}

function createClaimToken(): string {
  return `ingest:${Date.now()}:${Math.random().toString(16).slice(2)}`;
}

class KnowledgeIngestLostOwnershipError extends Error {
  constructor(message: string) {
    super(message);
    this.name = 'KnowledgeIngestLostOwnershipError';
  }
}

async function awaitConcurrentKnowledgeIngestTerminal(
  userId: string,
  documentId: string,
): Promise<void> {
  const deadline = Date.now() + CONCURRENT_KNOWLEDGE_INGEST_MAX_WAIT_MS;
  while (Date.now() < deadline) {
    const doc = await getKnowledgeDocumentById(userId, documentId);
    if (!doc) {
      throw new Error('knowledge document not found');
    }
    if (doc.status === 'ready') {
      return;
    }
    if (doc.status === 'failed') {
      throw new Error(doc.errorMessage ?? 'knowledge document ingest failed');
    }
    await sleep(CONCURRENT_KNOWLEDGE_INGEST_POLL_MS);
  }
  throw new Error(
    'knowledge document ingest timed out while waiting for indexer (still processing — check embeddings API and DB)',
  );
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
    if (snapshot.status === 'processing') {
      await awaitConcurrentKnowledgeIngestTerminal(params.userId, params.documentId);
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
    const firstEmbedding = embeddings[0];
    if (!firstEmbedding || embeddings.some((embedding) => embedding.length === 0)) {
      throw new Error('embedding vectors are empty');
    }
    const vectorSize = firstEmbedding.length;
    if (embeddings.some((embedding) => embedding.length !== vectorSize)) {
      throw new Error('embedding vector dimensions do not match');
    }

    const completed = await replaceAndCompleteKnowledgeDocumentIngest({
      documentId: document.id,
      userId: params.userId,
      claimToken,
      embeddingModel: getConfiguredEmbeddingModel(),
      chunks: markdownChunks.map((chunk, index) => ({
        id: randomUUID(),
        chunkIndex: chunk.index,
        content: chunk.content,
        tokenEstimate: null,
        embedding: embeddings[index] ?? [],
      })),
    });
    if (!completed) {
      throw new KnowledgeIngestLostOwnershipError(
        'knowledge ingest lost ownership before replacing chunks',
      );
    }
  } catch (error) {
    if (error instanceof KnowledgeIngestLostOwnershipError) {
      throw error;
    }

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
