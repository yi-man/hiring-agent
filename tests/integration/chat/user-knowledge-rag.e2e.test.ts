/** @jest-environment node */
import './test-env';
import {
  assertPostgresReachable,
  ensureIntegrationSchema,
  requireIntegrationEnv,
} from './test-env';
import { prisma } from '@/lib/prisma';
import {
  createKnowledgeDocument,
  replaceKnowledgeDocumentChunks,
  searchKnowledgeDocumentChunks,
} from '@/lib/rag/knowledge-repo';

const USER_A = {
  id: 'knowledge-user-a',
  username: 'knowledge-user-a',
  passwordHash: 'pbkdf2_sha256$fixture',
  email: 'knowledge-user-a@example.com',
};

const USER_B = {
  id: 'knowledge-user-b',
  username: 'knowledge-user-b',
  passwordHash: 'pbkdf2_sha256$fixture',
  email: 'knowledge-user-b@example.com',
};

function truthyEnv(value: string | undefined): boolean {
  return ['1', 'true', 'yes'].includes(value?.toLowerCase() ?? '');
}

function shouldRequirePgvector(): boolean {
  return truthyEnv(process.env.CI) || truthyEnv(process.env.REQUIRE_PGVECTOR);
}

function getErrorRecord(error: unknown): Record<string, unknown> | null {
  return typeof error === 'object' && error !== null ? (error as Record<string, unknown>) : null;
}

function postgresErrorCode(error: unknown): string | undefined {
  const record = getErrorRecord(error);
  const meta = getErrorRecord(record?.meta);
  const metaCode = meta?.code;
  if (typeof metaCode === 'string') {
    return metaCode;
  }

  const code = record?.code;
  return typeof code === 'string' ? code : undefined;
}

function errorMessage(error: unknown): string {
  const record = getErrorRecord(error);
  const meta = getErrorRecord(record?.meta);
  const metaMessage = meta?.message;
  const message = error instanceof Error ? error.message : String(error);

  return typeof metaMessage === 'string' ? `${message}\n${metaMessage}` : message;
}

function isPgvectorUnavailableError(error: unknown): boolean {
  const code = postgresErrorCode(error);
  const message = errorMessage(error).toLowerCase();
  const mentionsUnavailableVectorExtension =
    message.includes('extension "vector" is not available') ||
    message.includes('could not open extension control file') ||
    message.includes('vector.control') ||
    message.includes('type "vector" does not exist');

  return (
    (code === '0A000' || code === '42704' || code === 'P2010') && mentionsUnavailableVectorExtension
  );
}

async function pgvectorAvailable(): Promise<boolean> {
  try {
    await prisma.$executeRawUnsafe('CREATE EXTENSION IF NOT EXISTS vector');
    await prisma.$queryRawUnsafe("SELECT '[1,2,3]'::vector::text");
    return true;
  } catch (error) {
    if (isPgvectorUnavailableError(error)) {
      return false;
    }

    throw error;
  }
}

async function deleteTestUsers(): Promise<void> {
  await prisma.user.deleteMany({ where: { id: { in: [USER_A.id, USER_B.id] } } });
}

describe('user knowledge pgvector integration', () => {
  beforeAll(async () => {
    requireIntegrationEnv('POSTGRES_HOST');
    requireIntegrationEnv('POSTGRES_PORT');
    requireIntegrationEnv('POSTGRES_USER');
    requireIntegrationEnv('POSTGRES_DATABASE');
    await ensureIntegrationSchema();
    await assertPostgresReachable();
  }, 60000);

  beforeEach(async () => {
    await deleteTestUsers();
  });

  afterEach(async () => {
    await deleteTestUsers();
  });

  it('stores vectors in postgres and keeps retrieval scoped by user', async () => {
    if (!(await pgvectorAvailable())) {
      if (shouldRequirePgvector()) {
        throw new Error('pgvector extension is required in CI or when REQUIRE_PGVECTOR=true');
      }

      console.warn('Skipping pgvector integration because extension is unavailable');
      return;
    }

    await prisma.user.upsert({
      where: { id: USER_A.id },
      update: {},
      create: USER_A,
    });
    await prisma.user.upsert({
      where: { id: USER_B.id },
      update: {},
      create: USER_B,
    });

    const embeddingModel = 'text-embedding-3-small';
    const docA = await createKnowledgeDocument({
      userId: USER_A.id,
      filename: 'user-a-handbook.md',
      title: 'User A handbook',
      contentMarkdown: '# User A\nUser A content includes mango benefits.',
      status: 'ready',
    });
    const docB = await createKnowledgeDocument({
      userId: USER_B.id,
      filename: 'user-b-handbook.md',
      title: 'User B handbook',
      contentMarkdown: '# User B\nUser B content includes mango benefits.',
      status: 'ready',
    });

    await replaceKnowledgeDocumentChunks({
      documentId: docA.id,
      userId: USER_A.id,
      embeddingModel,
      chunks: [
        {
          chunkIndex: 0,
          content: 'USER_A nearest private knowledge about mango benefits.',
          tokenEstimate: 8,
          embedding: [1, 0, 0],
        },
        {
          chunkIndex: 1,
          content: 'USER_A far private knowledge about mango benefits.',
          tokenEstimate: 8,
          embedding: [0, 1, 0],
        },
      ],
    });
    await replaceKnowledgeDocumentChunks({
      documentId: docB.id,
      userId: USER_B.id,
      embeddingModel,
      chunks: [
        {
          chunkIndex: 0,
          content: 'USER_B private knowledge about mango benefits.',
          tokenEstimate: 8,
          embedding: [1, 0, 0],
        },
      ],
    });

    const rows = await searchKnowledgeDocumentChunks({
      userId: USER_A.id,
      queryVector: [1, 0, 0],
      embeddingModel,
      topK: 5,
    });

    expect(rows).toHaveLength(2);
    expect(rows[0]?.userId).toBe(USER_A.id);
    expect(rows[0]?.content).toContain('USER_A nearest');
    expect(rows[1]?.userId).toBe(USER_A.id);
    expect(rows[1]?.content).toContain('USER_A far');
    expect(rows[0]?.score).toBeGreaterThan(rows[1]?.score ?? Number.POSITIVE_INFINITY);

    const userBRows = await searchKnowledgeDocumentChunks({
      userId: USER_B.id,
      queryVector: [1, 0, 0],
      embeddingModel,
      topK: 5,
    });

    expect(userBRows).toHaveLength(1);
    expect(userBRows[0]?.userId).toBe(USER_B.id);
    expect(userBRows[0]?.content).toContain('USER_B');
  });
});
