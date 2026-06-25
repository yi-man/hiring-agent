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

async function pgvectorAvailable(): Promise<boolean> {
  try {
    await prisma.$executeRawUnsafe('CREATE EXTENSION IF NOT EXISTS vector');
    await prisma.$queryRawUnsafe("SELECT '[1,2,3]'::vector");
    return true;
  } catch {
    return false;
  }
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

  afterEach(async () => {
    await prisma.user.deleteMany({ where: { id: { in: [USER_A.id, USER_B.id] } } });
  });

  it('stores vectors in postgres and keeps retrieval scoped by user', async () => {
    if (!(await pgvectorAvailable())) {
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
          content: 'USER_A private knowledge about mango benefits.',
          tokenEstimate: 8,
          embedding: [1, 0, 0],
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

    expect(rows).toHaveLength(1);
    expect(rows[0]?.userId).toBe(USER_A.id);
    expect(rows[0]?.content).toContain('USER_A');
  });
});
