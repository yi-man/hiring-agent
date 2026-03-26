# Chat Memory Streaming Implementation Plan

> **For Claude:** REQUIRED SUB-SKILL: Use superpowers:executing-plans to implement this plan task-by-task.

**Goal:** Build a multi-conversation chat system with streaming responses, Redis-backed per-conversation memory (24h inactivity expiration), MySQL persistence, and LangChain standard message-history composition.

**Architecture:** The backend exposes conversation and message streaming APIs. Each user/assistant message is persisted in MySQL, while hot history is stored in Redis and managed through a LangChain `RunnableWithMessageHistory` adapter keyed by `conversationId`. The frontend supports conversation switching and incremental token rendering from a stream endpoint.

**Tech Stack:** Next.js App Router, TypeScript, LangChain (`@langchain/openai`, `@langchain/core`), MySQL, Redis, Jest, real integration tests with live LLM/MySQL/Redis.

---

### Task 1: Add environment and configuration for chat persistence

**Files:**

- Modify: `.env.example`
- Modify: `src/lib/env.ts`
- Test: `tests/unit/lib/env-chat.test.ts`

**Step 1: Write the failing test**

Add tests that assert these keys are parsed with defaults where appropriate:

- `MYSQL_URL`
- `REDIS_URL`
- `CHAT_REDIS_TTL_SECONDS` (default `86400`)
- `CHAT_HISTORY_REHYDRATE_LIMIT` (default `50`)
- `CHAT_TEST_REDIS_PREFIX` (default `chat:test`)

**Step 2: Run test to verify it fails**

Run: `pnpm test tests/unit/lib/env-chat.test.ts --runInBand`
Expected: FAIL due to missing env schema fields.

**Step 3: Write minimal implementation**

- Add chat storage env vars to `.env.example`
- Extend `src/lib/env.ts` zod schema and exports

**Step 4: Run test to verify it passes**

Run: `pnpm test tests/unit/lib/env-chat.test.ts --runInBand`
Expected: PASS

**Step 5: Commit**

Run:
`git add .env.example src/lib/env.ts tests/unit/lib/env-chat.test.ts`
`git commit -m "chore(chat): add env config for mysql redis memory ttl"`

---

### Task 2: Define chat domain types and DTO contracts

**Files:**

- Create: `src/types/chat.ts`
- Modify: `src/types/index.ts`
- Test: `tests/unit/types/chat-types.test.ts`

**Step 1: Write the failing test**

Cover type contracts:

- `Conversation`
- `Message`
- request/response DTOs for create/list/messages/stream
- role union: `system | user | assistant`

**Step 2: Run test to verify it fails**

Run: `pnpm test tests/unit/types/chat-types.test.ts --runInBand`
Expected: FAIL because symbols are missing.

**Step 3: Write minimal implementation**

- Add type definitions in `src/types/chat.ts`
- Re-export from `src/types/index.ts`

**Step 4: Run test to verify it passes**

Run: `pnpm test tests/unit/types/chat-types.test.ts --runInBand`
Expected: PASS

**Step 5: Commit**

Run:
`git add src/types/chat.ts src/types/index.ts tests/unit/types/chat-types.test.ts`
`git commit -m "feat(chat): add conversation and message domain types"`

---

### Task 3: Implement MySQL repositories for conversations and messages

**Files:**

- Create: `src/lib/chat/mysql.ts`
- Create: `src/lib/chat/repositories/conversation-repo.ts`
- Create: `src/lib/chat/repositories/message-repo.ts`
- Test: `tests/unit/lib/chat/repositories.test.ts`

**Step 1: Write the failing test**

Add unit tests for repository logic:

- create conversation payload mapping
- message sequence increment logic
- list ordering (`lastActiveAt desc`, `seq asc`)

**Step 2: Run test to verify it fails**

Run: `pnpm test tests/unit/lib/chat/repositories.test.ts --runInBand`
Expected: FAIL due to missing modules.

**Step 3: Write minimal implementation**

- Add MySQL client factory (`mysql2/promise` pool)
- Implement repositories with parameterized SQL

**Step 4: Run test to verify it passes**

Run: `pnpm test tests/unit/lib/chat/repositories.test.ts --runInBand`
Expected: PASS

**Step 5: Commit**

Run:
`git add src/lib/chat/mysql.ts src/lib/chat/repositories/* tests/unit/lib/chat/repositories.test.ts`
`git commit -m "feat(chat): add mysql repositories for conversations and messages"`

