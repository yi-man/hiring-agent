import { env } from '@/lib/env';

type EmbedStandardResponse = {
  data?: Array<{ embedding?: unknown }>;
  error?: { message?: string };
};

type EmbedMultimodalResponse = {
  data?: { embedding?: unknown };
  error?: { message?: string };
};

function getEmbeddingsUrl(multimodal: boolean): string {
  const base = (env.EMBEDDING_BASE_URL ?? env.OPENAI_BASE_URL).replace(/\/$/, '');
  return multimodal ? `${base}/embeddings/multimodal` : `${base}/embeddings`;
}

export function getConfiguredEmbeddingModel(model?: string): string {
  return model ?? env.EMBEDDING_MODEL ?? env.OPENAI_EMBEDDING_MODEL;
}

function getEmbeddingApiKey(): string | undefined {
  return env.EMBEDDING_API_KEY ?? env.OPENAI_API_KEY;
}

function shouldUseMultimodalEmbedding(model: string): boolean {
  const flag = env.OPENAI_EMBEDDING_USE_MULTIMODAL;
  if (flag === 'true') return true;
  if (flag === 'false') return false;
  return /embedding-vision/i.test(model);
}

function assertNumericVector(maybeVector: unknown, index: number): number[] {
  if (!Array.isArray(maybeVector) || maybeVector.length === 0) {
    throw new Error(`Embedding API returned empty or malformed vector at index ${index}`);
  }
  if (!maybeVector.every((value) => typeof value === 'number' && Number.isFinite(value))) {
    throw new Error(`Embedding API returned non-numeric vector values at index ${index}`);
  }
  return maybeVector;
}

async function requestMultimodalEmbedding(text: string, model: string): Promise<number[]> {
  const apiKey = getEmbeddingApiKey();
  if (!apiKey) {
    throw new Error('EMBEDDING_API_KEY or OPENAI_API_KEY is not configured');
  }

  const controller = new AbortController();
  const timeout = setTimeout(() => controller.abort(), env.API_TIMEOUT);

  try {
    const response = await fetch(getEmbeddingsUrl(true), {
      method: 'POST',
      headers: {
        'Content-Type': 'application/json',
        Authorization: `Bearer ${apiKey}`,
      },
      body: JSON.stringify({
        model,
        input: [{ type: 'text', text }],
      }),
      signal: controller.signal,
    });

    const payload = (await response.json()) as EmbedMultimodalResponse;
    if (!response.ok) {
      const message = payload.error?.message ?? `Embedding HTTP error (${response.status})`;
      throw new Error(message);
    }

    const embedding = payload.data?.embedding;
    return assertNumericVector(embedding, 0);
  } finally {
    clearTimeout(timeout);
  }
}

async function requestStandardEmbeddings(
  input: string | string[],
  model: string,
): Promise<number[][]> {
  const apiKey = getEmbeddingApiKey();
  if (!apiKey) {
    throw new Error('EMBEDDING_API_KEY or OPENAI_API_KEY is not configured');
  }

  const controller = new AbortController();
  const timeout = setTimeout(() => controller.abort(), env.API_TIMEOUT);

  try {
    const response = await fetch(getEmbeddingsUrl(false), {
      method: 'POST',
      headers: {
        'Content-Type': 'application/json',
        Authorization: `Bearer ${apiKey}`,
      },
      body: JSON.stringify({
        model,
        input,
      }),
      signal: controller.signal,
    });

    const payload = (await response.json()) as EmbedStandardResponse;
    if (!response.ok) {
      const message = payload.error?.message ?? `Embedding HTTP error (${response.status})`;
      throw new Error(message);
    }

    if (!Array.isArray(payload.data) || payload.data.length === 0) {
      throw new Error('Embedding API returned empty or malformed data payload');
    }

    return payload.data.map((item, index) => assertNumericVector(item.embedding, index));
  } finally {
    clearTimeout(timeout);
  }
}

async function requestEmbeddings(input: string | string[], model?: string): Promise<number[][]> {
  const resolvedModel = getConfiguredEmbeddingModel(model);
  if (shouldUseMultimodalEmbedding(resolvedModel)) {
    const texts = Array.isArray(input) ? input : [input];
    return Promise.all(texts.map((t) => requestMultimodalEmbedding(t, resolvedModel)));
  }
  return requestStandardEmbeddings(input, resolvedModel);
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
