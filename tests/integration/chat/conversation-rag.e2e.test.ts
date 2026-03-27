/** @jest-environment node */
import './test-env';
import { assertMysqlReachable, ensureIntegrationSchema, requireIntegrationEnv } from './test-env';

const requireAuthMock = jest.fn();
const embedDocumentsMock = jest.fn();
const qdrantUpsertMock = jest.fn();
const ensureCollectionMock = jest.fn();

jest.mock('@/lib/auth/session', () => ({
  requireAuth: (...args: unknown[]) => requireAuthMock(...args),
  UnauthorizedError: class UnauthorizedError extends Error {
    status = 401;
  },
}));

jest.mock('@/lib/rag/embed', () => ({
  embedDocuments: (...args: unknown[]) => embedDocumentsMock(...args),
}));

jest.mock('@/lib/rag/qdrant', () => ({
  qdrantCollectionName: 'conversation_markdown_chunks',
  ensureCollection: (...args: unknown[]) => ensureCollectionMock(...args),
  getQdrantClient: () => ({
    upsert: (...args: unknown[]) => qdrantUpsertMock(...args),
  }),
}));

import { POST as postConversationDocument } from '@/app/api/conversations/[id]/documents/route';
import { ingestConversationDocument } from '@/lib/rag/ingest';
import { prisma } from '@/lib/prisma';

const isCI = process.env.CI === 'true' || process.env.GITHUB_ACTIONS === 'true';
const hasDbEnv = Boolean(
  process.env.MYSQL_HOST &&
  process.env.MYSQL_PORT &&
  process.env.MYSQL_USER &&
  process.env.MYSQL_PASS &&
  process.env.MYSQL_DATABASE,
);
const describeRagIngestIntegration = hasDbEnv || isCI ? describe : describe.skip;

async function waitForDocumentStatus(
  documentId: string,
  expectedStatus: 'ready' | 'failed',
  timeoutMs = 5000,
): Promise<void> {
  const startedAt = Date.now();
  while (Date.now() - startedAt < timeoutMs) {
    const latest = await prisma.conversationDocument.findUnique({
      where: { id: documentId },
    });
    if (latest?.status === expectedStatus) {
      return;
    }
    await new Promise((resolve) => setTimeout(resolve, 50));
  }
  throw new Error(`timed out waiting for document ${documentId} to become ${expectedStatus}`);
}

describeRagIngestIntegration('conversation markdown rag ingest integration', () => {
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
    requireAuthMock.mockResolvedValue({ user: { id: 'rag-int-user' } });
  });

  afterEach(async () => {
    await prisma.user.deleteMany({ where: { id: 'rag-int-user' } });
  });

  it('ingests uploaded markdown and transitions processing -> ready', async () => {
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
    expect(body.document.status).toBe('processing');

    await waitForDocumentStatus(body.document.id, 'ready');

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
  });
});