---

### Task 4: Implement Redis chat history store with TTL and rehydration hooks

**Files:**

- Create: `src/lib/chat/redis.ts`
- Create: `src/lib/chat/history/redis-chat-history.ts`
- Test: `tests/unit/lib/chat/redis-chat-history.test.ts`

**Step 1: Write the failing test**

Cover:

- key construction by `conversationId`
- append message serialization
- TTL refresh to configured seconds
- clear/read operations

**Step 2: Run test to verify it fails**

Run: `pnpm test tests/unit/lib/chat/redis-chat-history.test.ts --runInBand`
Expected: FAIL due to missing class.

**Step 3: Write minimal implementation**

- Build Redis client wrapper
- Implement history class compatible with LangChain message history expectations
- Add explicit `touchTTL()` behavior on writes

**Step 4: Run test to verify it passes**

Run: `pnpm test tests/unit/lib/chat/redis-chat-history.test.ts --runInBand`
Expected: PASS

**Step 5: Commit**

Run:
`git add src/lib/chat/redis.ts src/lib/chat/history/redis-chat-history.ts tests/unit/lib/chat/redis-chat-history.test.ts`
`git commit -m "feat(chat): add redis message history with ttl refresh"`

---

### Task 5: Build system prompt builder and LangChain chain composition

**Files:**

- Create: `src/lib/chat/prompts.ts`
- Create: `src/lib/chat/chain.ts`
- Test: `tests/unit/lib/chat/chain.test.ts`

**Step 1: Write the failing test**

Cover:

- system prompt includes personality traits (lively, sharp, inquisitive, empathetic)
- system prompt excludes expert-identity wording
- chain wiring uses `RunnableWithMessageHistory`

**Step 2: Run test to verify it fails**

Run: `pnpm test tests/unit/lib/chat/chain.test.ts --runInBand`
Expected: FAIL due to missing chain files.

**Step 3: Write minimal implementation**

- Create prompt builder
- Compose `ChatOpenAI` + message history wrapper
- Export `buildChatChain()` and `streamChatReply()`

**Step 4: Run test to verify it passes**

Run: `pnpm test tests/unit/lib/chat/chain.test.ts --runInBand`
Expected: PASS

**Step 5: Commit**

Run:
`git add src/lib/chat/prompts.ts src/lib/chat/chain.ts tests/unit/lib/chat/chain.test.ts`
`git commit -m "feat(chat): add langchain chain with message history wrapper"`

---

### Task 6: Implement conversation APIs

**Files:**

- Create: `src/app/api/conversations/route.ts`
- Create: `src/app/api/conversations/[id]/messages/route.ts`
- Test: `tests/unit/api/conversations-route.test.ts`

**Step 1: Write the failing test**

Cover handlers:

- create conversation
- list conversations
- list messages for conversation
- bad input returns 400

**Step 2: Run test to verify it fails**

Run: `pnpm test tests/unit/api/conversations-route.test.ts --runInBand`
Expected: FAIL due to missing routes.

**Step 3: Write minimal implementation**

- Implement route handlers and validation
- Wire repositories

**Step 4: Run test to verify it passes**

Run: `pnpm test tests/unit/api/conversations-route.test.ts --runInBand`
Expected: PASS

**Step 5: Commit**

Run:
`git add src/app/api/conversations src/app/api/conversations/[id]/messages tests/unit/api/conversations-route.test.ts`
`git commit -m "feat(chat): add conversation and message list apis"`

---

### Task 7: Implement streaming message endpoint with persistence lifecycle

**Files:**

- Create: `src/app/api/conversations/[id]/messages/stream/route.ts`
- Modify: `src/lib/chat/chain.ts`
- Test: `tests/unit/api/chat-stream-route.test.ts`

**Step 1: Write the failing test**

Cover:

- rejects empty content
- writes user message before invoking model
- streams assistant chunks
- writes final assistant message after stream completion

**Step 2: Run test to verify it fails**

Run: `pnpm test tests/unit/api/chat-stream-route.test.ts --runInBand`
Expected: FAIL due to missing stream route.

**Step 3: Write minimal implementation**

- Implement web stream/SSE endpoint
- Add message lifecycle hooks for MySQL + Redis updates
- Ensure `last_active_at` is updated

**Step 4: Run test to verify it passes**

Run: `pnpm test tests/unit/api/chat-stream-route.test.ts --runInBand`
Expected: PASS

