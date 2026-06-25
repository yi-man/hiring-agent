import { readFile } from 'node:fs/promises';
import { ensureDefaultUser } from '@/lib/auth/default-user';
import { closePrismaClient } from '@/lib/prisma';
import { ingestKnowledgeDocument } from '@/lib/rag/knowledge-ingest';
import {
  createKnowledgeDocument,
  createKnowledgeDocumentIndexJob,
  findKnowledgeDocumentBySourceLabel,
  markKnowledgeDocumentIndexJobFailed,
  markKnowledgeDocumentIndexJobRunning,
  markKnowledgeDocumentIndexJobSuccess,
  updateKnowledgeDocumentForReindex,
} from '@/lib/rag/knowledge-repo';

const FILENAME = 'bytedance-recruiting-handbook.synthetic.md';
const TITLE = '字节跳动招聘知识手册（合成样例）';
const SOURCE_LABEL = 'synthetic-bytedance-recruiting-handbook';
const FIXTURE_URL = new URL(
  '../lib/rag/fixtures/bytedance-recruiting-handbook.synthetic.md',
  import.meta.url,
);

async function upsertSyntheticKnowledgeDocument(userId: string, contentMarkdown: string) {
  // Local/manual seed only: sourceLabel is indexed but not unique, so do not run concurrently.
  const existing = await findKnowledgeDocumentBySourceLabel(userId, SOURCE_LABEL);
  if (existing) {
    const updated = await updateKnowledgeDocumentForReindex({
      userId,
      id: existing.id,
      filename: FILENAME,
      title: TITLE,
      contentMarkdown,
    });
    if (!updated) {
      throw new Error('failed to update existing synthetic knowledge document for reindex');
    }
    return updated;
  }

  return createKnowledgeDocument({
    userId,
    filename: FILENAME,
    title: TITLE,
    sourceLabel: SOURCE_LABEL,
    contentMarkdown,
    status: 'processing',
  });
}

async function main(): Promise<void> {
  let jobId: string | null = null;

  try {
    const contentMarkdown = await readFile(FIXTURE_URL, 'utf8');
    const user = await ensureDefaultUser();
    const document = await upsertSyntheticKnowledgeDocument(user.id, contentMarkdown);
    const job = await createKnowledgeDocumentIndexJob(document.id);
    jobId = job.id;

    await markKnowledgeDocumentIndexJobRunning(jobId);
    await ingestKnowledgeDocument({ userId: user.id, documentId: document.id });
    await markKnowledgeDocumentIndexJobSuccess(jobId);
    console.log(`[knowledge-seed] indexed ${FILENAME} for xxwade`);
  } catch (error) {
    const message = error instanceof Error ? error.message : String(error);
    console.error(`[knowledge-seed] failed to index ${FILENAME} for xxwade: ${message}`);
    if (jobId) {
      try {
        await markKnowledgeDocumentIndexJobFailed(jobId, message);
      } catch (markError) {
        const markMessage = markError instanceof Error ? markError.message : String(markError);
        console.error(`[knowledge-seed] failed to mark index job ${jobId} failed: ${markMessage}`);
      }
    }
    throw error;
  } finally {
    await closePrismaClient();
  }
}

void main().catch(() => {
  process.exitCode = 1;
});
