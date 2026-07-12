import { env } from '@/lib/env';
import { embedQuery, getConfiguredEmbeddingModel } from '@/lib/rag/embed';
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
  content: string;
  selectedRank: number;
  reason: string;
};

export type RetrievedKnowledgeSelection = {
  candidateTopK: number;
  candidateCount: number;
  selectedCount: number;
  maxChunks: number;
  maxDocuments: number;
  maxChunksPerDocument: number;
  minScore: number;
  maxContextChars: number;
  excludedByLowScore: number;
  excludedByEmptyContent: number;
  excludedByDocumentLimit: number;
  excludedByPerDocumentLimit: number;
  excludedByRedundancy: number;
  excludedByContextLength: number;
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

export const KNOWLEDGE_CONTEXT_SELECTION_POLICY = {
  candidateTopK: 12,
  maxChunks: 6,
  maxDocuments: 3,
  maxChunksPerDocument: 3,
} as const;

function createSelectionMeta(params: {
  candidateTopK: number;
  candidateCount: number;
}): RetrievedKnowledgeSelection {
  return {
    candidateTopK: params.candidateTopK,
    candidateCount: params.candidateCount,
    selectedCount: 0,
    maxChunks: KNOWLEDGE_CONTEXT_SELECTION_POLICY.maxChunks,
    maxDocuments: KNOWLEDGE_CONTEXT_SELECTION_POLICY.maxDocuments,
    maxChunksPerDocument: KNOWLEDGE_CONTEXT_SELECTION_POLICY.maxChunksPerDocument,
    minScore: env.RAG_MIN_SCORE,
    maxContextChars: env.RAG_CONTEXT_MAX_CHARS,
    excludedByLowScore: 0,
    excludedByEmptyContent: 0,
    excludedByDocumentLimit: 0,
    excludedByPerDocumentLimit: 0,
    excludedByRedundancy: 0,
    excludedByContextLength: 0,
  };
}

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

function normalizeForOverlap(value: string): string {
  return value.replace(/\s+/g, '').trim().toLowerCase();
}

function buildShingles(value: string, size = 8): Set<string> {
  const normalized = normalizeForOverlap(value);
  if (normalized.length <= size) {
    return new Set(normalized ? [normalized] : []);
  }
  const shingles = new Set<string>();
  for (let index = 0; index <= normalized.length - size; index += 1) {
    shingles.add(normalized.slice(index, index + size));
  }
  return shingles;
}

function shingleSimilarity(a: string, b: string): number {
  const aShingles = buildShingles(a);
  const bShingles = buildShingles(b);
  if (aShingles.size === 0 || bShingles.size === 0) {
    return 0;
  }
  let intersection = 0;
  for (const item of aShingles) {
    if (bShingles.has(item)) {
      intersection += 1;
    }
  }
  return intersection / Math.min(aShingles.size, bShingles.size);
}

function isRedundantCandidate(
  candidate: KnowledgeContextCandidate,
  selected: Array<KnowledgeContextCandidate & { selectedContent: string }>,
): boolean {
  return selected.some((item) => {
    if (
      item.documentId === candidate.documentId &&
      Math.abs(item.chunkIndex - candidate.chunkIndex) <= 1
    ) {
      return true;
    }
    const candidateText = normalizeForOverlap(candidate.content);
    const selectedText = normalizeForOverlap(item.selectedContent);
    if (!candidateText || !selectedText) {
      return false;
    }
    if (candidateText.includes(selectedText) || selectedText.includes(candidateText)) {
      return true;
    }
    return shingleSimilarity(candidate.content, item.selectedContent) >= 0.86;
  });
}

function buildSelectionReason(candidate: KnowledgeContextCandidate): string {
  if (candidate.ignoreMinScore) {
    return '向量检索失败后的全文兜底上下文';
  }
  return `语义相似度 ${candidate.score.toFixed(2)}，符合知识库选入规则`;
}

function collectKnowledgeContext(
  candidates: KnowledgeContextCandidate[],
  options: { candidateTopK: number },
): {
  contextText: string;
  matches: RetrievedKnowledgeMatch[];
  selection: RetrievedKnowledgeSelection;
} {
  const selectedTexts: string[] = [];
  const matches: RetrievedKnowledgeMatch[] = [];
  const selectedCandidates: Array<KnowledgeContextCandidate & { selectedContent: string }> = [];
  const documentCounts = new Map<string, number>();
  const selectedDocumentIds = new Set<string>();
  const selection = createSelectionMeta({
    candidateTopK: options.candidateTopK,
    candidateCount: candidates.length,
  });
  let contextChars = 0;

  for (const candidate of candidates) {
    if (matches.length >= KNOWLEDGE_CONTEXT_SELECTION_POLICY.maxChunks) {
      break;
    }

    if (
      !Number.isFinite(candidate.score) ||
      (!candidate.ignoreMinScore && candidate.score < env.RAG_MIN_SCORE)
    ) {
      selection.excludedByLowScore += 1;
      continue;
    }

    let content = candidate.content.trim();
    if (!content) {
      selection.excludedByEmptyContent += 1;
      continue;
    }

    const hasDocumentSelected = selectedDocumentIds.has(candidate.documentId);
    if (
      !hasDocumentSelected &&
      selectedDocumentIds.size >= KNOWLEDGE_CONTEXT_SELECTION_POLICY.maxDocuments
    ) {
      selection.excludedByDocumentLimit += 1;
      continue;
    }

    const currentDocumentCount = documentCounts.get(candidate.documentId) ?? 0;
    if (currentDocumentCount >= KNOWLEDGE_CONTEXT_SELECTION_POLICY.maxChunksPerDocument) {
      selection.excludedByPerDocumentLimit += 1;
      continue;
    }

    if (isRedundantCandidate(candidate, selectedCandidates)) {
      selection.excludedByRedundancy += 1;
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
      selection.excludedByContextLength += 1;
      continue;
    }

    contextChars = nextChars;
    selectedTexts.push(formattedChunk);
    selectedDocumentIds.add(candidate.documentId);
    documentCounts.set(candidate.documentId, currentDocumentCount + 1);
    selectedCandidates.push({ ...candidate, selectedContent: content });
    matches.push({
      score: candidate.score,
      documentId: candidate.documentId,
      chunkId: candidate.chunkId,
      chunkIndex: candidate.chunkIndex,
      filename: candidate.filename,
      title: candidate.title,
      sourceLabel: candidate.sourceLabel,
      content,
      selectedRank: matches.length + 1,
      reason: buildSelectionReason(candidate),
    });
  }

  selection.selectedCount = matches.length;

  return { contextText: selectedTexts.join('\n\n'), matches, selection };
}

async function retrieveFallbackDocumentContext(userId: string): Promise<{
  contextText: string;
  matches: RetrievedKnowledgeMatch[];
  selection: RetrievedKnowledgeSelection;
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
    { candidateTopK: documents.length },
  );
}

export async function retrieveUserKnowledgeContext(params: {
  userId: string;
  query: string;
  topK?: number;
  documentId?: string | null;
}): Promise<{
  contextText: string;
  matches: RetrievedKnowledgeMatch[];
  selection: RetrievedKnowledgeSelection;
}> {
  const topK = params.topK ?? KNOWLEDGE_CONTEXT_SELECTION_POLICY.candidateTopK;
  const emptySelection = createSelectionMeta({ candidateTopK: topK, candidateCount: 0 });
  const query = params.query.trim();
  if (!query || topK <= 0) {
    return { contextText: '', matches: [], selection: emptySelection };
  }

  const hasReady = await hasReadyKnowledgeDocuments(params.userId);
  if (!hasReady) {
    return { contextText: '', matches: [], selection: emptySelection };
  }

  try {
    const queryVector = await embedQuery(query);
    const rows = await searchKnowledgeDocumentChunks({
      userId: params.userId,
      queryVector,
      embeddingModel: getConfiguredEmbeddingModel(),
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
      { candidateTopK: topK },
    );
  } catch (error) {
    const fallback = await retrieveFallbackDocumentContext(params.userId);
    if (fallback.contextText.trim()) {
      return fallback;
    }
    throw error;
  }
}
