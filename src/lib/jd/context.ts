import { env } from '@/lib/env';
import { getJobDescriptionById } from '@/lib/jd/job-description-repo';
import { KNOWLEDGE_CONTEXT_SELECTION_POLICY } from '@/lib/rag/knowledge-retrieval';
import { listKnowledgeDocumentChunksByIds } from '@/lib/rag/knowledge-repo';
import type { JDAgentContextMatch, JDAgentContextMeta, JDAgentContextSelection } from '@/types';

export type JobDescriptionContextMatchDto = Required<
  Pick<JDAgentContextMatch, 'content' | 'reason' | 'selectedRank'>
> &
  Omit<JDAgentContextMatch, 'content' | 'reason' | 'selectedRank'>;

export type JobDescriptionContextDto = {
  jobDescription: {
    id: string;
    department: string;
    position: string;
    updatedAt: string;
  };
  context: {
    used: boolean;
    query: string;
    textLength: number;
    contextText: string;
    matches: JobDescriptionContextMatchDto[];
    selection: JDAgentContextSelection;
    warnings: string[];
  };
};

function sanitizeSourceValue(value: string): string {
  return (
    value
      .replace(/["\r\n]+/g, ' ')
      .replace(/\s+/g, ' ')
      .trim() || 'unknown'
  );
}

function formatKnowledgeSource(match: JobDescriptionContextMatchDto): string {
  return [
    `[knowledge source filename="${sanitizeSourceValue(match.filename)}" chunkIndex=${match.chunkIndex}]`,
    match.content,
  ].join('\n');
}

function createFallbackSelection(params: {
  context: JDAgentContextMeta | null;
  selectedCount: number;
}): JDAgentContextSelection {
  return {
    candidateTopK:
      params.context?.selection?.candidateTopK ?? KNOWLEDGE_CONTEXT_SELECTION_POLICY.candidateTopK,
    candidateCount: params.context?.selection?.candidateCount ?? params.selectedCount,
    selectedCount: params.context?.selection?.selectedCount ?? params.selectedCount,
    maxChunks: params.context?.selection?.maxChunks ?? KNOWLEDGE_CONTEXT_SELECTION_POLICY.maxChunks,
    maxDocuments:
      params.context?.selection?.maxDocuments ?? KNOWLEDGE_CONTEXT_SELECTION_POLICY.maxDocuments,
    maxChunksPerDocument:
      params.context?.selection?.maxChunksPerDocument ??
      KNOWLEDGE_CONTEXT_SELECTION_POLICY.maxChunksPerDocument,
    minScore: params.context?.selection?.minScore ?? env.RAG_MIN_SCORE,
    maxContextChars: params.context?.selection?.maxContextChars ?? env.RAG_CONTEXT_MAX_CHARS,
    excludedByLowScore: params.context?.selection?.excludedByLowScore ?? 0,
    excludedByEmptyContent: params.context?.selection?.excludedByEmptyContent ?? 0,
    excludedByDocumentLimit: params.context?.selection?.excludedByDocumentLimit ?? 0,
    excludedByPerDocumentLimit: params.context?.selection?.excludedByPerDocumentLimit ?? 0,
    excludedByRedundancy: params.context?.selection?.excludedByRedundancy ?? 0,
    excludedByContextLength: params.context?.selection?.excludedByContextLength ?? 0,
  };
}

function defaultContext(): JDAgentContextMeta {
  return {
    used: false,
    query: '',
    textLength: 0,
    contextText: '',
    matches: [],
    warnings: [],
  };
}

export async function getJobDescriptionContext(
  userId: string,
  jobDescriptionId: string,
): Promise<JobDescriptionContextDto | null> {
  const jobDescription = await getJobDescriptionById(userId, jobDescriptionId);
  if (!jobDescription) {
    return null;
  }

  const context = jobDescription.generationMeta?.context ?? defaultContext();
  const matches = Array.isArray(context.matches) ? context.matches : [];
  const missingContentChunkIds = matches
    .filter((match) => !match.content?.trim() && !match.chunkId.endsWith(':fallback'))
    .map((match) => match.chunkId);
  const chunkSnapshots = await listKnowledgeDocumentChunksByIds(userId, missingContentChunkIds);
  const chunksById = new Map(chunkSnapshots.map((chunk) => [chunk.id, chunk]));

  const hydratedMatches: JobDescriptionContextMatchDto[] = matches.map((match, index) => {
    const chunk = chunksById.get(match.chunkId);
    const content = match.content?.trim() || chunk?.content.trim() || '';
    return {
      score: match.score,
      documentId: match.documentId,
      chunkId: match.chunkId,
      chunkIndex: match.chunkIndex,
      filename: match.filename || chunk?.filename || 'unknown',
      title: match.title ?? chunk?.title ?? null,
      sourceLabel: match.sourceLabel ?? chunk?.sourceLabel ?? null,
      content,
      selectedRank: match.selectedRank ?? index + 1,
      reason: match.reason ?? '本次生成选入的知识库片段',
    };
  });

  const contextText =
    context.contextText?.trim() ||
    hydratedMatches
      .filter((match) => match.content.trim())
      .map(formatKnowledgeSource)
      .join('\n\n');

  return {
    jobDescription: {
      id: jobDescription.id,
      department: jobDescription.department,
      position: jobDescription.position,
      updatedAt: jobDescription.updatedAt,
    },
    context: {
      used: Boolean(context.used || contextText.trim()),
      query: context.query ?? '',
      textLength: contextText.length || context.textLength || 0,
      contextText,
      matches: hydratedMatches,
      selection: createFallbackSelection({
        context,
        selectedCount: hydratedMatches.length,
      }),
      warnings: context.warnings ?? [],
    },
  };
}
