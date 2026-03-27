import { env } from '@/lib/env';

const DEFAULT_EMBEDDING_MODEL = 'text-embedding-3-small';

type EmbedResponse = {
  data?: Array<{ embedding?: unknown }>;
  error?: { message?: string };
};

function getEmbeddingsUrl(): string {
  return `${env.OPENAI_BASE_URL.replace(/\/$/, '')}/embeddings`;
}

function getEmbeddingModel(model?: string): string {
  return model ?? DEFAULT_EMBEDDING_MODEL;
}

async function requestEmbeddings(input: string | string[], model?: string): Promise<number[][]> {
  if (!env.OPENAI_API_KEY) {
    throw new Error('OPENAI_API_KEY is not configured');
  }

  const controller = new AbortController();
  const timeout = setTimeout(() => controller.abort(), env.API_TIMEOUT);

  try {
    const response = await fetch(getEmbeddingsUrl(), {
      method: 'POST',
      headers: {
        'Content-Type': 'application/json',
        Authorization: `Bearer ${env.OPENAI_API_KEY}`,
      },
      body: JSON.stringify({
        model: getEmbeddingModel(model),
        input,
      }),
      signal: controller.signal,
    });

    const payload = (await response.json()) as EmbedResponse;
    if (!response.ok) {
      const message = payload.error?.message ?? `Embedding HTTP error (${response.status})`;
      throw new Error(message);
    }

    if (!Array.isArray(payload.data) || payload.data.length === 0) {
      throw new Error('Embedding API returned empty or malformed data payload');
    }

    return payload.data.map((item, index) => {
      const maybeVector = item.embedding;
      if (!Array.isArray(maybeVector) || maybeVector.length === 0) {
        throw new Error(`Embedding API returned empty or malformed vector at index ${index}`);
      }
      if (!maybeVector.every((value) => typeof value === 'number' && Number.isFinite(value))) {
        throw new Error(`Embedding API returned non-numeric vector values at index ${index}`);
      }
      return maybeVector;
    });
  } finally {
    clearTimeout(timeout);
  }
}

export async function embedQuery(query: string, model?: string): Promise<number[]> {
  const [first] = await requestEmbeddings(query, model);
  if (!first || first.length === 0) {
    throw new Error('Embedding API returned empty query vector');
  }
  return first;
}

export async function embedDocuments(documents: string[], model?: string): Promise<number[][]> {
  if (documents.length === 0) {
    return [];
  }
  return requestEmbeddings(documents, model);
}
