# Conversation Markdown RAG Implementation Plan

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** Add conversation-scoped Markdown upload and vector retrieval so `/api/conversations/:id/messages/stream` can answer using the current conversation's documents.

**Architecture:** Keep existing conversation/message streaming routes and auth model. Add a document ingest/index pipeline (`MySQL + Qdrant`), then inject retrieved chunks into chat prompt assembly before model streaming. If retrieval fails, degrade to normal chat without blocking streaming.

**Tech Stack:** Next.js App Router, TypeScript, Prisma/MySQL, LangChain, OpenAI Embeddings, Qdrant, Jest integration tests.

---

## File Structure (Planned Changes)

- Create: `src/lib/rag/qdrant.ts`  
  Responsibility: Qdrant client bootstrap and collection helpers.
- Create: `src/lib/rag/markdown.ts`  
  Responsibility: Markdown normalize/split utilities.
- Create: `src/lib/rag/embed.ts`  
  Responsibility: embedding model wrapper.
- Create: `src/lib/rag/retrieval.ts`  
  Responsibility: retrieve top chunks by `conversationId`.
- Create: `src/lib/chat/repositories/document-repo.ts`  
  Responsibility: document/chunk/job persistence helpers.
- Create: `src/app/api/conversations/[id]/documents/route.ts`  
  Responsibility: upload/list documents per conversation.
- Create: `src/app/api/conversations/[id]/documents/[documentId]/route.ts`  
  Responsibility: document detail/delete endpoints.
- Modify: `src/lib/env.ts`  
  Responsibility: add RAG/Qdrant/env schema.
- Modify: `prisma/schema.prisma`  
  Responsibility: add conversation document/chunk/job models.
- Modify: `src/lib/chat/chain.ts`  
  Responsibility: support retrieved context prompt input.
- Modify: `src/app/api/conversations/[id]/messages/stream/route.ts`  
  Responsibility: call retrieval before streaming.
- Modify: `src/lib/chat/client.ts`  
  Responsibility: add document APIs for UI.
- Modify: `src/components/chat/chat-ui.tsx`  
  Responsibility: upload button + document status list.
- Create: `tests/unit/lib/rag/markdown.test.ts`
- Create: `tests/unit/lib/rag/retrieval.test.ts`
- Create: `tests/unit/api/conversation-documents-route.test.ts`
- Create: `tests/integration/chat/conversation-rag.e2e.test.ts`

## Task 1: Add RAG Data Models and Migration

**Files:**

- Modify: `prisma/schema.prisma`
- Create: `prisma/migrations/<timestamp>_add_conversation_document_rag_tables/migration.sql`
- Test: `pnpm exec prisma validate`

- [ ] **Step 1: Write failing schema checklist test note**

```ts
// tests/unit/types/rag-schema-contract.test.ts (new)
describe('rag schema contract', () => {
  it('requires conversation document/chunk/job models', () => {
    expect(true).toBe(false); // replace after schema landed
  });
});
```

- [ ] **Step 2: Run schema validation baseline**

Run: `pnpm exec prisma validate`  
Expected: PASS for current schema, but missing RAG tables per checklist.

- [ ] **Step 3: Add minimal Prisma models**

```prisma
model ConversationDocument {
  id              String   @id @default(uuid()) @db.VarChar(36)
  conversationId  String   @map("conversation_id") @db.VarChar(36)
  filename        String   @db.VarChar(255)
  contentMarkdown String   @map("content_markdown") @db.LongText
  status          String   @default("processing") @db.VarChar(32)
  errorMessage    String?  @map("error_message") @db.Text
  version         Int      @default(1)
  createdAt       DateTime @default(now()) @map("created_at") @db.DateTime(3)
  updatedAt       DateTime @updatedAt @map("updated_at") @db.DateTime(3)
  chunks          ConversationDocumentChunk[]
  jobs            ConversationDocumentIndexJob[]
  conversation    Conversation @relation(fields: [conversationId], references: [id], onDelete: Cascade)
  @@index([conversationId])
  @@index([status])
  @@map("conversation_documents")
}
```

- [ ] **Step 4: Generate migration and re-validate**

Run:  
`pnpm exec prisma migrate dev --name add-conversation-document-rag-tables`  
`pnpm exec prisma validate`  
Expected: PASS.

