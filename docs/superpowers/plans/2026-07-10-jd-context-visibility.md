# JD Context Visibility Implementation Plan

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** Add an inspectable JD context page and enforce explainable knowledge chunk selection limits.

**Architecture:** The RAG retrieval module owns selection policy and metadata. A JD context DTO module hydrates context metadata for old and new JDs. App Router route handlers expose context data, and existing JD pages link to the new context page.

**Tech Stack:** Next.js 16 App Router, React 18, TypeScript 5.7, Prisma, Jest, Bun.

## Global Constraints

- Use Bun commands.
- Preserve strict TypeScript.
- Keep changes scoped to JD context visibility and RAG selection.
- Default dev server remains port 3000.

---

### Task 1: RAG Selection Policy

**Files:**

- Modify: `src/lib/rag/knowledge-retrieval.ts`
- Modify: `src/types/jd-agent.ts`
- Test: `src/lib/rag/knowledge-retrieval.test.ts`

**Interfaces:**

- Produces `KNOWLEDGE_CONTEXT_SELECTION_POLICY`
- Produces `selection` metadata in `retrieveUserKnowledgeContext()`
- Adds optional `content`, `selectedRank`, and `reason` to context matches

- [ ] Write failing tests for max 6 chunks, max 3 documents, max 3 chunks per document, adjacent duplicate filtering, and selection metadata.
- [ ] Run the RAG tests and verify they fail before implementation.
- [ ] Implement the selection policy in `knowledge-retrieval.ts`.
- [ ] Run the RAG tests and verify they pass.

### Task 2: JD Context API DTO

**Files:**

- Create: `src/lib/jd/context.ts`
- Modify: `src/lib/rag/knowledge-repo.ts`
- Create: `src/app/api/jd/[id]/context/route.ts`
- Test: `src/app/api/jd/[id]/context/route.test.ts`

**Interfaces:**

- Produces `getJobDescriptionContext(userId: string, jobDescriptionId: string)`
- Produces `listKnowledgeDocumentChunksByIds(userId: string, chunkIds: string[])`
- API returns `{ jobDescription, context }`

- [ ] Write failing API tests for hydrated chunk contents and missing JD.
- [ ] Run the API test and verify it fails before implementation.
- [ ] Implement repository hydration, DTO normalization, and the App Router GET route.
- [ ] Run the API test and verify it passes.

### Task 3: Context Page And Links

**Files:**

- Create: `src/components/jd-generator/jd-context-view.tsx`
- Create: `src/app/jd-generator/[id]/context/page.tsx`
- Modify: `src/components/jd-generator/jd-pages.tsx`
- Modify: `src/components/jd-generator/jd-create-run-execution.tsx`
- Modify: `src/lib/jd/client.ts`

**Interfaces:**

- Produces `fetchJobDescriptionContext(id: string)`
- Produces `JDContextView`
- Adds context links from JD detail and create-run execution pages

- [ ] Write or update component tests for the visible context link if an existing test target covers it.
- [ ] Implement the context page and links.
- [ ] Run targeted tests, type-check, and lint.
