import { env } from '@/lib/env';
import { searchConversationDocumentChunks } from '@/lib/chat/repositories/document-repo';
import { embedQuery, getConfiguredEmbeddingModel } from '@/lib/rag/embed';

export type RetrievedContextMatch = {
  score: number;
  documentId: string | null;
  chunkId: string | null;
  chunkIndex: number | null;
  filename: string | null;
};

export async function retrieveConversationContext(params: {
  conversationId: string;
  query: string;
  topK?: number;
  documentId?: string | null;
}): Promise<{ contextText: string; matches: RetrievedContextMatch[] }> {
  const topK = params.topK ?? env.RAG_TOP_K;
  const query = params.query.trim();
  if (!query || topK <= 0) {
    return { contextText: '', matches: [] };
  }

  const scopedDocumentId =
    typeof params.documentId === 'string' && params.documentId.trim().length > 0
      ? params.documentId.trim()
      : null;

  const queryVector = await embedQuery(query);
  const rows = await searchConversationDocumentChunks({
    conversationId: params.conversationId,
    queryVector,
    embeddingModel: getConfiguredEmbeddingModel(),
    topK,
    minScore: env.RAG_MIN_SCORE,
    documentId: scopedDocumentId,
  });

  if (rows.length === 0) {
    return { contextText: '', matches: [] };
  }

  const selectedTexts: string[] = [];
  const matches: RetrievedContextMatch[] = [];
  let contextChars = 0;

  for (const row of rows) {
    const content = row.content.trim();
    if (!content) {
      continue;
    }

    const filename = row.filename.trim() || 'unknown';
    const formattedChunk = [
      `[source filename="${filename}" chunkIndex=${row.chunkIndex}]`,
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
      filename,
    });
  }

  return {
    contextText: selectedTexts.join('\n\n'),
    matches,
  };
}
