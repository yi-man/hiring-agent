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

function isCollectionAlreadyExistsError(error: unknown): boolean {
  const maybeError = error as {
    status?: number;
    statusCode?: number;
    message?: string;
    data?: { status?: { error?: string } };
  } | null;
  const message = `${maybeError?.message ?? ''} ${maybeError?.data?.status?.error ?? ''}`;
  return (
    maybeError?.status === 409 ||
    maybeError?.statusCode === 409 ||
    /already exists|conflict/i.test(message)
  );
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

  try {
    await client.createCollection(qdrantCollectionName, {
      vectors: {
        size: options.vectorSize,
        distance,
      },
    });
  } catch (error) {
    // Handle concurrent creators; if another worker created it, treat as success.
    if (!isCollectionAlreadyExistsError(error)) {
      throw error;
    }

    await client.getCollection(qdrantCollectionName);
  }
}