**Step 5: Commit**

Run:
`git add src/app/api/conversations/[id]/messages/stream/route.ts src/lib/chat/chain.ts tests/unit/api/chat-stream-route.test.ts`
`git commit -m "feat(chat): add streaming chat endpoint with persistence lifecycle"`

---

### Task 8: Refactor frontend chat UI for multi-conversation and streaming rendering

**Files:**

- Modify: `src/components/chat/chat-ui.tsx`
- Create: `src/lib/chat/client.ts`
- Test: `tests/unit/components/chat-ui.test.tsx`

**Step 1: Write the failing test**

Cover UI behavior:

- create/select conversation
- send message updates user bubble immediately
- assistant bubble updates incrementally while streaming
- switch conversation reloads message list

**Step 2: Run test to verify it fails**

Run: `pnpm test tests/unit/components/chat-ui.test.tsx --runInBand`
Expected: FAIL with missing behavior.

**Step 3: Write minimal implementation**

- Add conversation list pane/state
- Add stream reader on fetch response body
- Render partial assistant content during stream

**Step 4: Run test to verify it passes**

Run: `pnpm test tests/unit/components/chat-ui.test.tsx --runInBand`
Expected: PASS

**Step 5: Commit**

Run:
`git add src/components/chat/chat-ui.tsx src/lib/chat/client.ts tests/unit/components/chat-ui.test.tsx`
`git commit -m "feat(chat): support multi-conversation ui and streaming rendering"`

---

### Task 9: Add real integration tests (no mocks) for end-to-end chat scenarios

**Files:**

- Create: `tests/integration/chat/real-deps.e2e.test.ts`
- Create: `tests/integration/chat/test-env.ts`
- Modify: `package.json`

**Step 1: Write the failing test**

Implement scenarios with real dependencies:

- S1 first stream path persists user+assistant
- S2 conversation isolation
- S3 memory continuity
- S4 TTL expiry and MySQL rehydration
- S5 prompt personality constraints (no expert identity phrase)

**Step 2: Run test to verify it fails**

Run: `pnpm test tests/integration/chat/real-deps.e2e.test.ts --runInBand`
Expected: FAIL initially due to missing wiring or env setup.

**Step 3: Write minimal implementation**

- Add helper to require real env vars and skip only when explicitly disabled
- Use dedicated test DB and Redis prefix cleanup utilities
- Ensure route handlers can be invoked in test runtime with real clients

**Step 4: Run test to verify it passes**

Run: `pnpm test tests/integration/chat/real-deps.e2e.test.ts --runInBand`
Expected: PASS using real LLM/MySQL/Redis

**Step 5: Commit**

Run:
`git add tests/integration/chat package.json`
`git commit -m "test(chat): add real dependency integration scenarios"`

---

### Task 10: Full verification and hardening loop

**Files:**

- Modify: `docs/plans/2026-03-26-chat-memory-streaming-design.md` (if behavior drift needs documenting)
- Modify: changed code from prior tasks only as needed

**Step 1: Run complete verification**

Run:

- `pnpm type-check`
- `pnpm lint`
- `pnpm test`
- `pnpm test tests/integration/chat/real-deps.e2e.test.ts --runInBand`

Expected: all PASS

**Step 2: Fix failures one-by-one**

For each failure:

- write/adjust failing test assertion first if needed
- apply minimal code fix
- rerun affected test
- rerun full verification set

**Step 3: Final commit**

Run:
`git add -A`
`git commit -m "feat(chat): deliver streaming multi-conversation memory with mysql redis and real integration coverage"`

**Step 4: Capture runbook notes**

Document:

- required env vars
- local startup order for MySQL/Redis
- integration test command for real deps

---

## Test Commands Reference

- Unit: `pnpm test tests/unit --runInBand`
- Chat integration (real deps): `pnpm test tests/integration/chat/real-deps.e2e.test.ts --runInBand`
- Full: `pnpm type-check && pnpm lint && pnpm test`

## Relevant Skills For Execution

- `@superpowers/executing-plans`
- `@superpowers/verification-before-completion`
- `@superpowers/requesting-code-review`

## Notes on Real Integration Policy

- Integration tests in this plan do not use mocks for LLM, MySQL, or Redis.
- Use isolated test resources only:
  - MySQL dedicated test schema/database
  - Redis `chat:test:*` keys
- Cleanup is mandatory before and after each integration run.
