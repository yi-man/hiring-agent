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

const CONCURRENT_INGEST_MAX_WAIT_MS = 90_000;
const CONCURRENT_INGEST_POLL_MS = 400;

function sleep(ms: number): Promise<void> {
  return new Promise((resolve) => setTimeout(resolve, ms));
}

/** 与 claimConversationDocumentIngest 写入的 lease 格式一致：`ingest:<Date.now()>:<random hex>` */
function looksLikeIngestClaimLease(errorMessage: string | null): boolean {
  if (!errorMessage || !errorMessage.startsWith('ingest:')) {
    return false;
  }
  const parts = errorMessage.split(':');
  return parts.length >= 3 && /^\d+$/.test(parts[1] ?? '');
}

/**
 * 未拿到 claim 时：可能另有 ingest 正在写同一文档。轮询直到 ready/failed，避免静默 return 导致
 * enqueue 误标 job success、文档长期 processing。
 */
async function awaitConcurrentIngestTerminal(
  conversationId: string,
  documentId: string,
): Promise<void> {
  const deadline = Date.now() + CONCURRENT_INGEST_MAX_WAIT_MS;
  while (Date.now() < deadline) {
    const doc = await getConversationDocumentById(conversationId, documentId);
    if (!doc) {
      throw new Error('conversation document not found');
    }
    if (doc.status === 'ready') {
      return;
    }
    if (doc.status === 'failed') {
      throw new Error(doc.errorMessage ?? 'document ingest failed');
    }
    await sleep(CONCURRENT_INGEST_POLL_MS);
  }
  throw new Error(
    'document ingest timed out while waiting for indexer (still processing — check embeddings API, Qdrant, and DB)',
  );
}

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
    const snapshot = await getConversationDocumentById(conversationId, documentId);
    if (!snapshot) {
      throw new Error('conversation document not found');
    }
    if (snapshot.status === 'ready') {
      return;
    }
    if (snapshot.status === 'failed') {
      throw new Error(snapshot.errorMessage ?? 'document ingest failed');
    }
    if (snapshot.status === 'processing' && looksLikeIngestClaimLease(snapshot.errorMessage)) {
      await awaitConcurrentIngestTerminal(conversationId, documentId);
    }
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
