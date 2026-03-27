import { QdrantClient } from '@qdrant/js-client-rest';
import { env } from '@/lib/env';

export const qdrantCollectionName = env.QDRANT_COLLECTION_NAME;

export type QdrantDistance = 'Cosine' | 'Euclid' | 'Dot' | 'Manhattan';

export type EnsureCollectionOptions = {
  vectorSize: number;
  distance?: QdrantDistance;
};

let qdrantClientSingleton: QdrantClient | null = null;

export function getQdrantClient(): QdrantClient {
  if (qdrantClientSingleton) {
    return qdrantClientSingleton;
  }

  qdrantClientSingleton = new QdrantClient({
    url: env.QDRANT_URL,
    apiKey: env.QDRANT_API_KEY,
  });
  return qdrantClientSingleton;
}

function isCollectionNotFoundError(error: unknown): boolean {
  const maybeError = error as { status?: number; statusCode?: number } | null;
  return maybeError?.status === 404 || maybeError?.statusCode === 404;
}

export async function ensureCollection(options: EnsureCollectionOptions): Promise<void> {
  const client = getQdrantClient();
  const distance = options.distance ?? 'Cosine';

  try {
    await client.getCollection(qdrantCollectionName);
    return;
  } catch (error) {
    if (!isCollectionNotFoundError(error)) {
      throw error;
    }
  }

  await client.createCollection(qdrantCollectionName, {
    vectors: {
      size: options.vectorSize,
      distance,
    },
  });
}