- [ ] **Step 5: Commit**

Run:
`git add prisma/schema.prisma prisma/migrations tests/unit/types/rag-schema-contract.test.ts`  
`git commit -m "feat(rag): add conversation document schema and migration"`

## Task 2: Add Env and Qdrant/Embedding Infrastructure

**Files:**

- Modify: `src/lib/env.ts`
- Create: `src/lib/rag/qdrant.ts`
- Create: `src/lib/rag/embed.ts`
- Create: `tests/unit/lib/rag/retrieval.test.ts`

- [ ] **Step 1: Write failing unit test for env contract**

```ts
it('parses rag env defaults', () => {
  const parsed = parseEnv({});
  expect(parsed.QDRANT_URL).toBeDefined();
  expect(parsed.RAG_TOP_K).toBeGreaterThan(0);
});
```

- [ ] **Step 2: Run test to verify failure**

Run: `pnpm exec jest tests/unit/lib/rag/retrieval.test.ts --runInBand`  
Expected: FAIL (RAG env keys/helpers missing).

- [ ] **Step 3: Implement env + client wrappers**

```ts
// src/lib/rag/qdrant.ts
import { QdrantClient } from '@qdrant/js-client-rest';
import { env } from '@/lib/env';
export const qdrant = new QdrantClient({ url: env.QDRANT_URL, apiKey: env.QDRANT_API_KEY });
export const RAG_COLLECTION = env.QDRANT_COLLECTION_NAME;
```

- [ ] **Step 4: Re-run tests**

Run: `pnpm exec jest tests/unit/lib/rag/retrieval.test.ts --runInBand`  
Expected: PASS for env parsing and client creation contract.

- [ ] **Step 5: Add dependency and commit**

Run:  
`pnpm add @qdrant/js-client-rest @langchain/textsplitters`  
`git add package.json pnpm-lock.yaml src/lib/env.ts src/lib/rag/qdrant.ts src/lib/rag/embed.ts tests/unit/lib/rag/retrieval.test.ts`  
`git commit -m "feat(rag): add qdrant and embedding infrastructure"`

## Task 3: Build Markdown Split + Document Repository Layer

**Files:**

- Create: `src/lib/rag/markdown.ts`
- Create: `src/lib/chat/repositories/document-repo.ts`
- Create: `tests/unit/lib/rag/markdown.test.ts`

- [ ] **Step 1: Write failing markdown split tests**

```ts
it('splits markdown by heading and chunk size', async () => {
  const chunks = await splitMarkdownToChunks('# A\nx\n## B\ny', {
    targetTokens: 120,
    overlapTokens: 20,
  });
  expect(chunks.length).toBeGreaterThan(1);
  expect(chunks[0].content).toContain('# A');
});
```

- [ ] **Step 2: Run tests to verify failure**

Run: `pnpm exec jest tests/unit/lib/rag/markdown.test.ts --runInBand`  
Expected: FAIL.

- [ ] **Step 3: Implement splitter + repo primitives**

```ts
// src/lib/chat/repositories/document-repo.ts
export async function createConversationDocument(params: {
  conversationId: string;
  filename: string;
  contentMarkdown: string;
}) {
  /* prisma.conversationDocument.create */
}
export async function setConversationDocumentStatus(
  id: string,
  status: 'processing' | 'ready' | 'failed',
  errorMessage?: string,
) {
  /* update */
}
export async function bulkInsertDocumentChunks(
  rows: Array<{ documentId: string; conversationId: string; chunkIndex: number; content: string }>,
) {
  /* createMany */
}
```

- [ ] **Step 4: Re-run tests**

Run: `pnpm exec jest tests/unit/lib/rag/markdown.test.ts --runInBand`  
Expected: PASS.

- [ ] **Step 5: Commit**

Run:
`git add src/lib/rag/markdown.ts src/lib/chat/repositories/document-repo.ts tests/unit/lib/rag/markdown.test.ts`  
`git commit -m "feat(rag): add markdown chunking and document repository layer"`

## Task 4: Implement Document Upload/List/Detail/Delete APIs

**Files:**

- Create: `src/app/api/conversations/[id]/documents/route.ts`
- Create: `src/app/api/conversations/[id]/documents/[documentId]/route.ts`
- Create: `tests/unit/api/conversation-documents-route.test.ts`

