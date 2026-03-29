import { prisma } from '@/lib/prisma';
import { env } from '@/lib/env';
import { embedQuery } from '@/lib/rag/embed';
import { getQdrantClient, qdrantCollectionName } from '@/lib/rag/qdrant';

type RetrievalPayload = {
  conversationId?: unknown;
  documentId?: unknown;
  chunkId?: unknown;
  chunkIndex?: unknown;
  filename?: unknown;
  qdrantPointId?: unknown;
};

type RetrievalHit = {
  id?: unknown;
  score?: unknown;
  payload?: RetrievalPayload | null;
};

export type RetrievedContextMatch = {
  score: number;
  documentId: string | null;
  chunkId: string | null;
  chunkIndex: number | null;
  filename: string | null;
  qdrantPointId: string | null;
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
  const must: Array<{ key: string; match: { value: string } }> = [
    { key: 'conversationId', match: { value: params.conversationId } },
  ];
  if (scopedDocumentId) {
    must.push({ key: 'documentId', match: { value: scopedDocumentId } });
  }

  const rawHits = (await getQdrantClient().search(qdrantCollectionName, {
    vector: queryVector,
    limit: topK,
    score_threshold: env.RAG_MIN_SCORE,
    with_payload: true,
    filter: {
      must,
    },
  })) as RetrievalHit[];

  if (!Array.isArray(rawHits) || rawHits.length === 0) {
    return { contextText: '', matches: [] };
  }

  const pointIds = new Set<string>();
  for (const hit of rawHits) {
    const pointId = normalizePointId(hit.id);
    if (pointId) {
      pointIds.add(pointId);
    }
    const payloadChunkId = asString(hit.payload?.chunkId);
    if (payloadChunkId) {
      pointIds.add(payloadChunkId);
    }
  }

  const chunks =
    pointIds.size > 0
      ? await prisma.conversationDocumentChunk.findMany({
          where: {
            conversationId: params.conversationId,
            OR: [
              { id: { in: Array.from(pointIds) } },
              { qdrantPointId: { in: Array.from(pointIds) } },
            ],
          },
        })
      : [];

  const byId = new Map(chunks.map((chunk) => [chunk.id, chunk]));
  const byPointId = new Map(
    chunks
      .filter((chunk) => typeof chunk.qdrantPointId === 'string' && chunk.qdrantPointId.length > 0)
      .map((chunk) => [chunk.qdrantPointId as string, chunk]),
  );

  const selectedTexts: string[] = [];
  const matches: RetrievedContextMatch[] = [];
  let contextChars = 0;

  for (const hit of rawHits) {
    const score = asNumber(hit.score);
    if (score === null) {
      continue;
    }
    if (score < env.RAG_MIN_SCORE) {
      continue;
    }

    const payload = hit.payload ?? null;
    const payloadChunkId = asString(payload?.chunkId);
    const pointId = normalizePointId(hit.id);
    const chunk =
      (payloadChunkId ? byId.get(payloadChunkId) : undefined) ??
      (pointId ? byPointId.get(pointId) : undefined);
    if (!chunk) {
      continue;
    }
    const content = chunk.content.trim();
    if (!content) {
      continue;
    }

    const filename = asString(payload?.filename) ?? 'unknown';
    const chunkIndex = asInteger(payload?.chunkIndex) ?? chunk.chunkIndex;
    const formattedChunk = [
      `[source filename="${filename}" chunkIndex=${chunkIndex}]`,
      content,
    ].join('\n');

    const nextChars = contextChars + formattedChunk.length;
    if (nextChars > env.RAG_CONTEXT_MAX_CHARS) {
      continue;
    }
    contextChars = nextChars;
    selectedTexts.push(formattedChunk);
    matches.push({
      score,
      documentId: asString(payload?.documentId),
      chunkId: payloadChunkId ?? chunk.id,
      chunkIndex,
      filename,
      qdrantPointId: pointId,
    });
  }

  return {
    contextText: selectedTexts.join('\n\n'),
    matches,
  };
}

function asString(value: unknown): string | null {
  return typeof value === 'string' && value.length > 0 ? value : null;
}

function asNumber(value: unknown): number | null {
  return typeof value === 'number' && Number.isFinite(value) ? value : null;
}

function asInteger(value: unknown): number | null {
  if (typeof value !== 'number' || !Number.isFinite(value)) {
    return null;
  }
  return Math.trunc(value);
}

function normalizePointId(value: unknown): string | null {
  if (typeof value === 'string' && value.length > 0) {
    return value;
  }
  if (typeof value === 'number' && Number.isFinite(value)) {
    return String(value);
  }
  return null;
}
