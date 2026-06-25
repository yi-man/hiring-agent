import { env } from '@/lib/env';
import { embedQuery } from '@/lib/rag/embed';
import {
  hasReadyKnowledgeDocuments,
  listKnowledgeDocuments,
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

type KnowledgeContextCandidate = {
  score: number;
  documentId: string;
  chunkId: string;
  chunkIndex: number;
  content: string;
  filename: string;
  title: string | null;
  sourceLabel: string | null;
  allowTruncate?: boolean;
  ignoreMinScore?: boolean;
};

function sanitizeSourceValue(value: string): string {
  return (
    value
      .replace(/["\r\n]+/g, ' ')
      .replace(/\s+/g, ' ')
      .trim() || 'unknown'
  );
}

function formatKnowledgeSource(candidate: KnowledgeContextCandidate, content: string): string {
  return [
    `[knowledge source filename="${sanitizeSourceValue(candidate.filename)}" chunkIndex=${candidate.chunkIndex}]`,
    content,
  ].join('\n');
}

function collectKnowledgeContext(candidates: KnowledgeContextCandidate[]): {
  contextText: string;
  matches: RetrievedKnowledgeMatch[];
} {
  const selectedTexts: string[] = [];
  const matches: RetrievedKnowledgeMatch[] = [];
  let contextChars = 0;

  for (const candidate of candidates) {
    if (
      !Number.isFinite(candidate.score) ||
      (!candidate.ignoreMinScore && candidate.score < env.RAG_MIN_SCORE)
    ) {
      continue;
    }

    let content = candidate.content.trim();
    if (!content) {
      continue;
    }

    let formattedChunk = formatKnowledgeSource(candidate, content);
    const separatorChars = selectedTexts.length > 0 ? 2 : 0;
    let nextChars = contextChars + separatorChars + formattedChunk.length;
    if (nextChars > env.RAG_CONTEXT_MAX_CHARS && candidate.allowTruncate) {
      const marker = formatKnowledgeSource(candidate, '');
      const availableContentChars =
        env.RAG_CONTEXT_MAX_CHARS - contextChars - separatorChars - marker.length;
      if (availableContentChars > 20) {
        content = content.slice(0, availableContentChars).trim();
        formattedChunk = formatKnowledgeSource(candidate, content);
        nextChars = contextChars + separatorChars + formattedChunk.length;
      }
    }
    if (nextChars > env.RAG_CONTEXT_MAX_CHARS) {
      continue;
    }

    contextChars = nextChars;
    selectedTexts.push(formattedChunk);
    matches.push({
      score: candidate.score,
      documentId: candidate.documentId,
      chunkId: candidate.chunkId,
      chunkIndex: candidate.chunkIndex,
      filename: candidate.filename,
      title: candidate.title,
      sourceLabel: candidate.sourceLabel,
    });
  }

  return { contextText: selectedTexts.join('\n\n'), matches };
}

async function retrieveFallbackDocumentContext(userId: string): Promise<{
  contextText: string;
  matches: RetrievedKnowledgeMatch[];
}> {
  const documents = await listKnowledgeDocuments(userId);
  return collectKnowledgeContext(
    documents
      .filter((document) => document.status === 'ready')
      .map((document) => ({
        score: 0,
        documentId: document.id,
        chunkId: `${document.id}:fallback`,
        chunkIndex: 0,
        content: document.contentMarkdown,
        filename: document.filename,
        title: document.title,
        sourceLabel: document.sourceLabel,
        allowTruncate: true,
        ignoreMinScore: true,
      })),
  );
}

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

  try {
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

    return collectKnowledgeContext(
      rows.map((row) => ({
        score: row.score,
        documentId: row.documentId,
        chunkId: row.id,
        chunkIndex: row.chunkIndex,
        content: row.content,
        filename: row.filename,
        title: row.title,
        sourceLabel: row.sourceLabel,
      })),
    );
  } catch (error) {
    const fallback = await retrieveFallbackDocumentContext(params.userId);
    if (fallback.contextText.trim()) {
      return fallback;
    }
    throw error;
  }
}
