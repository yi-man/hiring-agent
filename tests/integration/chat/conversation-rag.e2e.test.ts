/** @jest-environment node */
import './test-env';
import { assertMysqlReachable, ensureIntegrationSchema, requireIntegrationEnv } from './test-env';

const requireAuthMock = jest.fn();
const embedDocumentsMock = jest.fn();
const qdrantUpsertMock = jest.fn();
const ensureCollectionMock = jest.fn();
const deleteDocumentPointsMock = jest.fn();
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
}));

jest.mock('@/lib/rag/retrieval', () => ({
  retrieveConversationContext: (...args: unknown[]) => retrieveConversationContextMock(...args),
}));

jest.mock('@/lib/chat/chain', () => ({
  streamChatReply: (...args: unknown[]) => streamChatReplyMock(...args),
}));

jest.mock('@/lib/rag/qdrant', () => ({
  qdrantCollectionName: 'conversation_markdown_chunks',
  ensureCollection: (...args: unknown[]) => ensureCollectionMock(...args),
  deleteDocumentPoints: (...args: unknown[]) => deleteDocumentPointsMock(...args),
  createDeterministicQdrantPointId: (params: {
    documentId: string;
    version: number;
    chunkIndex: number;
  }) => {
    const raw = `${params.version}${params.chunkIndex}${params.documentId}`.replace(
      /[^a-zA-Z0-9]/g,
      '',
    );
    const suffix = raw.padEnd(12, '0').slice(0, 12);
    return `00000000-0000-0000-0000-${suffix}`;
  },
  getQdrantClient: () => ({
    upsert: (...args: unknown[]) => qdrantUpsertMock(...args),
  }),
}));

import { POST as postConversationDocument } from '@/app/api/conversations/[id]/documents/route';
import { POST as postStreamMessage } from '@/app/api/conversations/[id]/messages/stream/route';
import { ingestConversationDocument } from '@/lib/rag/ingest';
import { prisma } from '@/lib/prisma';

