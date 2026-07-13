/** @jest-environment node */
import './test-env';
import {
  assertPostgresReachable,
  ensureIntegrationSchema,
  requireIntegrationEnv,
} from './test-env';

const requireAuthMock = jest.fn();
const embedDocumentsMock = jest.fn();
const retrieveConversationContextMock = jest.fn();
const streamChatReplyMock = jest.fn();

jest.mock('@/lib/auth/session', () => ({
  requireAuth: (...args: unknown[]) => requireAuthMock(...args),
  UnauthorizedError: class UnauthorizedError extends Error {
    status = 401;
  },
}));

jest.mock('@/lib/rag/embed', () => ({
  embedDocuments: (...args: unknown[]) => embedDocumentsMock(...args),
  getConfiguredEmbeddingModel: () => 'text-embedding-v3',
}));

jest.mock('@/lib/rag/retrieval', () => ({
  retrieveConversationContext: (...args: unknown[]) => retrieveConversationContextMock(...args),
}));

jest.mock('@/lib/llm', () => ({
  streamChatReply: (...args: unknown[]) => streamChatReplyMock(...args),
}));

import { POST as postConversationDocument } from '@/app/api/conversations/[id]/documents/route';
import { POST as postStreamMessage } from '@/app/api/conversations/[id]/messages/stream/route';
import { ingestConversationDocument } from '@/lib/rag/ingest';
import { prisma } from '@/lib/prisma';

const RAG_TEST_USER = {
  id: 'rag-int-user',
  username: 'rag-int-user',
  passwordHash: 'pbkdf2_sha256$fixture',
  email: 'rag-int-user@example.com',
};