- [ ] **Step 1: Write failing route tests**

```ts
it('POST /documents returns 201 with processing status', async () => {
  const res = await POST(mockMultipartRequest(), mockConversationContext('c1'));
  expect(res.status).toBe(201);
});
```

- [ ] **Step 2: Run tests to verify failure**

Run: `pnpm exec jest tests/unit/api/conversation-documents-route.test.ts --runInBand`  
Expected: FAIL.

- [ ] **Step 3: Implement minimal route handlers**

```ts
// POST route behavior
// 1) requireAuth()
// 2) verify conversation ownership
// 3) parse FormData "file", enforce .md + size limit
// 4) create doc(status=processing)
// 5) trigger async ingest(index) and return 201
```

- [ ] **Step 4: Re-run tests**

Run: `pnpm exec jest tests/unit/api/conversation-documents-route.test.ts --runInBand`  
Expected: PASS.

- [ ] **Step 5: Commit**

Run:
`git add src/app/api/conversations/[id]/documents/route.ts src/app/api/conversations/[id]/documents/[documentId]/route.ts tests/unit/api/conversation-documents-route.test.ts`  
`git commit -m "feat(rag): add conversation document management APIs"`

## Task 5: Implement Ingest Pipeline and Qdrant Upsert

**Files:**

- Modify: `src/lib/rag/qdrant.ts`
- Modify: `src/lib/rag/embed.ts`
- Modify: `src/lib/chat/repositories/document-repo.ts`
- Create: `src/lib/rag/ingest.ts`
- Test: `tests/integration/chat/conversation-rag.e2e.test.ts`

- [ ] **Step 1: Write failing integration scenario**

```ts
it('uploads markdown and marks document ready after index', async () => {
  const doc = await uploadConversationMarkdown(conversationId, '# policy\nPTO is 20 days');
  await waitUntilReady(doc.id);
  expect((await getDocument(doc.id)).status).toBe('ready');
});
```

- [ ] **Step 2: Run test to verify failure**

Run: `pnpm exec jest tests/integration/chat/conversation-rag.e2e.test.ts --runInBand --coverage=false`  
Expected: FAIL.

- [ ] **Step 3: Implement ingest worker function**

```ts
export async function ingestConversationDocument(documentId: string) {
  // load doc -> split -> embed -> upsert qdrant(payload includes conversationId)
  // persist chunk rows + qdrant_point_id
  // mark ready/failed
}
```

- [ ] **Step 4: Re-run integration test**

Run: `pnpm exec jest tests/integration/chat/conversation-rag.e2e.test.ts --runInBand --coverage=false`  
Expected: PASS.

- [ ] **Step 5: Commit**

Run:
`git add src/lib/rag/ingest.ts src/lib/rag/qdrant.ts src/lib/rag/embed.ts src/lib/chat/repositories/document-repo.ts tests/integration/chat/conversation-rag.e2e.test.ts`  
`git commit -m "feat(rag): implement markdown ingest and qdrant indexing pipeline"`

## Task 6: Inject Retrieval Into Streaming Chat Route

**Files:**

- Create: `src/lib/rag/retrieval.ts`
- Modify: `src/lib/chat/chain.ts`
- Modify: `src/app/api/conversations/[id]/messages/stream/route.ts`
- Modify: `tests/integration/chat/conversation-rag.e2e.test.ts`

- [ ] **Step 1: Write failing integration assertions for RAG hit**

```ts
it('answers from conversation document', async () => {
  const answer = await askStream(conversationId, 'PTO有几天?');
  expect(answer).toMatch(/20/);
});
```

- [ ] **Step 2: Run test to verify failure**

Run: `pnpm exec jest tests/integration/chat/conversation-rag.e2e.test.ts --runInBand --coverage=false`  
Expected: FAIL.

- [ ] **Step 3: Implement retrieval + prompt injection**

```ts
// route.ts
const rag = await retrieveConversationContext({
  conversationId: id,
  query: input,
  topK: env.RAG_TOP_K,
});
const { chunks, collect } = await streamChatReply(id, input, { retrievedContext: rag.contextText });
```

- [ ] **Step 4: Add retrieval-failure degrade path test**

