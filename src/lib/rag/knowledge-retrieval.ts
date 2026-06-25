import { env } from '@/lib/env';
import { embedQuery } from '@/lib/rag/embed';
import {
  hasReadyKnowledgeDocuments,
  searchKnowledgeDocumentChunks,
} from '@/lib/rag/knowledge-repo';

export type RetrievedKnowledgeMatch = {
  score: number;
  documentId: string;
  chunkId: string;
  chunkIndex: number;
  filename: string;
  title: string | null;
  sourceLabel: string | null;
};

export async function retrieveUserKnowledgeContext(params: {
  userId: string;
  query: string;
  topK?: number;
  documentId?: string | null;
}): Promise<{ contextText: string; matches: RetrievedKnowledgeMatch[] }> {
  const topK = params.topK ?? env.RAG_TOP_K;
  const query = params.query.trim();
  if (!query || topK <= 0) {
    return { contextText: '', matches: [] };
  }

  const hasReady = await hasReadyKnowledgeDocuments(params.userId);
  if (!hasReady) {
    return { contextText: '', matches: [] };
  }

  const queryVector = await embedQuery(query);
  const rows = await searchKnowledgeDocumentChunks({
    userId: params.userId,
    queryVector,
    embeddingModel: env.OPENAI_EMBEDDING_MODEL,
    topK,
    documentId:
      typeof params.documentId === 'string' && params.documentId.trim()
        ? params.documentId.trim()
        : null,
  });

  const selectedTexts: string[] = [];
  const matches: RetrievedKnowledgeMatch[] = [];
  let contextChars = 0;

  for (const row of rows) {
    if (!Number.isFinite(row.score) || row.score < env.RAG_MIN_SCORE) {
      continue;
    }
    const content = row.content.trim();
    if (!content) {
      continue;
    }

    const formattedChunk = [
      `[knowledge source filename="${row.filename}" chunkIndex=${row.chunkIndex}]`,
      content,
    ].join('\n');
    const nextChars = contextChars + formattedChunk.length;
    if (nextChars > env.RAG_CONTEXT_MAX_CHARS) {
      continue;
    }

    contextChars = nextChars;
    selectedTexts.push(formattedChunk);
    matches.push({
      score: row.score,
      documentId: row.documentId,
      chunkId: row.id,
      chunkIndex: row.chunkIndex,
      filename: row.filename,
      title: row.title,
      sourceLabel: row.sourceLabel,
    });
  }

  return { contextText: selectedTexts.join('\n\n'), matches };
}
