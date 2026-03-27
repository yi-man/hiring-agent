/** @jest-environment node */
import './test-env';
import { prisma } from '@/lib/prisma';
import { ensureIntegrationSchema } from './test-env';

const isCI = process.env.CI === 'true' || process.env.GITHUB_ACTIONS === 'true';
const hasDbEnv = Boolean(
  process.env.MYSQL_HOST &&
  process.env.MYSQL_PORT &&
  process.env.MYSQL_USER &&
  process.env.MYSQL_PASS &&
  process.env.MYSQL_DATABASE,
);
const describeDbIntegration = hasDbEnv || isCI ? describe : describe.skip;

describeDbIntegration('rag chunk integrity constraints', () => {
  beforeAll(async () => {
    await ensureIntegrationSchema();
  }, 60000);

  it('rejects inserting chunk with conversation_id that mismatches parent document', async () => {
    const conversationA = await prisma.conversation.create({
      data: { status: 'active', lastActiveAt: new Date() },
    });
    const conversationB = await prisma.conversation.create({
      data: { status: 'active', lastActiveAt: new Date() },
    });

    const document = await prisma.conversationDocument.create({
      data: {
        conversationId: conversationA.id,
        filename: 'policy.md',
        contentMarkdown: '# Policy',
        status: 'processing',
      },
    });

    await expect(
      prisma.conversationDocumentChunk.create({
        data: {
          documentId: document.id,
          conversationId: conversationB.id,
          chunkIndex: 0,
          content: 'PTO is 20 days',
        },
      }),
    ).rejects.toThrow();

    await expect(
      prisma.conversationDocumentChunk.create({
        data: {
          documentId: document.id,
          conversationId: conversationA.id,
          chunkIndex: 1,
          content: 'Valid chunk',
        },
      }),
    ).resolves.toBeDefined();

    await prisma.conversationDocumentChunk.deleteMany({
      where: { documentId: document.id },
    });
    await prisma.conversationDocumentIndexJob.deleteMany({
      where: { documentId: document.id },
    });
    await prisma.conversationDocument.delete({
      where: { id: document.id },
    });
    await prisma.conversation.deleteMany({
      where: { id: { in: [conversationA.id, conversationB.id] } },
    });
  });
});