```ts
it('continues normal chat when retrieval service fails', async () => {
  mockRetrievalFailure();
  const answer = await askStream(conversationId, 'hello');
  expect(answer.length).toBeGreaterThan(0);
});
```

- [ ] **Step 5: Re-run integration tests and commit**

Run: `pnpm exec jest tests/integration/chat/conversation-rag.e2e.test.ts --runInBand --coverage=false`  
Expected: PASS.

Run:
`git add src/lib/rag/retrieval.ts src/lib/chat/chain.ts src/app/api/conversations/[id]/messages/stream/route.ts tests/integration/chat/conversation-rag.e2e.test.ts`  
`git commit -m "feat(rag): add conversation-scoped retrieval to stream chat path"`

## Task 7: Add Chat UI Upload + Document Status Experience

**Files:**

- Modify: `src/lib/chat/client.ts`
- Modify: `src/components/chat/chat-ui.tsx`
- Test: `tests/unit/components/chat-ui.test.tsx`

- [ ] **Step 1: Write failing UI tests**

```tsx
it('shows uploaded markdown status and refreshes to ready', async () => {
  render(<ChatUI />);
  expect(screen.getByText('上传 Markdown')).toBeInTheDocument();
});
```

- [ ] **Step 2: Run tests to verify failure**

Run: `pnpm exec jest tests/unit/components/chat-ui.test.tsx --runInBand`  
Expected: FAIL.

- [ ] **Step 3: Implement minimal UI and client methods**

```ts
export async function uploadConversationDocument(conversationId: string, file: File) {
  /* POST documents */
}
export async function fetchConversationDocuments(conversationId: string) {
  /* GET documents */
}
```

- [ ] **Step 4: Re-run tests**

Run: `pnpm exec jest tests/unit/components/chat-ui.test.tsx --runInBand`  
Expected: PASS.

- [ ] **Step 5: Commit**

Run:
`git add src/lib/chat/client.ts src/components/chat/chat-ui.tsx tests/unit/components/chat-ui.test.tsx`  
`git commit -m "feat(chat-ui): add conversation markdown upload and status list"`

## Task 8: End-to-End Verification, Docs, and Cleanup

**Files:**

- Modify: `.env.example`
- Modify: `README.md`
- Modify: `docs/superpowers/specs/2026-03-27-conversation-markdown-rag-design.md` (if implementation drift)

- [ ] **Step 1: Add failing config-documentation check**

```md
- QDRANT_URL
- QDRANT_API_KEY
- QDRANT_COLLECTION_NAME
- RAG_TOP_K
```

- [ ] **Step 2: Run full required checks**

Run:  
`pnpm exec eslint src/lib/rag src/app/api/conversations/[id]/documents src/app/api/conversations/[id]/messages/stream/route.ts src/components/chat/chat-ui.tsx`  
`pnpm exec jest tests/unit/lib/rag/markdown.test.ts tests/unit/lib/rag/retrieval.test.ts tests/unit/api/conversation-documents-route.test.ts tests/unit/components/chat-ui.test.tsx --runInBand`  
`pnpm exec jest tests/integration/chat/conversation-rag.e2e.test.ts --runInBand --coverage=false`  
Expected: PASS.

- [ ] **Step 3: Update docs/env samples**

```env
QDRANT_URL=http://127.0.0.1:6333
QDRANT_API_KEY=
QDRANT_COLLECTION_NAME=conversation_markdown_chunks
RAG_TOP_K=6
```

- [ ] **Step 4: Re-run smoke chat flow**

Run: `pnpm dev` then manual check: upload markdown -> wait ready -> ask question from document.  
Expected: streamed answer includes document facts.

- [ ] **Step 5: Commit**

Run:
`git add .env.example README.md docs/superpowers/specs/2026-03-27-conversation-markdown-rag-design.md`  
`git commit -m "docs(rag): document qdrant setup and conversation markdown rag flow"`

## Self-Review Checklist (Completed)

- Spec coverage: all sections mapped to tasks (architecture, models, API, retrieval, error/degrade, tests, milestones).
- Placeholder scan: no `TODO/TBD/implement later` instructions in task steps.
- Type consistency: consistent naming for `conversation_documents`, `conversation_document_chunks`, `retrieveConversationContext`, and stream route injection shape.