describe('conversation markdown rag ingest integration', () => {
  beforeAll(async () => {
    requireIntegrationEnv('MYSQL_HOST');
    requireIntegrationEnv('MYSQL_PORT');
    requireIntegrationEnv('MYSQL_USER');
    requireIntegrationEnv('MYSQL_PASS');
    requireIntegrationEnv('MYSQL_DATABASE');
    await ensureIntegrationSchema();
    await assertMysqlReachable();
  }, 60000);

  beforeEach(() => {
    requireAuthMock.mockReset();
    embedDocumentsMock.mockReset();
    qdrantUpsertMock.mockReset();
    ensureCollectionMock.mockReset();
    deleteDocumentPointsMock.mockReset();
    retrieveConversationContextMock.mockReset();
    streamChatReplyMock.mockReset();
    requireAuthMock.mockResolvedValue({ user: { id: 'rag-int-user' } });
    deleteDocumentPointsMock.mockResolvedValue(undefined);
  });

  afterEach(async () => {
    await prisma.user.deleteMany({ where: { id: 'rag-int-user' } });
  });

  it('ingests uploaded markdown and returns ready after synchronous ingest', async () => {
    await prisma.user.upsert({
      where: { id: 'rag-int-user' },
      update: {},
      create: { id: 'rag-int-user', email: 'rag-int-user@example.com' },
    });
    embedDocumentsMock.mockImplementation(async (documents: string[]) =>
      documents.map((_, index) => [index + 0.1, index + 0.2, index + 0.3]),
    );
    ensureCollectionMock.mockResolvedValue(undefined);
    qdrantUpsertMock.mockResolvedValue({ status: 'ok' });

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
    expect(chunks.every((chunk) => typeof chunk.qdrantPointId === 'string')).toBe(true);

    expect(ensureCollectionMock).toHaveBeenCalledWith({ vectorSize: 3 });
    expect(qdrantUpsertMock).toHaveBeenCalledTimes(1);
    const [, upsertPayload] = qdrantUpsertMock.mock.calls[0] as [string, { points: unknown[] }];
    expect(upsertPayload.points.length).toBe(chunks.length);
  }, 30000);

  it('marks document failed when embeddings fail', async () => {
    embedDocumentsMock.mockRejectedValueOnce(new Error('embedding down'));
    await prisma.user.upsert({
      where: { id: 'rag-int-user' },
      update: {},
      create: { id: 'rag-int-user', email: 'rag-int-user@example.com' },
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
    expect(ensureCollectionMock).not.toHaveBeenCalled();
    expect(qdrantUpsertMock).not.toHaveBeenCalled();
  });

  it('uses deterministic point ids across re-ingest runs', async () => {
    await prisma.user.upsert({
      where: { id: 'rag-int-user' },
      update: {},
      create: { id: 'rag-int-user', email: 'rag-int-user@example.com' },
    });
    embedDocumentsMock.mockImplementation(async (documents: string[]) =>
      documents.map((_, index) => [index + 1, index + 2, index + 3]),
    );
    ensureCollectionMock.mockResolvedValue(undefined);
    qdrantUpsertMock.mockResolvedValue({ status: 'ok' });

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
    const firstPointIds = firstChunks.map((chunk) => chunk.qdrantPointId);

    await prisma.conversationDocument.update({
      where: { id: document.id },
      data: { status: 'processing', errorMessage: null },
    });

    await ingestConversationDocument(document.id, conversation.id);

    const secondChunks = await prisma.conversationDocumentChunk.findMany({
      where: { documentId: document.id },
      orderBy: { chunkIndex: 'asc' },
    });
    const secondPointIds = secondChunks.map((chunk) => chunk.qdrantPointId);
    expect(secondPointIds).toEqual(firstPointIds);
    expect(deleteDocumentPointsMock).toHaveBeenCalledTimes(2);
  });

  it('prevents concurrent ingest race for the same document', async () => {
    await prisma.user.upsert({
      where: { id: 'rag-int-user' },
      update: {},
      create: { id: 'rag-int-user', email: 'rag-int-user@example.com' },
    });

    let release: (() => void) | null = null;
    const gate = new Promise<void>((resolve) => {
      release = resolve;
    });
    embedDocumentsMock.mockImplementation(async (documents: string[]) => {
      await gate;
      return documents.map((_, index) => [index + 10, index + 20, index + 30]);
    });
    ensureCollectionMock.mockResolvedValue(undefined);
    qdrantUpsertMock.mockResolvedValue({ status: 'ok' });

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
      create: { id: 'rag-int-user', email: 'rag-int-user@example.com' },
    });
    embedDocumentsMock.mockResolvedValue([[0.11, 0.22, 0.33]]);
    ensureCollectionMock.mockResolvedValue(undefined);
    qdrantUpsertMock.mockResolvedValue({ status: 'ok' });

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
    await prisma.$executeRaw`
      UPDATE conversation_documents
      SET updated_at = ${oldDate}
      WHERE id = ${document.id}
    `;

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
      create: { id: 'rag-int-user', email: 'rag-int-user@example.com' },
    });
    embedDocumentsMock.mockResolvedValue([[0.51, 0.52, 0.53]]);
    ensureCollectionMock.mockResolvedValue(undefined);
    qdrantUpsertMock.mockResolvedValue({ status: 'ok' });

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
    await prisma.$executeRaw`
      UPDATE conversation_documents
      SET updated_at = ${recentDate}
      WHERE id = ${document.id}
    `;

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
      create: { id: 'rag-int-user', email: 'rag-int-user@example.com' },
    });
    embedDocumentsMock.mockResolvedValue([[1.1, 1.2, 1.3]]);
    ensureCollectionMock.mockResolvedValue(undefined);

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

    qdrantUpsertMock.mockImplementationOnce(async () => {
      await prisma.conversationDocument.update({
        where: { id: document.id },
        data: {
          status: 'failed',
          errorMessage: null,
        },
      });
      return { status: 'ok' };
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
      create: { id: 'rag-int-user', email: 'rag-int-user@example.com' },
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
      create: { id: 'rag-int-user', email: 'rag-int-user@example.com' },
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
    retrieveConversationContextMock.mockRejectedValueOnce(new Error('qdrant unavailable'));

    const response = await postStreamMessage(
      {
        json: async () => ({ content: 'hello', documentId: document.id }),
      } as Request,
      { params: Promise.resolve({ id: conversation.id }) },
    );

    expect(response.status).toBe(502);
    const data = (await response.json()) as { error?: string; code?: string };
    expect(data.code).toBe('RAG_RETRIEVAL_FAILED');
    expect(String(data.error)).toContain('qdrant unavailable');
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
