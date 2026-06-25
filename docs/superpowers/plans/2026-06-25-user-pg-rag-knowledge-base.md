# User PG RAG Knowledge Base Implementation Plan

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** Build a user-bound PostgreSQL/pgvector knowledge base that lets `xxwade` upload a synthetic ByteDance recruiting handbook and lets chat answers retrieve that user knowledge automatically.

**Architecture:** Add a new user-level RAG path beside the existing conversation-level Qdrant RAG. PostgreSQL stores knowledge documents, chunks, and pgvector embeddings; retrieval always filters by current `userId` before adding context to the chat prompt.

**Tech Stack:** Next.js 16 App Router, React 18, TypeScript, Prisma 6, PostgreSQL with pgvector, Bun, Jest, Playwright-ready UI.

---

## Important Implementation Notes

- Existing conversation RAG stays in place: `ConversationDocument` still uses Qdrant.
- New user knowledge RAG uses PostgreSQL only.
- `knowledge_document_chunks.embedding` should be an unbounded `vector` column because the embedding model is configurable. The query must filter `embedding_dimension = queryVector.length`.
- pgvector can store variable dimensions with `vector`, but ANN indexes require same-dimension rows. Reference: [pgvector README](https://github.com/pgvector/pgvector). This plan ships exact filtered search first and leaves ANN index creation out of the first migration so local setups with different embedding dimensions still work.
- Every API route must call `requireAuth()` and scope data by `auth.user.id`.
- All user-uploaded knowledge remains untrusted prompt context.

## File Structure

Create:

- `prisma/migrations/20260625000000_user_pg_rag_knowledge_base/migration.sql`  
  Enables pgvector and creates user-level knowledge tables.
- `src/lib/rag/knowledge-repo.ts`  
  Owns CRUD, ingest state transitions, raw pgvector insert/search, and vector literal validation.
- `src/lib/rag/knowledge-ingest.ts`  
  Splits Markdown, calls embeddings, writes chunks/vectors, and marks documents ready or failed.
- `src/lib/rag/knowledge-retrieval.ts`  
  Embeds user query, retrieves user-scoped chunks, formats context.
- `src/lib/knowledge/client.ts`  
  Browser API client for the knowledge page.
- `src/components/knowledge/knowledge-page.tsx`  
  Upload/list/delete UI for user knowledge documents.
- `src/app/knowledge/page.tsx`  
  Auth-gated page shell.
- `src/app/api/knowledge/documents/route.ts`  
  List and upload current-user knowledge documents.
- `src/app/api/knowledge/documents/[documentId]/route.ts`  
  Detail and delete current-user knowledge documents.
- `src/lib/rag/fixtures/bytedance-recruiting-handbook.synthetic.md`  
  Synthetic ByteDance recruiting handbook fixture.
- `src/scripts/seed-xxwade-knowledge.ts`  
  Ensures `xxwade`, upserts the fixture document, and indexes chunks.
- `tests/unit/lib/rag/knowledge-repo.test.ts`
- `tests/unit/lib/rag/knowledge-ingest.test.ts`
- `tests/unit/lib/rag/knowledge-retrieval.test.ts`
- `tests/unit/api/knowledge-documents-route.test.ts`
- `tests/unit/components/KnowledgePage.test.tsx`
- `tests/integration/chat/user-knowledge-rag.e2e.test.ts`

Modify:

- `prisma/schema.prisma`  
  Add `KnowledgeDocument`, `KnowledgeDocumentChunk`, `KnowledgeDocumentIndexJob`, and `User` relations.
- `.env.example`  
  Document pgvector requirement for user knowledge RAG.
- `package.json`  
  Add `seed:knowledge:xxwade`.
- `src/app/api/conversations/[id]/messages/stream/route.ts`  
  Add user knowledge retrieval to chat.
- `src/components/navbar.tsx`  
  Add `/knowledge` navigation link.
- `src/lib/chat/client.ts`  
  No required change for chat; keep existing conversation client untouched.
- `tests/unit/types/rag-schema-contract.test.ts`  
  Add user knowledge schema assertions.
- `tests/unit/api/chat-stream-route.test.ts`  
  Assert user knowledge retrieval is called and merged.
- `tests/unit/components/Navbar.test.tsx`  
  Assert the new navigation link appears.

---

### Task 1: Add Prisma Schema and PostgreSQL Migration

**Files:**

- Modify: `prisma/schema.prisma`
- Create: `prisma/migrations/20260625000000_user_pg_rag_knowledge_base/migration.sql`
- Modify: `tests/unit/types/rag-schema-contract.test.ts`
- Modify: `.env.example`

- [ ] **Step 1: Write the failing schema contract test**

Append these snippets to `requiredSnippets` in `tests/unit/types/rag-schema-contract.test.ts`:

```ts
'model KnowledgeDocument {',
'model KnowledgeDocumentChunk {',
'model KnowledgeDocumentIndexJob {',
'@@map("knowledge_documents")',
'@@map("knowledge_document_chunks")',
'@@map("knowledge_document_index_jobs")',
'Unsupported("vector")',
'@@unique([documentId, chunkIndex]',
'@relation(fields: [userId], references: [id]',
```

Add these expectations after the existing `expect(schema).toMatch(...)`:

```ts
expect(schema).toMatch(/\bknowledgeDocuments\s+KnowledgeDocument\[\]/);
expect(schema).toMatch(/\bknowledgeDocumentChunks\s+KnowledgeDocumentChunk\[\]/);
```

- [ ] **Step 2: Run test to verify it fails**

Run:

```bash
bunx jest tests/unit/types/rag-schema-contract.test.ts --runInBand --coverage=false
```

Expected: FAIL because `KnowledgeDocument` does not exist in `prisma/schema.prisma`.

- [ ] **Step 3: Modify Prisma schema**

In `model User`, add:

```prisma
  knowledgeDocuments      KnowledgeDocument[]
  knowledgeDocumentChunks KnowledgeDocumentChunk[]
```

After `ConversationDocumentIndexJob`, add:

```prisma
model KnowledgeDocument {
  id              String                      @id @default(uuid())
  userId          String                      @map("user_id")
  filename        String
  title           String?
  sourceLabel     String?                     @map("source_label")
  contentMarkdown String                      @map("content_markdown")
  status          String                      @default("processing")
  errorMessage    String?                     @map("error_message")
  version         Int                         @default(1)
  createdAt       DateTime                    @default(now()) @map("created_at")
  updatedAt       DateTime                    @updatedAt @map("updated_at")
  user            User                        @relation(fields: [userId], references: [id], onDelete: Cascade, onUpdate: Restrict)
  chunks          KnowledgeDocumentChunk[]
  jobs            KnowledgeDocumentIndexJob[]

  @@index([userId], map: "idx_knowledge_documents_user_id")
  @@index([status], map: "idx_knowledge_documents_status")
  @@index([userId, sourceLabel], map: "idx_knowledge_documents_user_source_label")
  @@map("knowledge_documents")
}

model KnowledgeDocumentChunk {
  id                 String            @id @default(uuid())
  documentId         String            @map("document_id")
  userId             String            @map("user_id")
  chunkIndex         Int               @map("chunk_index")
  content            String
  tokenEstimate      Int?              @map("token_estimate")
  embeddingModel     String            @map("embedding_model")
  embeddingDimension Int               @map("embedding_dimension")
  embedding          Unsupported("vector")?
  createdAt          DateTime          @default(now()) @map("created_at")
  document           KnowledgeDocument @relation(fields: [documentId], references: [id], onDelete: Cascade, onUpdate: Restrict)
  user               User              @relation(fields: [userId], references: [id], onDelete: Cascade, onUpdate: Restrict)

  @@unique([documentId, chunkIndex], map: "knowledge_document_chunks_document_id_chunk_index_key")
  @@index([documentId], map: "idx_knowledge_document_chunks_document_id")
  @@index([userId], map: "idx_knowledge_document_chunks_user_id")
  @@index([userId, embeddingModel, embeddingDimension], map: "idx_knowledge_document_chunks_user_embedding")
  @@map("knowledge_document_chunks")
}

model KnowledgeDocumentIndexJob {
  id         String            @id @default(uuid())
  documentId String            @map("document_id")
  status     String            @default("pending")
  attempts   Int               @default(0)
  lastError  String?           @map("last_error")
  startedAt  DateTime?         @map("started_at")
  finishedAt DateTime?         @map("finished_at")
  createdAt  DateTime          @default(now()) @map("created_at")
  updatedAt  DateTime          @updatedAt @map("updated_at")
  document   KnowledgeDocument @relation(fields: [documentId], references: [id], onDelete: Cascade, onUpdate: Restrict)

  @@index([documentId], map: "idx_knowledge_document_index_jobs_document_id")
  @@index([status], map: "idx_knowledge_document_index_jobs_status")
  @@map("knowledge_document_index_jobs")
}
```

- [ ] **Step 4: Add migration SQL**

Create `prisma/migrations/20260625000000_user_pg_rag_knowledge_base/migration.sql`:

```sql
CREATE EXTENSION IF NOT EXISTS vector;

CREATE TABLE "public"."knowledge_documents" (
    "id" TEXT NOT NULL,
    "user_id" TEXT NOT NULL,
    "filename" TEXT NOT NULL,
    "title" TEXT,
    "source_label" TEXT,
    "content_markdown" TEXT NOT NULL,
    "status" TEXT NOT NULL DEFAULT 'processing',
    "error_message" TEXT,
    "version" INTEGER NOT NULL DEFAULT 1,
    "created_at" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updated_at" TIMESTAMP(3) NOT NULL,

    CONSTRAINT "knowledge_documents_pkey" PRIMARY KEY ("id")
);

CREATE TABLE "public"."knowledge_document_chunks" (
    "id" TEXT NOT NULL,
    "document_id" TEXT NOT NULL,
    "user_id" TEXT NOT NULL,
    "chunk_index" INTEGER NOT NULL,
    "content" TEXT NOT NULL,
    "token_estimate" INTEGER,
    "embedding_model" TEXT NOT NULL,
    "embedding_dimension" INTEGER NOT NULL,
    "embedding" vector,
    "created_at" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,

    CONSTRAINT "knowledge_document_chunks_pkey" PRIMARY KEY ("id")
);

CREATE TABLE "public"."knowledge_document_index_jobs" (
    "id" TEXT NOT NULL,
    "document_id" TEXT NOT NULL,
    "status" TEXT NOT NULL DEFAULT 'pending',
    "attempts" INTEGER NOT NULL DEFAULT 0,
    "last_error" TEXT,
    "started_at" TIMESTAMP(3),
    "finished_at" TIMESTAMP(3),
    "created_at" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updated_at" TIMESTAMP(3) NOT NULL,

    CONSTRAINT "knowledge_document_index_jobs_pkey" PRIMARY KEY ("id")
);

CREATE INDEX "idx_knowledge_documents_user_id" ON "public"."knowledge_documents"("user_id");
CREATE INDEX "idx_knowledge_documents_status" ON "public"."knowledge_documents"("status");
CREATE INDEX "idx_knowledge_documents_user_source_label" ON "public"."knowledge_documents"("user_id", "source_label");

CREATE UNIQUE INDEX "knowledge_document_chunks_document_id_chunk_index_key"
ON "public"."knowledge_document_chunks"("document_id", "chunk_index");

CREATE INDEX "idx_knowledge_document_chunks_document_id" ON "public"."knowledge_document_chunks"("document_id");
CREATE INDEX "idx_knowledge_document_chunks_user_id" ON "public"."knowledge_document_chunks"("user_id");
CREATE INDEX "idx_knowledge_document_chunks_user_embedding"
ON "public"."knowledge_document_chunks"("user_id", "embedding_model", "embedding_dimension");

CREATE INDEX "idx_knowledge_document_index_jobs_document_id"
ON "public"."knowledge_document_index_jobs"("document_id");

CREATE INDEX "idx_knowledge_document_index_jobs_status"
ON "public"."knowledge_document_index_jobs"("status");

ALTER TABLE "public"."knowledge_documents"
ADD CONSTRAINT "knowledge_documents_user_id_fkey"
FOREIGN KEY ("user_id") REFERENCES "public"."users"("id")
ON DELETE CASCADE ON UPDATE RESTRICT;

ALTER TABLE "public"."knowledge_document_chunks"
ADD CONSTRAINT "knowledge_document_chunks_document_id_fkey"
FOREIGN KEY ("document_id") REFERENCES "public"."knowledge_documents"("id")
ON DELETE CASCADE ON UPDATE RESTRICT;

ALTER TABLE "public"."knowledge_document_chunks"
ADD CONSTRAINT "knowledge_document_chunks_user_id_fkey"
FOREIGN KEY ("user_id") REFERENCES "public"."users"("id")
ON DELETE CASCADE ON UPDATE RESTRICT;

ALTER TABLE "public"."knowledge_document_index_jobs"
ADD CONSTRAINT "knowledge_document_index_jobs_document_id_fkey"
FOREIGN KEY ("document_id") REFERENCES "public"."knowledge_documents"("id")
ON DELETE CASCADE ON UPDATE RESTRICT;
```

- [ ] **Step 5: Update `.env.example`**

Under `# Conversation Markdown RAG (Qdrant)`, add:

```dotenv
# User knowledge RAG stores vectors in PostgreSQL with the pgvector extension.
# Run `CREATE EXTENSION IF NOT EXISTS vector;` or apply Prisma migrations before indexing knowledge documents.
```

- [ ] **Step 6: Generate Prisma client and verify schema test passes**

Run:

```bash
bun run prisma:generate
bunx jest tests/unit/types/rag-schema-contract.test.ts --runInBand --coverage=false
```

Expected: Prisma generation succeeds. Jest PASS.

- [ ] **Step 7: Commit**

```bash
git add prisma/schema.prisma prisma/migrations/20260625000000_user_pg_rag_knowledge_base/migration.sql .env.example tests/unit/types/rag-schema-contract.test.ts
git commit -m "feat: add user knowledge pg schema"
```

---

### Task 2: Add Knowledge Repository with pgvector Raw SQL

**Files:**

- Create: `src/lib/rag/knowledge-repo.ts`
- Create: `tests/unit/lib/rag/knowledge-repo.test.ts`

- [ ] **Step 1: Write failing repository tests**

Create `tests/unit/lib/rag/knowledge-repo.test.ts`:

```ts
import {
  claimKnowledgeDocumentIngest,
  createKnowledgeDocument,
  deleteKnowledgeDocument,
  findKnowledgeDocumentBySourceLabel,
  replaceKnowledgeDocumentChunks,
  searchKnowledgeDocumentChunks,
  vectorToPgLiteral,
} from '@/lib/rag/knowledge-repo';

const prismaMock = {
  knowledgeDocument: {
    create: jest.fn(),
    findFirst: jest.fn(),
    findMany: jest.fn(),
    deleteMany: jest.fn(),
    updateMany: jest.fn(),
  },
  knowledgeDocumentChunk: {
    deleteMany: jest.fn(),
  },
  $executeRaw: jest.fn(),
  $queryRaw: jest.fn(),
  $transaction: jest.fn(),
};

jest.mock('@/lib/prisma', () => ({
  prisma: prismaMock,
}));

describe('knowledge repository', () => {
  beforeEach(() => {
    prismaMock.knowledgeDocument.create.mockReset();
    prismaMock.knowledgeDocument.findFirst.mockReset();
    prismaMock.knowledgeDocument.findMany.mockReset();
    prismaMock.knowledgeDocument.deleteMany.mockReset();
    prismaMock.knowledgeDocument.updateMany.mockReset();
    prismaMock.knowledgeDocumentChunk.deleteMany.mockReset();
    prismaMock.$executeRaw.mockReset();
    prismaMock.$queryRaw.mockReset();
    prismaMock.$transaction.mockReset();
  });

  it('formats finite vectors for pgvector', () => {
    expect(vectorToPgLiteral([0.1, -2, 3])).toBe('[0.1,-2,3]');
  });

  it('rejects empty or non-finite vectors', () => {
    expect(() => vectorToPgLiteral([])).toThrow('empty vector');
    expect(() => vectorToPgLiteral([1, Number.NaN])).toThrow('non-finite vector');
  });

  it('creates documents scoped to a user', async () => {
    prismaMock.knowledgeDocument.create.mockResolvedValueOnce({ id: 'doc-1', userId: 'u1' });
    await createKnowledgeDocument({
      userId: 'u1',
      filename: 'handbook.md',
      title: 'Handbook',
      sourceLabel: 'source-1',
      contentMarkdown: '# Handbook',
      status: 'processing',
    });

    expect(prismaMock.knowledgeDocument.create).toHaveBeenCalledWith({
      data: expect.objectContaining({
        userId: 'u1',
        filename: 'handbook.md',
        sourceLabel: 'source-1',
        contentMarkdown: '# Handbook',
        status: 'processing',
      }),
    });
  });

  it('finds source labels only within user scope', async () => {
    await findKnowledgeDocumentBySourceLabel('u1', 'synthetic');
    expect(prismaMock.knowledgeDocument.findFirst).toHaveBeenCalledWith({
      where: { userId: 'u1', sourceLabel: 'synthetic' },
      orderBy: { createdAt: 'desc' },
    });
  });

  it('claims processing documents only in user scope', async () => {
    prismaMock.knowledgeDocument.updateMany.mockResolvedValueOnce({ count: 1 });
    prismaMock.knowledgeDocument.findFirst.mockResolvedValueOnce({ id: 'doc-1' });

    await claimKnowledgeDocumentIngest('u1', 'doc-1', 'ingest:1:abc', new Date(0));

    expect(prismaMock.knowledgeDocument.updateMany).toHaveBeenCalledWith({
      where: {
        id: 'doc-1',
        userId: 'u1',
        status: 'processing',
        OR: [{ errorMessage: null }, { updatedAt: { lt: new Date(0) } }],
      },
      data: { errorMessage: 'ingest:1:abc' },
    });
  });

  it('replaces chunks with raw pgvector inserts inside a transaction', async () => {
    const tx = {
      knowledgeDocumentChunk: { deleteMany: jest.fn() },
      $executeRaw: jest.fn(),
    };
    prismaMock.$transaction.mockImplementationOnce(async (fn: (client: typeof tx) => unknown) =>
      fn(tx),
    );

    await replaceKnowledgeDocumentChunks({
      documentId: 'doc-1',
      userId: 'u1',
      embeddingModel: 'text-embedding-3-small',
      chunks: [
        {
          id: 'chunk-1',
          chunkIndex: 0,
          content: 'hello',
          tokenEstimate: null,
          embedding: [0.1, 0.2],
        },
      ],
    });

    expect(tx.knowledgeDocumentChunk.deleteMany).toHaveBeenCalledWith({
      where: { documentId: 'doc-1', userId: 'u1' },
    });
    expect(tx.$executeRaw).toHaveBeenCalledTimes(1);
  });

  it('searches chunks with user, model, dimension, and ready document filters', async () => {
    prismaMock.$queryRaw.mockResolvedValueOnce([]);
    await searchKnowledgeDocumentChunks({
      userId: 'u1',
      queryVector: [0.1, 0.2, 0.3],
      embeddingModel: 'text-embedding-3-small',
      topK: 4,
    });

    const sqlText = String(prismaMock.$queryRaw.mock.calls[0][0].strings.join(' '));
    expect(sqlText).toContain('c.user_id =');
    expect(sqlText).toContain("d.status = 'ready'");
    expect(sqlText).toContain('c.embedding_dimension =');
    expect(sqlText).toContain('ORDER BY c.embedding <=>');
  });

  it('deletes documents only for the current user', async () => {
    prismaMock.knowledgeDocument.deleteMany.mockResolvedValueOnce({ count: 1 });
    await expect(deleteKnowledgeDocument('u1', 'doc-1')).resolves.toBe(true);
    expect(prismaMock.knowledgeDocument.deleteMany).toHaveBeenCalledWith({
      where: { id: 'doc-1', userId: 'u1' },
    });
  });
});
```

- [ ] **Step 2: Run test to verify it fails**

```bash
bunx jest tests/unit/lib/rag/knowledge-repo.test.ts --runInBand --coverage=false
```

Expected: FAIL because `src/lib/rag/knowledge-repo.ts` is missing.

- [ ] **Step 3: Implement repository**

Create `src/lib/rag/knowledge-repo.ts` with these exported functions and types:

```ts
import { randomUUID } from 'node:crypto';
import { Prisma } from '@prisma/client';
import { prisma } from '@/lib/prisma';

export type KnowledgeDocumentStatus = 'processing' | 'ready' | 'failed';
export type KnowledgeDocumentIndexJobStatus = 'pending' | 'running' | 'success' | 'failed';

export type KnowledgeChunkInsert = {
  id?: string;
  chunkIndex: number;
  content: string;
  tokenEstimate?: number | null;
  embedding: number[];
};

export type KnowledgeChunkSearchResult = {
  id: string;
  documentId: string;
  userId: string;
  chunkIndex: number;
  content: string;
  filename: string;
  title: string | null;
  sourceLabel: string | null;
  score: number;
};

export function vectorToPgLiteral(vector: number[]): string {
  if (vector.length === 0) {
    throw new Error('Cannot format empty vector for pgvector');
  }
  for (const value of vector) {
    if (!Number.isFinite(value)) {
      throw new Error('Cannot format non-finite vector value for pgvector');
    }
  }
  return `[${vector.join(',')}]`;
}

export async function createKnowledgeDocument(params: {
  userId: string;
  filename: string;
  title?: string | null;
  sourceLabel?: string | null;
  contentMarkdown: string;
  status?: KnowledgeDocumentStatus;
  errorMessage?: string | null;
  version?: number;
}) {
  return prisma.knowledgeDocument.create({
    data: {
      userId: params.userId,
      filename: params.filename,
      title: params.title ?? null,
      sourceLabel: params.sourceLabel ?? null,
      contentMarkdown: params.contentMarkdown,
      status: params.status ?? 'processing',
      errorMessage: params.errorMessage ?? null,
      version: params.version ?? 1,
    },
  });
}

export async function listKnowledgeDocuments(userId: string) {
  return prisma.knowledgeDocument.findMany({
    where: { userId },
    orderBy: { createdAt: 'desc' },
  });
}

export async function getKnowledgeDocumentById(userId: string, id: string) {
  return prisma.knowledgeDocument.findFirst({
    where: { id, userId },
  });
}

export async function findKnowledgeDocumentBySourceLabel(userId: string, sourceLabel: string) {
  return prisma.knowledgeDocument.findFirst({
    where: { userId, sourceLabel },
    orderBy: { createdAt: 'desc' },
  });
}

export async function updateKnowledgeDocumentForReindex(params: {
  userId: string;
  id: string;
  filename: string;
  title?: string | null;
  contentMarkdown: string;
}) {
  const result = await prisma.knowledgeDocument.updateMany({
    where: { id: params.id, userId: params.userId },
    data: {
      filename: params.filename,
      title: params.title ?? null,
      contentMarkdown: params.contentMarkdown,
      status: 'processing',
      errorMessage: null,
      version: { increment: 1 },
    },
  });
  if (result.count === 0) {
    return null;
  }
  return getKnowledgeDocumentById(params.userId, params.id);
}

export async function deleteKnowledgeDocument(userId: string, id: string): Promise<boolean> {
  const result = await prisma.knowledgeDocument.deleteMany({
    where: { id, userId },
  });
  return result.count > 0;
}

export async function claimKnowledgeDocumentIngest(
  userId: string,
  id: string,
  claimToken: string,
  staleBefore?: Date,
) {
  const result = await prisma.knowledgeDocument.updateMany({
    where: {
      id,
      userId,
      status: 'processing',
      OR: [{ errorMessage: null }, ...(staleBefore ? [{ updatedAt: { lt: staleBefore } }] : [])],
    },
    data: { errorMessage: claimToken },
  });
  if (result.count === 0) {
    return null;
  }
  return getKnowledgeDocumentById(userId, id);
}

export async function completeKnowledgeDocumentIngest(
  userId: string,
  id: string,
  claimToken: string,
) {
  const result = await prisma.knowledgeDocument.updateMany({
    where: { id, userId, status: 'processing', errorMessage: claimToken },
    data: { status: 'ready', errorMessage: null },
  });
  return result.count > 0;
}

export async function failKnowledgeDocumentIngest(
  userId: string,
  id: string,
  claimToken: string,
  failureMessage: string,
) {
  const result = await prisma.knowledgeDocument.updateMany({
    where: { id, userId, status: 'processing', errorMessage: claimToken },
    data: { status: 'failed', errorMessage: failureMessage },
  });
  return result.count > 0;
}

export async function createKnowledgeDocumentIndexJob(documentId: string) {
  return prisma.knowledgeDocumentIndexJob.create({
    data: {
      documentId,
      status: 'pending',
      attempts: 0,
      lastError: null,
      startedAt: null,
      finishedAt: null,
    },
  });
}

export async function markKnowledgeDocumentIndexJobRunning(jobId: string) {
  const now = new Date();
  return prisma.knowledgeDocumentIndexJob.update({
    where: { id: jobId },
    data: {
      status: 'running',
      attempts: { increment: 1 },
      startedAt: now,
      finishedAt: null,
      lastError: null,
    },
  });
}

export async function markKnowledgeDocumentIndexJobSuccess(jobId: string) {
  return prisma.knowledgeDocumentIndexJob.update({
    where: { id: jobId },
    data: { status: 'success', finishedAt: new Date(), lastError: null },
  });
}

export async function markKnowledgeDocumentIndexJobFailed(jobId: string, lastError: string) {
  return prisma.knowledgeDocumentIndexJob.update({
    where: { id: jobId },
    data: { status: 'failed', finishedAt: new Date(), lastError },
  });
}

export async function hasReadyKnowledgeDocuments(userId: string): Promise<boolean> {
  const doc = await prisma.knowledgeDocument.findFirst({
    where: { userId, status: 'ready' },
    select: { id: true },
  });
  return Boolean(doc);
}

export async function replaceKnowledgeDocumentChunks(params: {
  documentId: string;
  userId: string;
  embeddingModel: string;
  chunks: KnowledgeChunkInsert[];
}): Promise<number> {
  await prisma.$transaction(async (tx) => {
    await tx.knowledgeDocumentChunk.deleteMany({
      where: { documentId: params.documentId, userId: params.userId },
    });

    for (const chunk of params.chunks) {
      const id = chunk.id ?? randomUUID();
      const vectorLiteral = vectorToPgLiteral(chunk.embedding);
      await tx.$executeRaw`
        INSERT INTO "public"."knowledge_document_chunks"
          ("id", "document_id", "user_id", "chunk_index", "content", "token_estimate",
           "embedding_model", "embedding_dimension", "embedding", "created_at")
        VALUES
          (${id}, ${params.documentId}, ${params.userId}, ${chunk.chunkIndex}, ${chunk.content},
           ${chunk.tokenEstimate ?? null}, ${params.embeddingModel}, ${chunk.embedding.length},
           ${vectorLiteral}::vector, CURRENT_TIMESTAMP)
      `;
    }
  });

  return params.chunks.length;
}

export async function searchKnowledgeDocumentChunks(params: {
  userId: string;
  queryVector: number[];
  embeddingModel: string;
  topK: number;
  documentId?: string | null;
}): Promise<KnowledgeChunkSearchResult[]> {
  if (params.topK <= 0 || params.queryVector.length === 0) {
    return [];
  }

  const vectorLiteral = vectorToPgLiteral(params.queryVector);
  const documentFilter = params.documentId
    ? Prisma.sql`AND c.document_id = ${params.documentId}`
    : Prisma.empty;

  const rows = await prisma.$queryRaw<
    Array<{
      id: string;
      documentId: string;
      userId: string;
      chunkIndex: number;
      content: string;
      filename: string;
      title: string | null;
      sourceLabel: string | null;
      score: number | string;
    }>
  >`
    SELECT
      c.id,
      c.document_id AS "documentId",
      c.user_id AS "userId",
      c.chunk_index AS "chunkIndex",
      c.content,
      d.filename,
      d.title,
      d.source_label AS "sourceLabel",
      1 - (c.embedding <=> ${vectorLiteral}::vector) AS score
    FROM "public"."knowledge_document_chunks" c
    INNER JOIN "public"."knowledge_documents" d ON d.id = c.document_id
    WHERE c.user_id = ${params.userId}
      AND d.user_id = ${params.userId}
      AND d.status = 'ready'
      AND c.embedding IS NOT NULL
      AND c.embedding_model = ${params.embeddingModel}
      AND c.embedding_dimension = ${params.queryVector.length}
      ${documentFilter}
    ORDER BY c.embedding <=> ${vectorLiteral}::vector
    LIMIT ${params.topK}
  `;

  return rows.map((row) => ({
    ...row,
    score: typeof row.score === 'number' ? row.score : Number(row.score),
  }));
}
```

- [ ] **Step 4: Run test to verify it passes**

```bash
bunx jest tests/unit/lib/rag/knowledge-repo.test.ts --runInBand --coverage=false
```

Expected: PASS.

- [ ] **Step 5: Commit**

```bash
git add src/lib/rag/knowledge-repo.ts tests/unit/lib/rag/knowledge-repo.test.ts
git commit -m "feat: add user knowledge repository"
```

---

### Task 3: Add Knowledge Ingest Service

**Files:**

- Create: `src/lib/rag/knowledge-ingest.ts`
- Create: `tests/unit/lib/rag/knowledge-ingest.test.ts`

- [ ] **Step 1: Write failing ingest tests**

Create `tests/unit/lib/rag/knowledge-ingest.test.ts`:

```ts
const claimMock = jest.fn();
const completeMock = jest.fn();
const failMock = jest.fn();
const getDocMock = jest.fn();
const replaceChunksMock = jest.fn();
const splitMock = jest.fn();
const embedDocumentsMock = jest.fn();

jest.mock('@/lib/env', () => ({
  env: {
    RAG_INGEST_LEASE_MS: 1800000,
    OPENAI_EMBEDDING_MODEL: 'text-embedding-3-small',
  },
}));

jest.mock('@/lib/chat/repositories/document-repo', () => ({}));

jest.mock('@/lib/rag/knowledge-repo', () => ({
  claimKnowledgeDocumentIngest: (...args: unknown[]) => claimMock(...args),
  completeKnowledgeDocumentIngest: (...args: unknown[]) => completeMock(...args),
  failKnowledgeDocumentIngest: (...args: unknown[]) => failMock(...args),
  getKnowledgeDocumentById: (...args: unknown[]) => getDocMock(...args),
  replaceKnowledgeDocumentChunks: (...args: unknown[]) => replaceChunksMock(...args),
}));

jest.mock('@/lib/rag/markdown', () => ({
  splitMarkdownToChunks: (...args: unknown[]) => splitMock(...args),
}));

jest.mock('@/lib/rag/embed', () => ({
  embedDocuments: (...args: unknown[]) => embedDocumentsMock(...args),
}));

describe('ingestKnowledgeDocument', () => {
  beforeEach(() => {
    claimMock.mockReset();
    completeMock.mockReset();
    failMock.mockReset();
    getDocMock.mockReset();
    replaceChunksMock.mockReset();
    splitMock.mockReset();
    embedDocumentsMock.mockReset();
    completeMock.mockResolvedValue(true);
    failMock.mockResolvedValue(true);
    replaceChunksMock.mockResolvedValue(1);
  });

  it('splits, embeds, writes chunks, and marks ready', async () => {
    claimMock.mockResolvedValueOnce({ id: 'doc-1' });
    getDocMock.mockResolvedValueOnce({
      id: 'doc-1',
      userId: 'u1',
      contentMarkdown: '# A',
      version: 1,
    });
    splitMock.mockResolvedValueOnce([{ index: 0, content: 'Alpha chunk' }]);
    embedDocumentsMock.mockResolvedValueOnce([[0.1, 0.2, 0.3]]);

    const { ingestKnowledgeDocument } = await import('@/lib/rag/knowledge-ingest');
    await ingestKnowledgeDocument({ userId: 'u1', documentId: 'doc-1' });

    expect(embedDocumentsMock).toHaveBeenCalledWith(['Alpha chunk']);
    expect(replaceChunksMock).toHaveBeenCalledWith(
      expect.objectContaining({
        documentId: 'doc-1',
        userId: 'u1',
        embeddingModel: 'text-embedding-3-small',
        chunks: [
          expect.objectContaining({
            chunkIndex: 0,
            content: 'Alpha chunk',
            embedding: [0.1, 0.2, 0.3],
          }),
        ],
      }),
    );
    expect(completeMock).toHaveBeenCalledWith('u1', 'doc-1', expect.stringMatching(/^ingest:/));
  });

  it('marks failed when embedding throws', async () => {
    claimMock.mockResolvedValueOnce({ id: 'doc-1' });
    getDocMock.mockResolvedValueOnce({
      id: 'doc-1',
      userId: 'u1',
      contentMarkdown: '# A',
    });
    splitMock.mockResolvedValueOnce([{ index: 0, content: 'Alpha chunk' }]);
    embedDocumentsMock.mockRejectedValueOnce(new Error('embedding down'));

    const { ingestKnowledgeDocument } = await import('@/lib/rag/knowledge-ingest');
    await expect(ingestKnowledgeDocument({ userId: 'u1', documentId: 'doc-1' })).rejects.toThrow(
      'embedding down',
    );
    expect(failMock).toHaveBeenCalledWith(
      'u1',
      'doc-1',
      expect.stringMatching(/^ingest:/),
      'embedding down',
    );
  });

  it('throws when embedding count does not match chunks', async () => {
    claimMock.mockResolvedValueOnce({ id: 'doc-1' });
    getDocMock.mockResolvedValueOnce({
      id: 'doc-1',
      userId: 'u1',
      contentMarkdown: '# A',
    });
    splitMock.mockResolvedValueOnce([
      { index: 0, content: 'A' },
      { index: 1, content: 'B' },
    ]);
    embedDocumentsMock.mockResolvedValueOnce([[0.1, 0.2]]);

    const { ingestKnowledgeDocument } = await import('@/lib/rag/knowledge-ingest');
    await expect(ingestKnowledgeDocument({ userId: 'u1', documentId: 'doc-1' })).rejects.toThrow(
      'embedding count does not match knowledge chunks',
    );
  });

  it('returns when a document is already ready', async () => {
    claimMock.mockResolvedValueOnce(null);
    getDocMock.mockResolvedValueOnce({ id: 'doc-1', status: 'ready' });

    const { ingestKnowledgeDocument } = await import('@/lib/rag/knowledge-ingest');
    await expect(ingestKnowledgeDocument({ userId: 'u1', documentId: 'doc-1' })).resolves.toBeUndefined();
    expect(embedDocumentsMock).not.toHaveBeenCalled();
  });
});
```

- [ ] **Step 2: Run test to verify it fails**

```bash
bunx jest tests/unit/lib/rag/knowledge-ingest.test.ts --runInBand --coverage=false
```

Expected: FAIL because `knowledge-ingest.ts` is missing.

- [ ] **Step 3: Implement ingest service**

Create `src/lib/rag/knowledge-ingest.ts`:

```ts
import { randomUUID } from 'node:crypto';
import { env } from '@/lib/env';
import { embedDocuments } from '@/lib/rag/embed';
import { splitMarkdownToChunks } from '@/lib/rag/markdown';
import {
  claimKnowledgeDocumentIngest,
  completeKnowledgeDocumentIngest,
  failKnowledgeDocumentIngest,
  getKnowledgeDocumentById,
  replaceKnowledgeDocumentChunks,
} from '@/lib/rag/knowledge-repo';

function createClaimToken(): string {
  return `ingest:${Date.now()}:${Math.random().toString(16).slice(2)}`;
}

export async function ingestKnowledgeDocument(params: {
  userId: string;
  documentId: string;
}): Promise<void> {
  const claimToken = createClaimToken();
  const staleBefore = new Date(Date.now() - env.RAG_INGEST_LEASE_MS);
  const claimed = await claimKnowledgeDocumentIngest(
    params.userId,
    params.documentId,
    claimToken,
    staleBefore,
  );

  if (!claimed) {
    const snapshot = await getKnowledgeDocumentById(params.userId, params.documentId);
    if (!snapshot) {
      throw new Error('knowledge document not found');
    }
    if (snapshot.status === 'ready') {
      return;
    }
    if (snapshot.status === 'failed') {
      throw new Error(snapshot.errorMessage ?? 'knowledge document ingest failed');
    }
    return;
  }

  try {
    const document = await getKnowledgeDocumentById(params.userId, params.documentId);
    if (!document) {
      throw new Error('knowledge document not found');
    }

    const markdownChunks = await splitMarkdownToChunks(document.contentMarkdown);
    if (markdownChunks.length === 0) {
      throw new Error('knowledge document produced no indexable markdown chunks');
    }

    const embeddings = await embedDocuments(markdownChunks.map((chunk) => chunk.content));
    if (embeddings.length !== markdownChunks.length) {
      throw new Error('embedding count does not match knowledge chunks');
    }
    if (!embeddings[0] || embeddings[0].length === 0) {
      throw new Error('embedding vectors are empty');
    }

    await replaceKnowledgeDocumentChunks({
      documentId: document.id,
      userId: params.userId,
      embeddingModel: env.OPENAI_EMBEDDING_MODEL,
      chunks: markdownChunks.map((chunk, index) => ({
        id: randomUUID(),
        chunkIndex: chunk.index,
        content: chunk.content,
        tokenEstimate: null,
        embedding: embeddings[index] ?? [],
      })),
    });

    const completed = await completeKnowledgeDocumentIngest(
      params.userId,
      params.documentId,
      claimToken,
    );
    if (!completed) {
      throw new Error('knowledge ingest lost ownership before marking document ready');
    }
  } catch (error) {
    const message = error instanceof Error ? error.message : 'knowledge document ingest failed';
    const failed = await failKnowledgeDocumentIngest(
      params.userId,
      params.documentId,
      claimToken,
      message,
    );
    if (!failed) {
      throw new Error(`${message}; and failed to atomically mark knowledge document failed`);
    }
    throw error;
  }
}
```

- [ ] **Step 4: Run test to verify it passes**

```bash
bunx jest tests/unit/lib/rag/knowledge-ingest.test.ts --runInBand --coverage=false
```

Expected: PASS.

- [ ] **Step 5: Commit**

```bash
git add src/lib/rag/knowledge-ingest.ts tests/unit/lib/rag/knowledge-ingest.test.ts
git commit -m "feat: add user knowledge ingest"
```

---

### Task 4: Add User Knowledge Retrieval and Chat Integration

**Files:**

- Create: `src/lib/rag/knowledge-retrieval.ts`
- Create: `tests/unit/lib/rag/knowledge-retrieval.test.ts`
- Modify: `src/app/api/conversations/[id]/messages/stream/route.ts`
- Modify: `tests/unit/api/chat-stream-route.test.ts`

- [ ] **Step 1: Write failing retrieval tests**

Create `tests/unit/lib/rag/knowledge-retrieval.test.ts`:

```ts
const embedQueryMock = jest.fn();
const hasReadyMock = jest.fn();
const searchMock = jest.fn();

jest.mock('@/lib/env', () => ({
  env: {
    OPENAI_EMBEDDING_MODEL: 'text-embedding-3-small',
    RAG_TOP_K: 6,
    RAG_MIN_SCORE: 0.5,
    RAG_CONTEXT_MAX_CHARS: 120,
  },
}));

jest.mock('@/lib/rag/embed', () => ({
  embedQuery: (...args: unknown[]) => embedQueryMock(...args),
}));

jest.mock('@/lib/rag/knowledge-repo', () => ({
  hasReadyKnowledgeDocuments: (...args: unknown[]) => hasReadyMock(...args),
  searchKnowledgeDocumentChunks: (...args: unknown[]) => searchMock(...args),
}));

describe('retrieveUserKnowledgeContext', () => {
  beforeEach(() => {
    embedQueryMock.mockReset();
    hasReadyMock.mockReset();
    searchMock.mockReset();
    hasReadyMock.mockResolvedValue(true);
  });

  it('returns empty context without embedding when query is blank', async () => {
    const { retrieveUserKnowledgeContext } = await import('@/lib/rag/knowledge-retrieval');
    await expect(retrieveUserKnowledgeContext({ userId: 'u1', query: '  ' })).resolves.toEqual({
      contextText: '',
      matches: [],
    });
    expect(embedQueryMock).not.toHaveBeenCalled();
  });

  it('returns empty context without embedding when user has no ready knowledge', async () => {
    hasReadyMock.mockResolvedValueOnce(false);
    const { retrieveUserKnowledgeContext } = await import('@/lib/rag/knowledge-retrieval');
    const result = await retrieveUserKnowledgeContext({ userId: 'u1', query: '绩效要求' });
    expect(result.contextText).toBe('');
    expect(result.matches).toEqual([]);
    expect(embedQueryMock).not.toHaveBeenCalled();
  });

  it('embeds query and formats user-scoped knowledge sources', async () => {
    embedQueryMock.mockResolvedValueOnce([0.1, 0.2, 0.3]);
    searchMock.mockResolvedValueOnce([
      {
        id: 'chunk-1',
        documentId: 'doc-1',
        userId: 'u1',
        chunkIndex: 2,
        content: '今年绩效要求强调高质量交付。',
        filename: 'handbook.md',
        title: '招聘手册',
        sourceLabel: 'synthetic',
        score: 0.91,
      },
    ]);

    const { retrieveUserKnowledgeContext } = await import('@/lib/rag/knowledge-retrieval');
    const result = await retrieveUserKnowledgeContext({ userId: 'u1', query: '绩效要求', topK: 3 });

    expect(searchMock).toHaveBeenCalledWith({
      userId: 'u1',
      queryVector: [0.1, 0.2, 0.3],
      embeddingModel: 'text-embedding-3-small',
      topK: 3,
      documentId: null,
    });
    expect(result.contextText).toContain('[knowledge source filename="handbook.md" chunkIndex=2]');
    expect(result.contextText).toContain('今年绩效要求强调高质量交付。');
    expect(result.matches).toEqual([
      expect.objectContaining({
        score: 0.91,
        documentId: 'doc-1',
        chunkId: 'chunk-1',
        filename: 'handbook.md',
      }),
    ]);
  });

  it('drops hits below min score', async () => {
    embedQueryMock.mockResolvedValueOnce([0.1]);
    searchMock.mockResolvedValueOnce([
      {
        id: 'chunk-low',
        documentId: 'doc-1',
        userId: 'u1',
        chunkIndex: 0,
        content: 'low',
        filename: 'low.md',
        title: null,
        sourceLabel: null,
        score: 0.1,
      },
    ]);

    const { retrieveUserKnowledgeContext } = await import('@/lib/rag/knowledge-retrieval');
    const result = await retrieveUserKnowledgeContext({ userId: 'u1', query: 'anything' });
    expect(result.contextText).toBe('');
    expect(result.matches).toEqual([]);
  });
});
```

- [ ] **Step 2: Run retrieval test to verify it fails**

```bash
bunx jest tests/unit/lib/rag/knowledge-retrieval.test.ts --runInBand --coverage=false
```

Expected: FAIL because `knowledge-retrieval.ts` is missing.

- [ ] **Step 3: Implement retrieval**

Create `src/lib/rag/knowledge-retrieval.ts`:

```ts
import { env } from '@/lib/env';
import { embedQuery } from '@/lib/rag/embed';
import {
  hasReadyKnowledgeDocuments,
  searchKnowledgeDocumentChunks,
} from '@/lib/rag/knowledge-repo';

export type RetrievedKnowledgeMatch = {
  score: number;
  documentId: string;
  chunkId: string;
  chunkIndex: number;
  filename: string;
  title: string | null;
  sourceLabel: string | null;
};

export async function retrieveUserKnowledgeContext(params: {
  userId: string;
  query: string;
  topK?: number;
  documentId?: string | null;
}): Promise<{ contextText: string; matches: RetrievedKnowledgeMatch[] }> {
  const topK = params.topK ?? env.RAG_TOP_K;
  const query = params.query.trim();
  if (!query || topK <= 0) {
    return { contextText: '', matches: [] };
  }

  const hasReady = await hasReadyKnowledgeDocuments(params.userId);
  if (!hasReady) {
    return { contextText: '', matches: [] };
  }

  const queryVector = await embedQuery(query);
  const rows = await searchKnowledgeDocumentChunks({
    userId: params.userId,
    queryVector,
    embeddingModel: env.OPENAI_EMBEDDING_MODEL,
    topK,
    documentId:
      typeof params.documentId === 'string' && params.documentId.trim()
        ? params.documentId.trim()
        : null,
  });

  const selectedTexts: string[] = [];
  const matches: RetrievedKnowledgeMatch[] = [];
  let contextChars = 0;

  for (const row of rows) {
    if (!Number.isFinite(row.score) || row.score < env.RAG_MIN_SCORE) {
      continue;
    }
    const content = row.content.trim();
    if (!content) {
      continue;
    }

    const formattedChunk = [
      `[knowledge source filename="${row.filename}" chunkIndex=${row.chunkIndex}]`,
      content,
    ].join('\n');
    const nextChars = contextChars + formattedChunk.length;
    if (nextChars > env.RAG_CONTEXT_MAX_CHARS) {
      continue;
    }

    contextChars = nextChars;
    selectedTexts.push(formattedChunk);
    matches.push({
      score: row.score,
      documentId: row.documentId,
      chunkId: row.id,
      chunkIndex: row.chunkIndex,
      filename: row.filename,
      title: row.title,
      sourceLabel: row.sourceLabel,
    });
  }

  return { contextText: selectedTexts.join('\n\n'), matches };
}
```

- [ ] **Step 4: Run retrieval test to verify it passes**

```bash
bunx jest tests/unit/lib/rag/knowledge-retrieval.test.ts --runInBand --coverage=false
```

Expected: PASS.

- [ ] **Step 5: Update chat stream route test for automatic user knowledge**

In `tests/unit/api/chat-stream-route.test.ts`, add a mock:

```ts
const retrieveUserKnowledgeContextMock = jest.fn();
```

Add this mock module:

```ts
jest.mock('@/lib/rag/knowledge-retrieval', () => ({
  retrieveUserKnowledgeContext: (...args: unknown[]) => retrieveUserKnowledgeContextMock(...args),
}));
```

In `beforeEach`, reset and default it:

```ts
retrieveUserKnowledgeContextMock.mockReset();
retrieveUserKnowledgeContextMock.mockResolvedValue({ contextText: '', matches: [] });
```

Change the existing `writes user first` expectation:

```ts
expect(retrieveConversationContextMock).not.toHaveBeenCalled();
expect(retrieveUserKnowledgeContextMock).toHaveBeenCalledWith({
  userId: 'u1',
  query: 'hello?',
  topK: expect.any(Number),
});
expect(streamChatReplyMock).toHaveBeenCalledWith('c1', 'hello?', { retrievedContext: '' });
```

Add a new test:

```ts
it('adds user knowledge context when no conversation document is selected', async () => {
  retrieveUserKnowledgeContextMock.mockResolvedValueOnce({
    contextText: 'ByteDance performance bar: high-quality delivery.',
    matches: [],
  });
  async function* gen() {
    yield 'ok';
  }
  streamChatReplyMock.mockResolvedValueOnce({
    chunks: gen(),
    collect: async () => 'ok',
  });

  const req = { json: async () => ({ content: '今年绩效要求是什么？' }) } as Request;
  const res = await POST(req, { params: Promise.resolve({ id: 'c1' }) });
  expect(res.status).toBe(200);

  expect(streamChatReplyMock).toHaveBeenCalledWith(
    'c1',
    '今年绩效要求是什么？',
    expect.objectContaining({
      retrievedContext: expect.stringContaining('ByteDance performance bar'),
    }),
  );
});
```

Add a new failure test:

```ts
it('returns 502 when user knowledge retrieval fails', async () => {
  retrieveUserKnowledgeContextMock.mockRejectedValueOnce(new Error('pgvector unavailable'));
  const req = { json: async () => ({ content: 'hello' }) } as Request;
  const res = await POST(req, { params: Promise.resolve({ id: 'c1' }) });
  expect(res.status).toBe(502);
  const body = await res.json();
  expect(body.code).toBe('RAG_RETRIEVAL_FAILED');
  expect(body.error).toContain('pgvector unavailable');
  expect(streamChatReplyMock).not.toHaveBeenCalled();
});
```

- [ ] **Step 6: Run chat stream route test to verify it fails**

```bash
bunx jest tests/unit/api/chat-stream-route.test.ts --runInBand --coverage=false
```

Expected: FAIL because the route does not call `retrieveUserKnowledgeContext`.

- [ ] **Step 7: Modify chat stream route**

In `src/app/api/conversations/[id]/messages/stream/route.ts`, import:

```ts
import { retrieveUserKnowledgeContext } from '@/lib/rag/knowledge-retrieval';
```

Before `streamChatReply`, replace the retrieval block with:

```ts
    const retrievedContextParts: string[] = [];

    try {
      const userKnowledge = await retrieveUserKnowledgeContext({
        userId: auth.user.id,
        query: input,
        topK: env.RAG_TOP_K,
      });
      if (userKnowledge.contextText.trim()) {
        retrievedContextParts.push(userKnowledge.contextText.trim());
      }

      if (ragDocumentId) {
        const retrieval = await retrieveConversationContext({
          conversationId: id,
          query: input,
          topK: env.RAG_TOP_K,
          documentId: ragDocumentId,
        });
        if (retrieval.contextText.trim()) {
          retrievedContextParts.push(retrieval.contextText.trim());
        }
      }
    } catch (error) {
      const message = error instanceof Error ? error.message : 'RAG retrieval failed';
      return NextResponse.json({ error: message, code: 'RAG_RETRIEVAL_FAILED' }, { status: 502 });
    }

    const retrievedContext = retrievedContextParts.join('\n\n');
```

Keep the existing `streamChatReply(id, input, { retrievedContext })`.

- [ ] **Step 8: Run targeted tests**

```bash
bunx jest tests/unit/lib/rag/knowledge-retrieval.test.ts tests/unit/api/chat-stream-route.test.ts --runInBand --coverage=false
```

Expected: PASS.

- [ ] **Step 9: Commit**

```bash
git add src/lib/rag/knowledge-retrieval.ts tests/unit/lib/rag/knowledge-retrieval.test.ts src/app/api/conversations/[id]/messages/stream/route.ts tests/unit/api/chat-stream-route.test.ts
git commit -m "feat: retrieve user knowledge in chat"
```

---

### Task 5: Add User Knowledge API Routes

**Files:**

- Create: `src/app/api/knowledge/documents/route.ts`
- Create: `src/app/api/knowledge/documents/[documentId]/route.ts`
- Create: `tests/unit/api/knowledge-documents-route.test.ts`

- [ ] **Step 1: Write failing API route tests**

Create `tests/unit/api/knowledge-documents-route.test.ts` with tests covering auth, upload validation, list, detail, delete, and ingest failure:

```ts
import {
  GET as getKnowledgeDocuments,
  POST as postKnowledgeDocument,
} from '@/app/api/knowledge/documents/route';
import {
  DELETE as deleteKnowledgeDocumentRoute,
  GET as getKnowledgeDocumentDetail,
} from '@/app/api/knowledge/documents/[documentId]/route';

const requireAuthMock = jest.fn();
const createDocMock = jest.fn();
const createJobMock = jest.fn();
const getDocMock = jest.fn();
const listDocsMock = jest.fn();
const deleteDocMock = jest.fn();
const ingestMock = jest.fn();
const markRunningMock = jest.fn();
const markSuccessMock = jest.fn();
const markFailedMock = jest.fn();

jest.mock('next/server', () => ({
  NextResponse: {
    json: (body: unknown, init?: { status?: number }) => ({
      status: init?.status ?? 200,
      json: async () => body,
    }),
  },
}));

jest.mock('@/lib/auth/session', () => ({
  requireAuth: (...args: unknown[]) => requireAuthMock(...args),
  UnauthorizedError: class UnauthorizedError extends Error {
    status = 401;
  },
}));

jest.mock('@/lib/rag/knowledge-repo', () => ({
  createKnowledgeDocument: (...args: unknown[]) => createDocMock(...args),
  createKnowledgeDocumentIndexJob: (...args: unknown[]) => createJobMock(...args),
  getKnowledgeDocumentById: (...args: unknown[]) => getDocMock(...args),
  listKnowledgeDocuments: (...args: unknown[]) => listDocsMock(...args),
  deleteKnowledgeDocument: (...args: unknown[]) => deleteDocMock(...args),
  markKnowledgeDocumentIndexJobRunning: (...args: unknown[]) => markRunningMock(...args),
  markKnowledgeDocumentIndexJobSuccess: (...args: unknown[]) => markSuccessMock(...args),
  markKnowledgeDocumentIndexJobFailed: (...args: unknown[]) => markFailedMock(...args),
}));

jest.mock('@/lib/rag/knowledge-ingest', () => ({
  ingestKnowledgeDocument: (...args: unknown[]) => ingestMock(...args),
}));

describe('knowledge document routes', () => {
  beforeEach(() => {
    requireAuthMock.mockReset();
    createDocMock.mockReset();
    createJobMock.mockReset();
    getDocMock.mockReset();
    listDocsMock.mockReset();
    deleteDocMock.mockReset();
    ingestMock.mockReset();
    markRunningMock.mockReset();
    markSuccessMock.mockReset();
    markFailedMock.mockReset();
    requireAuthMock.mockResolvedValue({ user: { id: 'u1' } });
    createJobMock.mockResolvedValue({ id: 'job-1' });
    markRunningMock.mockResolvedValue({ id: 'job-1', status: 'running' });
    markSuccessMock.mockResolvedValue({ id: 'job-1', status: 'success' });
    markFailedMock.mockResolvedValue({ id: 'job-1', status: 'failed' });
    ingestMock.mockResolvedValue(undefined);
  });

  it('lists current user documents', async () => {
    listDocsMock.mockResolvedValueOnce([{ id: 'doc-1' }]);
    const res = await getKnowledgeDocuments({} as Request);
    const body = await res.json();
    expect(res.status).toBe(200);
    expect(body.total).toBe(1);
    expect(listDocsMock).toHaveBeenCalledWith('u1');
  });

  it('rejects non-markdown uploads', async () => {
    const formData = new FormData();
    formData.set('file', new File(['x'], 'notes.txt'));
    const res = await postKnowledgeDocument({ formData: async () => formData } as Request);
    const body = await res.json();
    expect(res.status).toBe(400);
    expect(body.error).toContain('.md');
  });

  it('uploads, indexes, and returns latest document', async () => {
    createDocMock.mockResolvedValueOnce({ id: 'doc-1', status: 'processing' });
    getDocMock.mockResolvedValueOnce({ id: 'doc-1', status: 'ready', userId: 'u1' });
    const formData = {
      get: () =>
        ({
          name: 'handbook.md',
          size: 11,
          text: async () => '# Handbook',
        }) as FormDataEntryValue,
    };

    const res = await postKnowledgeDocument({ formData: async () => formData } as Request);
    const body = await res.json();

    expect(res.status).toBe(201);
    expect(body.document.status).toBe('ready');
    expect(createDocMock).toHaveBeenCalledWith(
      expect.objectContaining({
        userId: 'u1',
        filename: 'handbook.md',
        contentMarkdown: '# Handbook',
        status: 'processing',
      }),
    );
    expect(ingestMock).toHaveBeenCalledWith({ userId: 'u1', documentId: 'doc-1' });
    expect(markSuccessMock).toHaveBeenCalledWith('job-1');
  });

  it('marks job failed when ingest fails and returns failed document', async () => {
    createDocMock.mockResolvedValueOnce({ id: 'doc-1', status: 'processing' });
    ingestMock.mockRejectedValueOnce(new Error('embedding down'));
    getDocMock.mockResolvedValueOnce({
      id: 'doc-1',
      status: 'failed',
      errorMessage: 'embedding down',
    });
    const formData = {
      get: () =>
        ({
          name: 'handbook.md',
          size: 11,
          text: async () => '# Handbook',
        }) as FormDataEntryValue,
    };

    const res = await postKnowledgeDocument({ formData: async () => formData } as Request);
    const body = await res.json();

    expect(res.status).toBe(201);
    expect(body.document.status).toBe('failed');
    expect(markFailedMock).toHaveBeenCalledWith('job-1', expect.stringContaining('embedding down'));
  });

  it('gets detail scoped to user', async () => {
    getDocMock.mockResolvedValueOnce({ id: 'doc-1', userId: 'u1' });
    const res = await getKnowledgeDocumentDetail({} as Request, {
      params: Promise.resolve({ documentId: 'doc-1' }),
    });
    const body = await res.json();
    expect(res.status).toBe(200);
    expect(body.document.id).toBe('doc-1');
    expect(getDocMock).toHaveBeenCalledWith('u1', 'doc-1');
  });

  it('deletes scoped document', async () => {
    deleteDocMock.mockResolvedValueOnce(true);
    const res = await deleteKnowledgeDocumentRoute({} as Request, {
      params: Promise.resolve({ documentId: 'doc-1' }),
    });
    const body = await res.json();
    expect(res.status).toBe(200);
    expect(body.deleted).toBe(true);
    expect(deleteDocMock).toHaveBeenCalledWith('u1', 'doc-1');
  });
});
```

- [ ] **Step 2: Run route tests to verify they fail**

```bash
bunx jest tests/unit/api/knowledge-documents-route.test.ts --runInBand --coverage=false
```

Expected: FAIL because API routes are missing.

- [ ] **Step 3: Implement shared route helpers inside documents route**

Create `src/app/api/knowledge/documents/route.ts`:

```ts
import { NextResponse } from 'next/server';
import { requireAuth, UnauthorizedError } from '@/lib/auth/session';
import { DEPENDENCY_OUTAGE_MESSAGE, isDependencyOutageError } from '@/lib/errors/dependency-outage';
import { ingestKnowledgeDocument } from '@/lib/rag/knowledge-ingest';
import {
  createKnowledgeDocument,
  createKnowledgeDocumentIndexJob,
  getKnowledgeDocumentById,
  listKnowledgeDocuments,
  markKnowledgeDocumentIndexJobFailed,
  markKnowledgeDocumentIndexJobRunning,
  markKnowledgeDocumentIndexJobSuccess,
} from '@/lib/rag/knowledge-repo';

const MAX_FILE_SIZE_BYTES = 5 * 1024 * 1024;

type UploadFileLike = {
  name?: string;
  size?: number;
  text?: () => Promise<string>;
  arrayBuffer?: () => Promise<ArrayBuffer>;
};

function asUploadFile(value: FormDataEntryValue | null): UploadFileLike | null {
  if (!value || typeof value !== 'object') {
    return null;
  }
  return value as UploadFileLike;
}

async function readFileContentMarkdown(file: UploadFileLike): Promise<string> {
  if (typeof file.text === 'function') {
    return file.text();
  }
  if (typeof file.arrayBuffer === 'function') {
    const bytes = await file.arrayBuffer();
    return Buffer.from(bytes).toString('utf8');
  }
  throw new Error('unable to read uploaded file');
}

function titleFromFilename(filename: string): string {
  return filename.replace(/\.md$/i, '').replace(/[-_]+/g, ' ').trim() || filename;
}

async function enqueueKnowledgeIngest(params: {
  userId: string;
  documentId: string;
  jobId: string;
}) {
  await markKnowledgeDocumentIndexJobRunning(params.jobId);
  try {
    await ingestKnowledgeDocument({ userId: params.userId, documentId: params.documentId });
    await markKnowledgeDocumentIndexJobSuccess(params.jobId);
  } catch (error) {
    const message = error instanceof Error ? error.message : 'knowledge ingest worker failed';
    await markKnowledgeDocumentIndexJobFailed(params.jobId, message);
  }
}

export async function POST(request: Request) {
  try {
    const auth = await requireAuth();
    const formData = await request.formData();
    const fileValue = asUploadFile(formData.get('file'));
    if (!fileValue) {
      return NextResponse.json({ error: 'file is required' }, { status: 400 });
    }

    const filename = fileValue.name?.trim();
    if (!filename || !filename.toLowerCase().endsWith('.md')) {
      return NextResponse.json({ error: 'only .md files are supported' }, { status: 400 });
    }
    if (typeof fileValue.size !== 'number' || Number.isNaN(fileValue.size)) {
      return NextResponse.json({ error: 'invalid file payload' }, { status: 400 });
    }
    if (fileValue.size === 0) {
      return NextResponse.json({ error: 'file must not be empty' }, { status: 400 });
    }
    if (fileValue.size > MAX_FILE_SIZE_BYTES) {
      return NextResponse.json({ error: 'file exceeds 5MB limit' }, { status: 413 });
    }

    const contentMarkdown = await readFileContentMarkdown(fileValue);
    const document = await createKnowledgeDocument({
      userId: auth.user.id,
      filename,
      title: titleFromFilename(filename),
      sourceLabel: null,
      contentMarkdown,
      status: 'processing',
    });
    const indexJob = await createKnowledgeDocumentIndexJob(document.id);

    await enqueueKnowledgeIngest({
      userId: auth.user.id,
      documentId: document.id,
      jobId: indexJob.id,
    });

    const latestDocument = await getKnowledgeDocumentById(auth.user.id, document.id);
    if (!latestDocument) {
      return NextResponse.json({ error: 'knowledge document missing after upload' }, { status: 500 });
    }
    if (latestDocument.status === 'processing') {
      return NextResponse.json(
        {
          error: '知识文档仍在索引中。请稍后刷新状态。',
          document: latestDocument,
        },
        { status: 409 },
      );
    }
    return NextResponse.json({ document: latestDocument }, { status: 201 });
  } catch (error) {
    if (
      error instanceof UnauthorizedError ||
      (error instanceof Error && error.name === 'UnauthorizedError')
    ) {
      const status = error instanceof UnauthorizedError ? error.status : 401;
      return NextResponse.json({ error: error.message }, { status });
    }
    if (isDependencyOutageError(error)) {
      return NextResponse.json({ error: DEPENDENCY_OUTAGE_MESSAGE }, { status: 503 });
    }
    const message = error instanceof Error ? error.message : 'Unknown server error';
    return NextResponse.json({ error: message }, { status: 500 });
  }
}

export async function GET() {
  try {
    const auth = await requireAuth();
    const documents = await listKnowledgeDocuments(auth.user.id);
    return NextResponse.json({ documents, total: documents.length });
  } catch (error) {
    if (
      error instanceof UnauthorizedError ||
      (error instanceof Error && error.name === 'UnauthorizedError')
    ) {
      const status = error instanceof UnauthorizedError ? error.status : 401;
      return NextResponse.json({ error: error.message }, { status });
    }
    if (isDependencyOutageError(error)) {
      return NextResponse.json({ error: DEPENDENCY_OUTAGE_MESSAGE }, { status: 503 });
    }
    const message = error instanceof Error ? error.message : 'Unknown server error';
    return NextResponse.json({ error: message }, { status: 500 });
  }
}
```

- [ ] **Step 4: Implement document detail/delete route**

Create `src/app/api/knowledge/documents/[documentId]/route.ts`:

```ts
import { NextResponse } from 'next/server';
import { requireAuth, UnauthorizedError } from '@/lib/auth/session';
import { DEPENDENCY_OUTAGE_MESSAGE, isDependencyOutageError } from '@/lib/errors/dependency-outage';
import { deleteKnowledgeDocument, getKnowledgeDocumentById } from '@/lib/rag/knowledge-repo';

export async function GET(_request: Request, context: { params: Promise<{ documentId: string }> }) {
  try {
    const auth = await requireAuth();
    const { documentId } = await context.params;
    if (!documentId?.trim()) {
      return NextResponse.json({ error: 'document id is required' }, { status: 400 });
    }
    const document = await getKnowledgeDocumentById(auth.user.id, documentId);
    if (!document) {
      return NextResponse.json({ error: 'knowledge document not found' }, { status: 404 });
    }
    return NextResponse.json({ document });
  } catch (error) {
    if (
      error instanceof UnauthorizedError ||
      (error instanceof Error && error.name === 'UnauthorizedError')
    ) {
      const status = error instanceof UnauthorizedError ? error.status : 401;
      return NextResponse.json({ error: error.message }, { status });
    }
    if (isDependencyOutageError(error)) {
      return NextResponse.json({ error: DEPENDENCY_OUTAGE_MESSAGE }, { status: 503 });
    }
    const message = error instanceof Error ? error.message : 'Unknown server error';
    return NextResponse.json({ error: message }, { status: 500 });
  }
}

export async function DELETE(
  _request: Request,
  context: { params: Promise<{ documentId: string }> },
) {
  try {
    const auth = await requireAuth();
    const { documentId } = await context.params;
    if (!documentId?.trim()) {
      return NextResponse.json({ error: 'document id is required' }, { status: 400 });
    }
    const deleted = await deleteKnowledgeDocument(auth.user.id, documentId);
    if (!deleted) {
      return NextResponse.json({ error: 'knowledge document not found' }, { status: 404 });
    }
    return NextResponse.json({ deleted: true });
  } catch (error) {
    if (
      error instanceof UnauthorizedError ||
      (error instanceof Error && error.name === 'UnauthorizedError')
    ) {
      const status = error instanceof UnauthorizedError ? error.status : 401;
      return NextResponse.json({ error: error.message }, { status });
    }
    if (isDependencyOutageError(error)) {
      return NextResponse.json({ error: DEPENDENCY_OUTAGE_MESSAGE }, { status: 503 });
    }
    const message = error instanceof Error ? error.message : 'Unknown server error';
    return NextResponse.json({ error: message }, { status: 500 });
  }
}
```

- [ ] **Step 5: Run API route tests**

```bash
bunx jest tests/unit/api/knowledge-documents-route.test.ts --runInBand --coverage=false
```

Expected: PASS.

- [ ] **Step 6: Commit**

```bash
git add src/app/api/knowledge/documents/route.ts src/app/api/knowledge/documents/[documentId]/route.ts tests/unit/api/knowledge-documents-route.test.ts
git commit -m "feat: add user knowledge document api"
```

---

### Task 6: Add Knowledge Page UI and Navigation

**Files:**

- Create: `src/lib/knowledge/client.ts`
- Create: `src/components/knowledge/knowledge-page.tsx`
- Create: `src/app/knowledge/page.tsx`
- Create: `tests/unit/components/KnowledgePage.test.tsx`
- Modify: `src/components/navbar.tsx`
- Modify: `tests/unit/components/Navbar.test.tsx`

- [ ] **Step 1: Write failing UI tests**

Create `tests/unit/components/KnowledgePage.test.tsx`:

```tsx
import { render, screen, waitFor } from '@testing-library/react';
import userEvent from '@testing-library/user-event';
import { KnowledgePage } from '@/components/knowledge/knowledge-page';

const fetchMock = jest.fn();

describe('KnowledgePage', () => {
  beforeEach(() => {
    fetchMock.mockReset();
    global.fetch = fetchMock as unknown as typeof fetch;
  });

  it('loads and displays knowledge documents', async () => {
    fetchMock.mockResolvedValueOnce({
      ok: true,
      json: async () => ({
        documents: [
          {
            id: 'doc-1',
            filename: 'handbook.md',
            title: 'Handbook',
            sourceLabel: 'synthetic',
            contentMarkdown: '# Handbook',
            status: 'ready',
            errorMessage: null,
            version: 1,
            createdAt: '2026-06-25T00:00:00.000Z',
            updatedAt: '2026-06-25T00:00:00.000Z',
          },
        ],
      }),
    });

    render(<KnowledgePage />);

    expect(await screen.findByText('handbook.md')).toBeInTheDocument();
    expect(screen.getByText('ready')).toBeInTheDocument();
    expect(screen.getByText('synthetic')).toBeInTheDocument();
  });

  it('uploads a markdown file and reloads the list', async () => {
    fetchMock
      .mockResolvedValueOnce({
        ok: true,
        json: async () => ({ documents: [] }),
      })
      .mockResolvedValueOnce({
        ok: true,
        json: async () => ({
          document: {
            id: 'doc-1',
            filename: 'handbook.md',
            status: 'ready',
          },
        }),
      })
      .mockResolvedValueOnce({
        ok: true,
        json: async () => ({
          documents: [
            {
              id: 'doc-1',
              filename: 'handbook.md',
              title: 'Handbook',
              sourceLabel: null,
              contentMarkdown: '# Handbook',
              status: 'ready',
              errorMessage: null,
              version: 1,
              createdAt: '2026-06-25T00:00:00.000Z',
              updatedAt: '2026-06-25T00:00:00.000Z',
            },
          ],
        }),
      });

    render(<KnowledgePage />);
    const file = new File(['# Handbook'], 'handbook.md', { type: 'text/markdown' });
    await userEvent.upload(await screen.findByLabelText('上传知识文档'), file);

    await waitFor(() => {
      expect(fetchMock).toHaveBeenCalledWith('/api/knowledge/documents', expect.objectContaining({ method: 'POST' }));
    });
    expect(await screen.findByText('handbook.md')).toBeInTheDocument();
  });

  it('deletes a document and refreshes', async () => {
    fetchMock
      .mockResolvedValueOnce({
        ok: true,
        json: async () => ({
          documents: [
            {
              id: 'doc-1',
              filename: 'handbook.md',
              title: 'Handbook',
              sourceLabel: null,
              contentMarkdown: '# Handbook',
              status: 'ready',
              errorMessage: null,
              version: 1,
              createdAt: '2026-06-25T00:00:00.000Z',
              updatedAt: '2026-06-25T00:00:00.000Z',
            },
          ],
        }),
      })
      .mockResolvedValueOnce({
        ok: true,
        json: async () => ({ deleted: true }),
      })
      .mockResolvedValueOnce({
        ok: true,
        json: async () => ({ documents: [] }),
      });

    render(<KnowledgePage />);
    await userEvent.click(await screen.findByRole('button', { name: '删除 handbook.md' }));

    await waitFor(() => {
      expect(fetchMock).toHaveBeenCalledWith('/api/knowledge/documents/doc-1', {
        method: 'DELETE',
      });
    });
  });
});
```

In `tests/unit/components/Navbar.test.tsx`, add:

```ts
expect(screen.getByText('知识库')).toBeInTheDocument();
```

- [ ] **Step 2: Run UI tests to verify they fail**

```bash
bunx jest tests/unit/components/KnowledgePage.test.tsx tests/unit/components/Navbar.test.tsx --runInBand --coverage=false
```

Expected: FAIL because `KnowledgePage` does not exist and navbar lacks `知识库`.

- [ ] **Step 3: Create browser client**

Create `src/lib/knowledge/client.ts`:

```ts
export type KnowledgeDocumentStatus = 'processing' | 'ready' | 'failed';

export type KnowledgeDocumentDto = {
  id: string;
  userId?: string;
  filename: string;
  title: string | null;
  sourceLabel: string | null;
  contentMarkdown: string;
  status: KnowledgeDocumentStatus;
  errorMessage: string | null;
  version: number;
  createdAt: string;
  updatedAt: string;
};

export async function fetchKnowledgeDocuments(): Promise<KnowledgeDocumentDto[]> {
  const res = await fetch('/api/knowledge/documents');
  const data = (await res.json()) as { documents?: KnowledgeDocumentDto[]; error?: string };
  if (!res.ok || !data.documents) {
    throw new Error(data.error || '加载知识库失败');
  }
  return data.documents;
}

export async function uploadKnowledgeDocument(file: File): Promise<KnowledgeDocumentDto> {
  const form = new FormData();
  form.append('file', file);
  const res = await fetch('/api/knowledge/documents', {
    method: 'POST',
    body: form,
  });
  const data = (await res.json()) as { document?: KnowledgeDocumentDto; error?: string };
  if (!res.ok || !data.document) {
    throw new Error(data.error || '上传知识文档失败');
  }
  return data.document;
}

export async function deleteKnowledgeDocument(documentId: string): Promise<void> {
  const res = await fetch(`/api/knowledge/documents/${documentId}`, {
    method: 'DELETE',
  });
  const data = (await res.json()) as { deleted?: boolean; error?: string };
  if (!res.ok || !data.deleted) {
    throw new Error(data.error || '删除知识文档失败');
  }
}
```

- [ ] **Step 4: Create `KnowledgePage` component**

Create `src/components/knowledge/knowledge-page.tsx`:

```tsx
'use client';

import { useEffect, useRef, useState } from 'react';
import { FileText, RefreshCw, Trash2, Upload } from 'lucide-react';
import { Button, Card, CardBody } from '@/components/ui';
import {
  deleteKnowledgeDocument,
  fetchKnowledgeDocuments,
  type KnowledgeDocumentDto,
  uploadKnowledgeDocument,
} from '@/lib/knowledge/client';

function byteLabel(markdown: string): string {
  const n = new TextEncoder().encode(markdown).length;
  if (n < 1024) return `${n} B`;
  return `${Math.round(n / 1024)} KB`;
}

function dateLabel(value: string): string {
  const date = new Date(value);
  if (Number.isNaN(date.getTime())) return value;
  return date.toLocaleString('zh-CN', { hour12: false });
}

export function KnowledgePage() {
  const [documents, setDocuments] = useState<KnowledgeDocumentDto[]>([]);
  const [isLoading, setIsLoading] = useState(true);
  const [isUploading, setIsUploading] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const fileInputRef = useRef<HTMLInputElement | null>(null);

  const loadDocuments = async () => {
    setIsLoading(true);
    try {
      setDocuments(await fetchKnowledgeDocuments());
      setError(null);
    } catch (e) {
      setError(e instanceof Error ? e.message : '加载知识库失败');
    } finally {
      setIsLoading(false);
    }
  };

  useEffect(() => {
    void loadDocuments();
  }, []);

  const onUpload = async (file: File | null) => {
    if (!file || isUploading) return;
    setIsUploading(true);
    setError(null);
    try {
      await uploadKnowledgeDocument(file);
      await loadDocuments();
    } catch (e) {
      setError(e instanceof Error ? e.message : '上传知识文档失败');
    } finally {
      setIsUploading(false);
    }
  };

  const onDelete = async (documentId: string) => {
    setError(null);
    try {
      await deleteKnowledgeDocument(documentId);
      await loadDocuments();
    } catch (e) {
      setError(e instanceof Error ? e.message : '删除知识文档失败');
    }
  };

  return (
    <div className="mx-auto w-full max-w-5xl space-y-4 pb-12">
      <div className="flex flex-col gap-3 sm:flex-row sm:items-center sm:justify-between">
        <div>
          <h1 className="text-foreground text-3xl font-bold">知识库</h1>
          <p className="text-muted-foreground mt-2 text-sm">
            上传招聘资料，聊天时会按当前账号自动检索。
          </p>
        </div>
        <div className="flex items-center gap-2">
          <input
            ref={fileInputRef}
            type="file"
            accept=".md,text/markdown"
            className="sr-only"
            aria-label="上传知识文档"
            disabled={isUploading}
            onChange={(event) => {
              const file = event.currentTarget.files?.[0] ?? null;
              void onUpload(file);
              event.currentTarget.value = '';
            }}
          />
          <Button
            color="primary"
            startContent={<Upload className="size-4" />}
            isLoading={isUploading}
            onClick={() => fileInputRef.current?.click()}
          >
            上传 Markdown
          </Button>
          <Button
            variant="bordered"
            startContent={<RefreshCw className={`size-4 ${isLoading ? 'animate-spin' : ''}`} />}
            onClick={() => void loadDocuments()}
          >
            刷新
          </Button>
        </div>
      </div>

      {error ? <p className="text-danger text-sm">{error}</p> : null}

      <Card className="border-border/60 bg-background/70 border">
        <CardBody className="p-0">
          <div className="grid grid-cols-[minmax(0,1.6fr)_120px_100px_130px_80px] gap-3 border-b px-4 py-3 text-xs font-medium text-secondary-foreground">
            <span>文件</span>
            <span>来源</span>
            <span>状态</span>
            <span>更新</span>
            <span className="text-right">操作</span>
          </div>
          {documents.length === 0 ? (
            <div className="text-secondary-foreground px-4 py-10 text-center text-sm">
              {isLoading ? '加载中...' : '还没有知识文档'}
            </div>
          ) : (
            <div className="divide-border divide-y">
              {documents.map((doc) => (
                <div
                  key={doc.id}
                  className="grid grid-cols-[minmax(0,1.6fr)_120px_100px_130px_80px] items-center gap-3 px-4 py-3 text-sm"
                >
                  <div className="flex min-w-0 items-center gap-2">
                    <FileText className="text-primary size-4 shrink-0" />
                    <div className="min-w-0">
                      <p className="truncate font-medium">{doc.filename}</p>
                      <p className="text-secondary-foreground text-xs">
                        {byteLabel(doc.contentMarkdown)} · v{doc.version}
                      </p>
                    </div>
                  </div>
                  <span className="truncate text-secondary-foreground">
                    {doc.sourceLabel ?? '-'}
                  </span>
                  <span
                    className={
                      doc.status === 'failed'
                        ? 'text-danger'
                        : doc.status === 'ready'
                          ? 'text-emerald-600 dark:text-emerald-400'
                          : 'text-amber-700 dark:text-amber-300'
                    }
                    title={doc.errorMessage ?? undefined}
                  >
                    {doc.status}
                  </span>
                  <span className="text-secondary-foreground text-xs">{dateLabel(doc.updatedAt)}</span>
                  <button
                    type="button"
                    className="ml-auto inline-flex size-8 items-center justify-center rounded-md text-secondary-foreground hover:bg-secondary hover:text-danger"
                    aria-label={`删除 ${doc.filename}`}
                    onClick={() => void onDelete(doc.id)}
                  >
                    <Trash2 className="size-4" />
                  </button>
                </div>
              ))}
            </div>
          )}
        </CardBody>
      </Card>
    </div>
  );
}
```

- [ ] **Step 5: Create page shell**

Create `src/app/knowledge/page.tsx`:

```tsx
import { KnowledgePage } from '@/components/knowledge/knowledge-page';
import { SignInButton } from '@/components/auth/sign-in-button';
import { getServerAuthSession } from '@/lib/auth/session';

export default async function UserKnowledgePage() {
  const session = await getServerAuthSession();

  return (
    <section className="container mx-auto px-4 py-8">
      {!session?.user ? (
        <div className="border-border bg-background/60 rounded-xl border p-8 text-center backdrop-blur">
          <h1 className="text-foreground text-xl font-semibold">请先登录后继续</h1>
          <p className="text-muted-foreground mt-2 text-sm">登录本地账号后即可管理知识库。</p>
          <div className="mt-6 flex justify-center">
            <SignInButton />
          </div>
        </div>
      ) : (
        <KnowledgePage />
      )}
    </section>
  );
}
```

- [ ] **Step 6: Add nav link**

In `src/components/navbar.tsx`, add after `对话`:

```ts
{ name: '知识库', href: '/knowledge' },
```

- [ ] **Step 7: Run UI tests**

```bash
bunx jest tests/unit/components/KnowledgePage.test.tsx tests/unit/components/Navbar.test.tsx --runInBand --coverage=false
```

Expected: PASS.

- [ ] **Step 8: Commit**

```bash
git add src/lib/knowledge/client.ts src/components/knowledge/knowledge-page.tsx src/app/knowledge/page.tsx tests/unit/components/KnowledgePage.test.tsx src/components/navbar.tsx tests/unit/components/Navbar.test.tsx
git commit -m "feat: add user knowledge page"
```

---

### Task 7: Add Synthetic ByteDance Fixture and Seed Script

**Files:**

- Create: `src/lib/rag/fixtures/bytedance-recruiting-handbook.synthetic.md`
- Create: `src/scripts/seed-xxwade-knowledge.ts`
- Modify: `package.json`

- [ ] **Step 1: Create synthetic handbook fixture**

Create `src/lib/rag/fixtures/bytedance-recruiting-handbook.synthetic.md` with this content:

```md
# 字节跳动招聘知识手册（合成样例）

> 说明：本文档是 Hiring Agent 演示用的合成样例，不是字节跳动真实内部文件，不代表字节跳动官方政策、经营数据或招聘口径。所有数字、组织描述、流程和福利信息均为虚构数据，用于测试 RAG 检索和招聘问答。

## 公司定位与愿景

字节跳动样例公司的长期愿景是“激发创造，丰富生活”。在招聘沟通中，可以把公司定位描述为一家以内容、推荐、协作工具、企业服务和智能技术为核心的全球化科技公司。公司强调用户价值、长期主义、技术驱动和高密度人才协作。

面向候选人时，推荐突出三点：第一，公司业务覆盖内容消费、创作者生态、企业效率、商业化和 AI 基础设施；第二，组织鼓励快速试错和数据驱动决策；第三，对人才的期待是能在不确定场景中独立定义问题、推动跨团队协作并交付结果。

## 组织结构

样例组织由六个一级业务与平台组成：

1. 内容与社区事业群：负责短视频、图文内容、直播、创作者工具和社区治理。
2. 商业化事业群：负责广告平台、品牌营销、商家增长、数据产品和行业解决方案。
3. 企业服务事业群：负责协作工具、知识管理、流程自动化和企业 AI 助手。
4. 国际化事业群：负责海外产品、本地化运营、全球增长和国际安全合规。
5. 技术平台事业群：负责推荐系统、搜索、机器学习平台、数据平台、云基础设施和安全工程。
6. 职能与管理平台：负责人力资源、财务、法务、采购、行政、公共事务和内控。

典型汇报链路为：公司经营委员会 -> 事业群负责人 -> 业务线负责人 -> 部门负责人 -> 项目组负责人。招聘过程中，候选人通常会接触用人经理、业务面试官、HRBP 和招聘负责人。

## 协作模式

公司采用“目标对齐、项目自治、数据复盘”的协作方式。重要项目会明确 DRI（直接负责人），DRI 负责拉齐目标、拆分里程碑、同步风险和推动结果。跨团队协作强调文档先行，会议需要有明确议题、结论和行动项。

对候选人说明时，可以说团队鼓励开放讨论，但也要求讨论后形成可执行结论。优秀员工不只完成任务，还会主动识别业务杠杆点、提出方案并推动落地。

## 近年经营数据样例

以下均为合成数据，用于招聘问答演示：

| 年度 | 全球月活用户 | 年收入 | 研发投入占收入 | 员工数 | 重点变化 |
| --- | ---: | ---: | ---: | ---: | --- |
| 2021 | 12.8 亿 | 580 亿美元 | 18% | 78,000 | 国际化内容业务高速增长 |
| 2022 | 15.1 亿 | 720 亿美元 | 20% | 92,000 | 企业服务和商业化工具扩张 |
| 2023 | 17.4 亿 | 880 亿美元 | 21% | 108,000 | 推荐系统、搜索和数据平台升级 |
| 2024 | 19.2 亿 | 1,020 亿美元 | 22% | 121,000 | AI 基础设施和创作者生态成为重点 |
| 2025 | 20.5 亿 | 1,160 亿美元 | 23% | 132,000 | 多模态 AI、企业智能工具和国际合规加强 |

招聘沟通中可以引用趋势，不应把这些虚构数字说成真实披露数据。推荐表达：“在样例资料中，公司呈现持续增长和高研发投入特征。”

## 今年绩效要求

2026 年样例绩效要求强调“高质量增长、AI 原生、全球协作、合规安全”。绩效评估分为四个维度：

1. 业务结果：是否完成关键指标，是否对收入、用户增长、效率或风险降低产生可衡量贡献。
2. 过程质量：是否有清晰目标、正确优先级、稳定交付节奏和可复盘方法。
3. 协作影响：是否能跨团队建立信任，推动复杂问题闭环。
4. 组织贡献：是否沉淀方法、培养新人、提升团队工程或运营标准。

技术岗位今年更看重系统设计能力、数据意识、工程质量、AI 工具使用能力和安全合规意识。产品和运营岗位更看重用户洞察、策略拆解、实验设计、复盘能力和跨区域协作。

## 发展方向

未来一年样例公司重点投入方向：

- AI 原生应用：把多模态模型、智能创作、智能客服和企业知识助手融入核心产品。
- 推荐与搜索融合：提升用户发现效率，减少低质内容曝光，提高创作者分发公平性。
- 企业效率工具：强化知识管理、流程自动化、数据分析和招聘协作场景。
- 国际化合规：加强数据安全、内容安全、隐私保护和区域化运营。
- 商业化效率：通过自动化投放、素材生成和行业模型提升广告 ROI。
- 基础设施降本增效：优化推理成本、存储成本和跨区域容灾能力。

招聘时可以把这些方向转化为岗位吸引点，例如“这个岗位会参与 AI 原生招聘助手建设”“这个团队关注推荐链路稳定性和成本优化”。

## 上班作息与协作节奏

样例工作时间为弹性工作制。多数团队核心协作时间为 10:30-19:30，中午 12:30-14:00 可弹性安排午餐和休息。部分国际化团队因跨时区会议，会在每周固定两天安排早晚协作窗口，并通过调休或弹性到岗平衡。

公司不鼓励无效加班。绩效更关注结果、质量和协作效率。项目高峰期可能出现阶段性加班，用人经理需要提前说明项目周期、发布节点和团队支持方式。

## 福利待遇

样例福利包括：

- 薪酬：固定薪资、年度奖金、长期激励和专项激励。
- 假期：法定年假、福利年假、病假、婚育相关假期和公益假。
- 健康：补充商业保险、年度体检、心理咨询、运动补贴。
- 办公：餐补、班车或通勤补贴、人体工学设备、远程协作工具。
- 成长：内部课程、技术分享、管理训练营、外部会议报销。
- 家庭支持：节日礼品、亲子活动、家庭日和员工援助计划。

候选人询问福利时，回答应区分“样例资料中的福利口径”和“实际 offer 以 HR 确认为准”。

## 招聘画像

通用优秀候选人画像：

1. 能把模糊问题拆成清晰目标和路径。
2. 能用数据或用户证据验证判断。
3. 对结果负责，不把问题停留在协作边界。
4. 能接受高变化环境，并保持稳定交付。
5. 有学习速度，能快速掌握新工具和新领域。

技术岗位加分项包括：大规模系统经验、推荐或搜索经验、AI/LLM 工程经验、可观测性建设、成本优化、安全合规实践。产品岗位加分项包括：复杂业务抽象、增长实验、国际化、本地化和商业化经验。

## 面试流程

标准流程为：

1. HR 初筛：确认动机、基本背景、薪资范围和可入职时间。
2. 一面：考察岗位基础能力和过往项目细节。
3. 二面：考察复杂问题解决、跨团队协作和业务理解。
4. 终面：由部门负责人或资深面试官评估潜力、价值观和团队匹配。
5. HR 面：确认期望、职级、薪酬结构、风险点和入职安排。

技术岗位常见题目包括系统设计、工程质量、性能优化、数据一致性、故障排查和 AI 工具实践。非技术岗位常见题目包括业务复盘、指标拆解、增长策略、项目推进和冲突处理。

## 职级能力要求

P5：能独立完成模块任务，代码或方案质量稳定，能清楚汇报风险。

P6：能负责完整项目，主动拆解目标，协调上下游，沉淀可复用方法。

P7：能定义复杂问题，影响多个团队，建立机制并推动业务指标显著改善。

P8：能判断方向和资源优先级，培养负责人，推动跨业务线协作和长期能力建设。

管理岗要求不只看团队规模，还看目标制定、人才密度、组织机制、绩效反馈和复杂冲突处理能力。

## 候选人常见问答

问：公司是否重视 AI？  
答：样例资料显示，AI 原生应用、多模态模型、智能工具和基础设施效率是今年重点方向。具体到岗位，要结合团队职责说明参与深度。

问：工作强度如何？  
答：样例资料显示多数团队采用弹性工作制，核心协作时间为 10:30-19:30。项目高峰期可能阶段性加班，但绩效重点是结果、质量和效率。

问：什么样的人适合这里？  
答：适合能处理不确定性、学习快、结果导向、能跨团队协作并持续复盘的人。

问：福利有哪些？  
答：样例资料包括薪酬激励、补充保险、年假、餐补、成长培训和家庭支持。实际福利以 HR 和 offer 文件为准。

## Offer 沟通注意事项

招聘沟通要避免夸大业务、承诺未确认的薪酬福利、把合成数据说成真实数据。推荐使用“根据样例资料”“以实际团队和 HR 确认为准”这类限定表达。

对高优先级候选人，应提前准备岗位亮点、团队挑战、成长空间和面试反馈。对有顾虑的候选人，应明确顾虑类型：工作强度、业务稳定性、技术深度、管理风格、薪资结构或地域安排，然后分别回应。
```

- [ ] **Step 2: Write seed script**

Create `src/scripts/seed-xxwade-knowledge.ts`:

```ts
import { readFile } from 'node:fs/promises';
import path from 'node:path';
import { ensureDefaultUser } from '@/lib/auth/default-user';
import {
  createKnowledgeDocument,
  createKnowledgeDocumentIndexJob,
  findKnowledgeDocumentBySourceLabel,
  markKnowledgeDocumentIndexJobFailed,
  markKnowledgeDocumentIndexJobRunning,
  markKnowledgeDocumentIndexJobSuccess,
  updateKnowledgeDocumentForReindex,
} from '@/lib/rag/knowledge-repo';
import { ingestKnowledgeDocument } from '@/lib/rag/knowledge-ingest';
import { closePrismaClient } from '@/lib/prisma';

const SOURCE_LABEL = 'synthetic-bytedance-recruiting-handbook';
const FILENAME = 'bytedance-recruiting-handbook.synthetic.md';
const TITLE = '字节跳动招聘知识手册（合成样例）';

async function main(): Promise<void> {
  const user = await ensureDefaultUser();
  const contentMarkdown = await readFile(
    path.resolve(process.cwd(), 'src/lib/rag/fixtures', FILENAME),
    'utf8',
  );

  const existing = await findKnowledgeDocumentBySourceLabel(user.id, SOURCE_LABEL);
  const document = existing
    ? await updateKnowledgeDocumentForReindex({
        userId: user.id,
        id: existing.id,
        filename: FILENAME,
        title: TITLE,
        contentMarkdown,
      })
    : await createKnowledgeDocument({
        userId: user.id,
        filename: FILENAME,
        title: TITLE,
        sourceLabel: SOURCE_LABEL,
        contentMarkdown,
        status: 'processing',
      });

  if (!document) {
    throw new Error('failed to create or update synthetic knowledge document');
  }

  const job = await createKnowledgeDocumentIndexJob(document.id);
  await markKnowledgeDocumentIndexJobRunning(job.id);
  try {
    await ingestKnowledgeDocument({ userId: user.id, documentId: document.id });
    await markKnowledgeDocumentIndexJobSuccess(job.id);
    console.log(`[knowledge-seed] indexed ${FILENAME} for ${user.username}`);
  } catch (error) {
    const message = error instanceof Error ? error.message : String(error);
    await markKnowledgeDocumentIndexJobFailed(job.id, message);
    throw error;
  }
}

void main()
  .catch((error) => {
    console.error(error instanceof Error ? error.message : String(error));
    process.exitCode = 1;
  })
  .finally(async () => {
    await closePrismaClient();
  });
```

- [ ] **Step 3: Add package script**

In `package.json` scripts, add:

```json
"seed:knowledge:xxwade": "bunx tsx src/scripts/seed-xxwade-knowledge.ts"
```

- [ ] **Step 4: Run TypeScript check for script wiring**

```bash
bun run type-check
```

Expected: PASS.

- [ ] **Step 5: Commit**

```bash
git add src/lib/rag/fixtures/bytedance-recruiting-handbook.synthetic.md src/scripts/seed-xxwade-knowledge.ts package.json
git commit -m "feat: add xxwade knowledge seed"
```

---

### Task 8: Add PostgreSQL Integration Coverage

**Files:**

- Create: `tests/integration/chat/user-knowledge-rag.e2e.test.ts`

- [ ] **Step 1: Write integration test**

Create `tests/integration/chat/user-knowledge-rag.e2e.test.ts`:

```ts
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
    await prisma.$queryRaw`CREATE EXTENSION IF NOT EXISTS vector`;
    await prisma.$queryRaw`SELECT '[1,2,3]'::vector`;
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

    await prisma.user.createMany({ data: [USER_A, USER_B] });
    const docA = await createKnowledgeDocument({
      userId: USER_A.id,
      filename: 'bytedance.md',
      title: 'ByteDance synthetic handbook',
      sourceLabel: 'synthetic',
      contentMarkdown: '# 绩效\n今年绩效要求强调高质量交付。',
      status: 'ready',
    });
    const docB = await createKnowledgeDocument({
      userId: USER_B.id,
      filename: 'other.md',
      title: 'Other handbook',
      sourceLabel: 'other',
      contentMarkdown: '# 福利\n其他公司福利。',
      status: 'ready',
    });

    await replaceKnowledgeDocumentChunks({
      userId: USER_A.id,
      documentId: docA.id,
      embeddingModel: 'test-model',
      chunks: [
        {
          id: 'knowledge-user-a-chunk-1',
          chunkIndex: 0,
          content: '今年绩效要求强调高质量交付。',
          tokenEstimate: null,
          embedding: [1, 0, 0],
        },
      ],
    });
    await replaceKnowledgeDocumentChunks({
      userId: USER_B.id,
      documentId: docB.id,
      embeddingModel: 'test-model',
      chunks: [
        {
          id: 'knowledge-user-b-chunk-1',
          chunkIndex: 0,
          content: '其他用户的资料不能被召回。',
          tokenEstimate: null,
          embedding: [1, 0, 0],
        },
      ],
    });

    const rows = await searchKnowledgeDocumentChunks({
      userId: USER_A.id,
      queryVector: [1, 0, 0],
      embeddingModel: 'test-model',
      topK: 5,
    });

    expect(rows).toHaveLength(1);
    expect(rows[0]?.userId).toBe(USER_A.id);
    expect(rows[0]?.content).toContain('高质量交付');
  });
});
```

- [ ] **Step 2: Run integration test**

```bash
bunx jest tests/integration/chat/user-knowledge-rag.e2e.test.ts --runInBand --coverage=false
```

Expected: PASS when PostgreSQL and pgvector are available. If pgvector is unavailable, the test logs the skip reason and returns without failing.

- [ ] **Step 3: Commit**

```bash
git add tests/integration/chat/user-knowledge-rag.e2e.test.ts
git commit -m "test: add user knowledge pgvector integration"
```

---

### Task 9: Final Verification

**Files:**

- No new files.

- [ ] **Step 1: Run targeted unit tests**

```bash
bunx jest tests/unit/types/rag-schema-contract.test.ts tests/unit/lib/rag/knowledge-repo.test.ts tests/unit/lib/rag/knowledge-ingest.test.ts tests/unit/lib/rag/knowledge-retrieval.test.ts tests/unit/api/knowledge-documents-route.test.ts tests/unit/api/chat-stream-route.test.ts tests/unit/components/KnowledgePage.test.tsx tests/unit/components/Navbar.test.tsx --runInBand --coverage=false
```

Expected: PASS.

- [ ] **Step 2: Run type check**

```bash
bun run type-check
```

Expected: PASS.

- [ ] **Step 3: Run lint**

```bash
bun run lint
```

Expected: PASS.

- [ ] **Step 4: Run integration test when local PostgreSQL is available**

```bash
bunx jest tests/integration/chat/user-knowledge-rag.e2e.test.ts --runInBand --coverage=false
```

Expected: PASS or explicit pgvector-unavailable skip log.

- [ ] **Step 5: Apply migration and seed local data**

```bash
bun run prisma:migrate:deploy
bun run seed:knowledge:xxwade
```

Expected:

```text
[knowledge-seed] indexed bytedance-recruiting-handbook.synthetic.md for xxwade
```

- [ ] **Step 6: Start dev server and smoke test manually**

```bash
bun run dev
```

Expected: dev server starts on `http://localhost:3000`.

Manual smoke:

1. Log in as `xxwade / hiring_2026`.
2. Open `/knowledge`.
3. Confirm `bytedance-recruiting-handbook.synthetic.md` appears with `ready`.
4. Open `/chat`.
5. Ask: `今年绩效要求是什么？`
6. Confirm the answer can mention high-quality delivery, AI-native work, global collaboration, and compliance/safety from the synthetic handbook.

- [ ] **Step 7: Final commit if verification fixes were needed**

If verification required code changes:

```bash
git add <changed-files>
git commit -m "fix: stabilize user knowledge rag"
```

If no changes were needed, do not create an empty commit.

---

## Self-Review

Spec coverage:

- User-bound knowledge documents: Task 1, Task 2, Task 5.
- PostgreSQL/pgvector vector storage: Task 1, Task 2, Task 8.
- Upload page: Task 6.
- Automatic chat retrieval: Task 4.
- Synthetic ByteDance document for `xxwade`: Task 7.
- User isolation: Task 2, Task 4, Task 5, Task 8.
- Existing Qdrant conversation RAG remains intact: Task 4 only adds user retrieval beside existing conversation retrieval.
- Validation and tests: Task 1 through Task 9.

Placeholder scan:

- No unspecified functions.
- No undefined route paths.
- No unstated test commands.
- No empty implementation steps.

Type consistency:

- Repository functions use `userId` first for scoped document operations.
- Ingest passes `{ userId, documentId }`.
- Retrieval returns `{ contextText, matches }`, matching existing conversation retrieval shape.
- API DTOs use `KnowledgeDocumentDto` and mirror Prisma field names exposed by routes.