describe('conversation markdown rag ingest integration', () => {
  beforeAll(async () => {
    requireIntegrationEnv('POSTGRES_HOST');
    requireIntegrationEnv('POSTGRES_PORT');
    requireIntegrationEnv('POSTGRES_USER');
    requireIntegrationEnv('POSTGRES_DATABASE');
    await ensureIntegrationSchema();
    await assertPostgresReachable();
  }, 60000);

  beforeEach(() => {
    requireAuthMock.mockReset();
    embedDocumentsMock.mockReset();
    retrieveConversationContextMock.mockReset();
    streamChatReplyMock.mockReset();
    requireAuthMock.mockResolvedValue({ user: { id: 'rag-int-user' } });
  });

  afterEach(async () => {
    jest.restoreAllMocks();
    await prisma.user.deleteMany({ where: { id: 'rag-int-user' } });
  });

  it('ingests uploaded markdown and returns ready after synchronous ingest', async () => {
    await prisma.user.upsert({
      where: { id: 'rag-int-user' },
      update: {},
      create: RAG_TEST_USER,
    });
    embedDocumentsMock.mockImplementation(async (documents: string[]) =>
      documents.map((_, index) => [index + 0.1, index + 0.2, index + 0.3]),
    );

    const conversation = await prisma.conversation.create({
      data: {
        userId: 'rag-int-user',
        status: 'active',
        lastActiveAt: new Date(),
      },
    });

    const res = await postConversationDocument(
      {
        formData: async () =>
          ({
            get: () =>
              ({
                name: 'policy.md',
                size: 64,
                text: async () => '# Policy\n\nPTO is 20 days.\n\n## Carry-over\nDetails here.',
              }) as FormDataEntryValue,
          }) as FormData,
      } as Request,
      { params: Promise.resolve({ id: conversation.id }) },
    );

    expect(res.status).toBe(201);
    const body = (await res.json()) as { document: { id: string; status: string } };
    expect(body.document.status).toBe('ready');

    const document = await prisma.conversationDocument.findUnique({
      where: { id: body.document.id },
    });
    expect(document?.status).toBe('ready');
    expect(document?.errorMessage).toBeNull();

    const chunks = await prisma.conversationDocumentChunk.findMany({
      where: { documentId: body.document.id },
      orderBy: { chunkIndex: 'asc' },
    });
    expect(chunks.length).toBeGreaterThan(0);
    expect(chunks.every((chunk) => chunk.embeddingModel === 'text-embedding-v3')).toBe(true);
    expect(chunks.every((chunk) => chunk.embeddingDimension === 3)).toBe(true);

    const withEmbedding = await prisma.$queryRaw<Array<{ n: number }>>`
      SELECT COUNT(*)::int AS n
      FROM "public"."conversation_document_chunks"
      WHERE "document_id" = ${body.document.id} AND "embedding" IS NOT NULL
    `;
    expect(withEmbedding[0]?.n).toBe(chunks.length);
  }, 30000);

  it('marks document failed when embeddings fail', async () => {
    embedDocumentsMock.mockRejectedValueOnce(new Error('embedding down'));
    await prisma.user.upsert({
      where: { id: 'rag-int-user' },
      update: {},
      create: RAG_TEST_USER,
    });

    const conversation = await prisma.conversation.create({
      data: {
        userId: 'rag-int-user',
        status: 'active',
        lastActiveAt: new Date(),
      },
    });
    const document = await prisma.conversationDocument.create({
      data: {
        conversationId: conversation.id,
        filename: 'broken.md',
        contentMarkdown: '# Broken\ncontent',
        status: 'processing',
      },
    });

    await expect(ingestConversationDocument(document.id, conversation.id)).rejects.toThrow(
      /embedding down/,
    );

    const latest = await prisma.conversationDocument.findUnique({
      where: { id: document.id },
    });
    expect(latest?.status).toBe('failed');
    expect(String(latest?.errorMessage)).toContain('embedding down');
  });

  it('uses deterministic chunk ids across re-ingest runs', async () => {
    await prisma.user.upsert({
      where: { id: 'rag-int-user' },
      update: {},
      create: RAG_TEST_USER,
    });
    embedDocumentsMock.mockImplementation(async (documents: string[]) =>
      documents.map((_, index) => [index + 1, index + 2, index + 3]),
    );

    const conversation = await prisma.conversation.create({
      data: {
        userId: 'rag-int-user',
        status: 'active',
        lastActiveAt: new Date(),
      },
    });
    const document = await prisma.conversationDocument.create({
      data: {
        conversationId: conversation.id,
        filename: 'idempotent.md',
        contentMarkdown: '# A\nx\n## B\ny',
        status: 'processing',
      },
    });

    await ingestConversationDocument(document.id, conversation.id);

    const firstChunks = await prisma.conversationDocumentChunk.findMany({
      where: { documentId: document.id },
      orderBy: { chunkIndex: 'asc' },
    });
    expect(firstChunks.length).toBeGreaterThan(0);
    const firstIds = firstChunks.map((chunk) => chunk.id);

    await prisma.conversationDocument.update({
      where: { id: document.id },
      data: { status: 'processing', errorMessage: null },
    });

    await ingestConversationDocument(document.id, conversation.id);

    const secondChunks = await prisma.conversationDocumentChunk.findMany({
      where: { documentId: document.id },
      orderBy: { chunkIndex: 'asc' },
    });
    expect(secondChunks.map((chunk) => chunk.id)).toEqual(firstIds);
  });

  it('prevents concurrent ingest race for the same document', async () => {
    await prisma.user.upsert({
      where: { id: 'rag-int-user' },
      update: {},
      create: RAG_TEST_USER,
    });

    let release: (() => void) | null = null;
    const gate = new Promise<void>((resolve) => {
      release = resolve;
    });
    embedDocumentsMock.mockImplementation(async (documents: string[]) => {
      await gate;
      return documents.map((_, index) => [index + 10, index + 20, index + 30]);
    });

    const conversation = await prisma.conversation.create({
      data: {
        userId: 'rag-int-user',
        status: 'active',
        lastActiveAt: new Date(),
      },
    });
    const document = await prisma.conversationDocument.create({
      data: {
        conversationId: conversation.id,
        filename: 'race.md',
        contentMarkdown: '# Race\ncontent',
        status: 'processing',
      },
    });

    const runA = ingestConversationDocument(document.id, conversation.id);
    const runB = ingestConversationDocument(document.id, conversation.id);
    release?.();

    await Promise.all([runA, runB]);

    const latest = await prisma.conversationDocument.findUnique({
      where: { id: document.id },
    });
    expect(latest?.status).toBe('ready');
    expect(latest?.errorMessage).toBeNull();
    expect(embedDocumentsMock).toHaveBeenCalledTimes(1);
  });

  it('reclaims stale processing claims after lease timeout', async () => {
    await prisma.user.upsert({
      where: { id: 'rag-int-user' },
      update: {},
      create: RAG_TEST_USER,
    });
    embedDocumentsMock.mockResolvedValue([[0.11, 0.22, 0.33]]);

    const conversation = await prisma.conversation.create({
      data: {
        userId: 'rag-int-user',
        status: 'active',
        lastActiveAt: new Date(),
      },
    });
    const document = await prisma.conversationDocument.create({
      data: {
        conversationId: conversation.id,
        filename: 'stale.md',
        contentMarkdown: '# Stale\nclaim',
        status: 'processing',
        errorMessage: 'ingest:stale-holder',
      },
    });

    const oldDate = new Date(Date.now() - 40 * 60 * 1000);
    await prisma.conversationDocument.update({
      where: { id: document.id },
      data: { updatedAt: oldDate },
    });

    await ingestConversationDocument(document.id, conversation.id);

    const latest = await prisma.conversationDocument.findUnique({
      where: { id: document.id },
    });
    expect(latest?.status).toBe('ready');
    expect(latest?.errorMessage).toBeNull();
  });

  it('does not reclaim a valid in-flight claim within lease window', async () => {
    await prisma.user.upsert({
      where: { id: 'rag-int-user' },
      update: {},
      create: RAG_TEST_USER,
    });
    embedDocumentsMock.mockResolvedValue([[0.51, 0.52, 0.53]]);

    const conversation = await prisma.conversation.create({
      data: {
        userId: 'rag-int-user',
        status: 'active',
        lastActiveAt: new Date(),
      },
    });
    const document = await prisma.conversationDocument.create({
      data: {
        conversationId: conversation.id,
        filename: 'within-lease.md',
        contentMarkdown: '# Lease\nwindow',
        status: 'processing',
        errorMessage: 'ingest:active-holder',
      },
    });

    const recentDate = new Date(Date.now() - 10 * 60 * 1000);
    await prisma.conversationDocument.update({
      where: { id: document.id },
      data: { updatedAt: recentDate },
    });

    await ingestConversationDocument(document.id, conversation.id);

    const latest = await prisma.conversationDocument.findUnique({
      where: { id: document.id },
    });
    expect(latest?.status).toBe('processing');
    expect(latest?.errorMessage).toBe('ingest:active-holder');
    expect(embedDocumentsMock).not.toHaveBeenCalled();
  });

  it('throws when CAS completion fails and fail CAS also misses', async () => {
    await prisma.user.upsert({
      where: { id: 'rag-int-user' },
      update: {},
      create: RAG_TEST_USER,
    });

    const conversation = await prisma.conversation.create({
      data: {
        userId: 'rag-int-user',
        status: 'active',
        lastActiveAt: new Date(),
      },
    });
    const document = await prisma.conversationDocument.create({
      data: {
        conversationId: conversation.id,
        filename: 'cas-false.md',
        contentMarkdown: '# CAS\nfalse',
        status: 'processing',
      },
    });

    embedDocumentsMock.mockImplementationOnce(async () => {
      await prisma.conversationDocument.update({
        where: { id: document.id },
        data: {
          status: 'failed',
          errorMessage: null,
        },
      });
      return [[1.1, 1.2, 1.3]];
    });

    await expect(ingestConversationDocument(document.id, conversation.id)).rejects.toThrow(
      /failed to atomically mark document failed/,
    );

    const latest = await prisma.conversationDocument.findUnique({
      where: { id: document.id },
    });
    expect(latest?.status).toBe('failed');
  });

  it('answers from conversation document context in stream route', async () => {
    await prisma.user.upsert({
      where: { id: 'rag-int-user' },
      update: {},
      create: RAG_TEST_USER,
    });
    const conversation = await prisma.conversation.create({
      data: {
        userId: 'rag-int-user',
        status: 'active',
        lastActiveAt: new Date(),
      },
    });
    const document = await prisma.conversationDocument.create({
      data: {
        conversationId: conversation.id,
        filename: 'handbook.md',
        contentMarkdown: '# PTO\n20 days per handbook.',
        status: 'ready',
      },
    });
    retrieveConversationContextMock.mockResolvedValue({
      contextText: 'PTO is 20 days per handbook.',
      matches: [],
    });
    streamChatReplyMock.mockImplementation(
      async (_conversationId: string, _input: string, options?: { retrievedContext?: string }) => {
        const answer = String(options?.retrievedContext).includes('20 days')
          ? 'PTO is 20 days.'
          : 'No context found.';
        return {
          chunks: (async function* () {
            yield answer;
          })(),
          collect: async () => answer,
        };
      },
    );

    const response = await postStreamMessage(
      {
        json: async () => ({
          content: 'How many PTO days?',
          documentId: document.id,
        }),
      } as Request,
      { params: Promise.resolve({ id: conversation.id }) },
    );

    const text = await readTextStream(response.body);
    expect(text).toContain('20');
    expect(retrieveConversationContextMock).toHaveBeenCalledWith(
      expect.objectContaining({
        conversationId: conversation.id,
        documentId: document.id,
      }),
    );
    expect(streamChatReplyMock).toHaveBeenCalledWith(
      conversation.id,
      'How many PTO days?',
      expect.objectContaining({
        retrievedContext: expect.stringContaining('20 days'),
      }),
    );
  });

  it('returns 502 when retrieval throws', async () => {
    await prisma.user.upsert({
      where: { id: 'rag-int-user' },
      update: {},
      create: RAG_TEST_USER,
    });
    const conversation = await prisma.conversation.create({
      data: {
        userId: 'rag-int-user',
        status: 'active',
        lastActiveAt: new Date(),
      },
    });
    const document = await prisma.conversationDocument.create({
      data: {
        conversationId: conversation.id,
        filename: 'x.md',
        contentMarkdown: 'x',
        status: 'ready',
      },
    });
    retrieveConversationContextMock.mockRejectedValueOnce(new Error('pgvector unavailable'));

    const response = await postStreamMessage(
      {
        json: async () => ({ content: 'hello', documentId: document.id }),
      } as Request,
      { params: Promise.resolve({ id: conversation.id }) },
    );

    expect(response.status).toBe(502);
    const data = (await response.json()) as { error?: string; code?: string };
    expect(data.code).toBe('RAG_RETRIEVAL_FAILED');
    expect(String(data.error)).toContain('pgvector unavailable');
    expect(streamChatReplyMock).not.toHaveBeenCalled();
  });
});

async function readTextStream(body: ReadableStream<Uint8Array> | null): Promise<string> {
  if (!body) {
    return '';
  }
  const decoder = new TextDecoder();
  const reader = body.getReader();
  let text = '';
  while (true) {
    const part = await reader.read();
    if (part.done) {
      break;
    }
    text += decoder.decode(part.value);
  }
  return text;
}
