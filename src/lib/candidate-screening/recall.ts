import { env } from '@/lib/env';
import { embedQuery } from '@/lib/rag/embed';
import { searchCandidateResumeChunks } from './repo';

export async function recallCandidatesForJd(params: {
  userId: string;
  retrievalQuery: string;
  topK: number;
  allowAlreadyContacted: boolean;
}) {
  const query = params.retrievalQuery.trim();
  if (!query || params.topK <= 0) {
    return [];
  }

  const queryVector = await embedQuery(query);
  return searchCandidateResumeChunks({
    userId: params.userId,
    queryVector,
    embeddingModel: env.OPENAI_EMBEDDING_MODEL,
    topK: params.topK,
    allowAlreadyContacted: params.allowAlreadyContacted,
  });
}
