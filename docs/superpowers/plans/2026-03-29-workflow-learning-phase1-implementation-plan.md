# Workflow Learning Phase 1 Implementation Plan

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** Ship `/workflow-learning` with login-gated Chat-like UI, a streaming SSE API that emits structured execution events, and a LangGraph ReAct agent with at least one Playwright-based browser tool—**local dev only** for Playwright (Phase 1).

**Architecture:** Add a `src/lib/workflow-learning/` module for event types, URL allowlist, Playwright tool, and an agent runner that maps LangGraph `streamEvents` (v2) into spec-defined SSE payloads. Expose `POST /api/workflow-learning/chat` returning `text/event-stream`. Client parses `data:` JSON lines and renders a trace + final answer. Follow patterns from `src/app/chat/page.tsx` and auth from `requireAuth`.

**Tech Stack:** Next.js App Router (Node runtime route), TypeScript, Zod, `@langchain/openai`, `@langchain/core`, **`@langchain/langgraph`** (ReAct agent), **`playwright`** (programmatic Chromium; separate from `@playwright/test`), existing `@/components/ui`, Jest.

**Design spec:** `docs/superpowers/specs/2026-03-29-workflow-learning-phase1-design.md`

---

## Constants (single source — put in `src/lib/workflow-learning/constants.ts`)

| Constant                         | Value            | Purpose                                                           |
| -------------------------------- | ---------------- | ----------------------------------------------------------------- |
| `WORKFLOW_AGENT_MAX_STEPS`       | `15`             | Cap LangGraph / tool rounds per request                           |
| `WORKFLOW_PLAYWRIGHT_TIMEOUT_MS` | `30_000`         | Browser context / navigation budget                               |
| `WORKFLOW_TOOL_RESULT_MAX_CHARS` | `8_000`          | Truncate tool result text in events + UI                          |
| `WORKFLOW_SSE_HEARTBEAT_MS`      | optional `15000` | Optional comment/ping if stream idle (only if needed for proxies) |

---

## File Structure

### Create

- `src/lib/workflow-learning/constants.ts`
- `src/lib/workflow-learning/types.ts` — `WorkflowSseEvent`, discriminated union by `type`
- `src/lib/workflow-learning/sse.ts` — `formatSseData(event: WorkflowSseEvent): string` → `data: ...\n\n`
- `src/lib/workflow-learning/url-allowlist.ts` — `assertUrlAllowed(url: string): URL`
- `src/lib/workflow-learning/url-allowlist.test.ts`
- `src/lib/workflow-learning/tools/browser-snapshot-tool.ts` — `DynamicStructuredTool` or `tool()` from `@langchain/core` + Zod: input `{ url: string }`, output `{ title: string; excerpt: string }`
- `src/lib/workflow-learning/agent-runner.ts` — builds `ChatOpenAI`, `createReactAgent`, runs `streamEvents`, yields `WorkflowSseEvent`
- `src/lib/workflow-learning/agent-runner.test.ts` — mock model/tools or snapshot event mapping (no real browser)
- `src/lib/workflow-learning/client.ts` — `streamWorkflowLearningMessage(message: string): Promise<ReadableStream<Uint8Array>>` calling `/api/workflow-learning/chat`
- `src/lib/workflow-learning/parse-sse.ts` — incremental parser: `Uint8Array` chunks → `WorkflowSseEvent[]` callback (or async iterator)
- `src/lib/workflow-learning/parse-sse.test.ts`
- `src/app/api/workflow-learning/chat/route.ts` — `POST`, `requireAuth`, SSE body
- `src/components/workflow-learning/workflow-learning-chat.tsx` — client component: messages, trace cards, input disabled while `runId` in progress
- `src/app/workflow-learning/page.tsx` — mirror `chat/page.tsx` session gate
- `tests/unit/workflow-learning/` — as needed for parser/allowlist

### Modify

- `package.json` / lockfile — add `@langchain/langgraph`, `playwright` (runtime browser automation)
- `src/app/layout.tsx` — nav entry: `{ name: 'Workflow', href: '/workflow-learning' }` (or Chinese label per product preference)
- `AGENTS.md` — one bullet: local Playwright for this feature + `pnpm exec playwright install chromium` (or document under README)

### Do not modify (Phase 1)

- `src/app/api/chat/route.ts`, `src/components/chat/chat-ui.tsx` — keep recruitment chat stable

---

### Task 1: Dependencies and Node runtime

**Files:**

- Modify: `package.json`
- Create: `src/lib/workflow-learning/constants.ts`

- [ ] **Step 1: Add packages**

Run:

```bash
cd /path/to/hiring-agent && pnpm add @langchain/langgraph playwright
```

Expected: `package.json` lists `@langchain/langgraph` and `playwright`; `pnpm-lock.yaml` updates.

- [ ] **Step 2: Add constants file**

Create `src/lib/workflow-learning/constants.ts`:

```ts
export const WORKFLOW_AGENT_MAX_STEPS = 15;
export const WORKFLOW_PLAYWRIGHT_TIMEOUT_MS = 30_000;
export const WORKFLOW_TOOL_RESULT_MAX_CHARS = 8_000;
```

- [ ] **Step 3: Commit**

```bash
git add package.json pnpm-lock.yaml src/lib/workflow-learning/constants.ts
git commit -m "chore: add langgraph and playwright for workflow-learning"
```

---

### Task 2: Event types and SSE formatting

**Files:**

- Create: `src/lib/workflow-learning/types.ts`
- Create: `src/lib/workflow-learning/sse.ts`

- [ ] **Step 1: Define `WorkflowSseEvent` union**

In `types.ts`, mirror the design spec §5.2 (`run_start`, `tool_call_start`, `tool_call_result`, `assistant_final`, `error`, `run_end`, …). Each variant includes:

- `type: string`
- `timestamp: string` (ISO-8601)
- `runId: string` (uuid per user message)

Use narrow types for tool payloads, e.g. `tool_call_start` has `toolName: string`, `argsPreview: string`.

- [ ] **Step 2: Implement `formatSseData`**

In `sse.ts`:

```ts
import type { WorkflowSseEvent } from './types';

export function formatSseData(event: WorkflowSseEvent): string {
  return `data: ${JSON.stringify(event)}\n\n`;
}
```

- [ ] **Step 3: Commit**

```bash
git add src/lib/workflow-learning/types.ts src/lib/workflow-learning/sse.ts
git commit -m "feat(workflow-learning): add SSE event types and formatter"
```

---

### Task 3: URL allowlist (TDD)

**Files:**

- Create: `src/lib/workflow-learning/url-allowlist.ts`
- Create: `src/lib/workflow-learning/url-allowlist.test.ts`

- [ ] **Step 1: Write failing tests**

`url-allowlist.test.ts`:

```ts
import { assertUrlAllowed } from './url-allowlist';

describe('assertUrlAllowed', () => {
  it('allows http://127.0.0.1:3000/api/health', () => {
    expect(() => assertUrlAllowed('http://127.0.0.1:3000/api/health')).not.toThrow();
  });

  it('rejects https://evil.example.com', () => {
    expect(() => assertUrlAllowed('https://evil.example.com')).toThrow();
  });
});
```

Set `process.env.NEXT_PUBLIC_APP_URL = 'http://localhost:3000'` in `beforeEach` if implementation parses allowlist from env.

Run: `pnpm exec jest src/lib/workflow-learning/url-allowlist.test.ts --runInBand`  
Expected: FAIL (module missing).

- [ ] **Step 2: Implement `assertUrlAllowed`**

Rules:

- Parse with `new URL(input)`; only `http:` and `https:`.
- Allowed hostnames: `localhost`, `127.0.0.1`, and—if `process.env.NEXT_PUBLIC_APP_URL` is set—the hostname of that URL.
- Reject credentials in `userinfo`, reject non-default ports if you want stricter policy (optional: document in code comment).

- [ ] **Step 3: Run tests**

Run: `pnpm exec jest src/lib/workflow-learning/url-allowlist.test.ts --runInBand`  
Expected: PASS.

- [ ] **Step 4: Commit**

```bash
git add src/lib/workflow-learning/url-allowlist.ts src/lib/workflow-learning/url-allowlist.test.ts
git commit -m "feat(workflow-learning): URL allowlist for browser tool"
```

---

### Task 4: Playwright browser snapshot tool

**Files:**

- Create: `src/lib/workflow-learning/tools/browser-snapshot-tool.ts`

- [ ] **Step 1: Implement tool function**

Export async function `runBrowserSnapshot(url: string): Promise<{ title: string; excerpt: string }>`:

1. Call `assertUrlAllowed(url)`.
2. `import { chromium } from 'playwright'`.
3. `const browser = await chromium.launch({ headless: true });` then `newContext` + `newPage`, `page.goto(url, { timeout: WORKFLOW_PLAYWRIGHT_TIMEOUT_MS, waitUntil: 'domcontentloaded' })`.
4. `title = await page.title()`.
5. `excerpt`: `innerText` of `body` sliced to `WORKFLOW_TOOL_RESULT_MAX_CHARS`.
6. `browser.close()` in `finally`.

- [ ] **Step 2: Wrap as LangChain `tool`**

Use `tool()` from `@langchain/core/tools` with Zod schema `{ url: z.string().url() }`, description instructing the model to pass **allowlisted** URLs only.

- [ ] **Step 3: Commit**

```bash
git add src/lib/workflow-learning/tools/browser-snapshot-tool.ts
git commit -m "feat(workflow-learning): Playwright snapshot tool"
```

---

### Task 5: Agent runner + streamEvents → WorkflowSseEvent

**Files:**

- Create: `src/lib/workflow-learning/agent-runner.ts`
- Create: `src/lib/workflow-learning/agent-runner.test.ts`

- [ ] **Step 1: Implement runner**

In `agent-runner.ts`:

1. `import { ChatOpenAI } from '@langchain/openai'`.
2. `import { createReactAgent } from '@langchain/langgraph/prebuilt'` (verify import path for installed version).
3. Build model with same env pattern as `src/app/api/chat/route.ts` (`OPENAI_API_KEY`, `OPENAI_BASE_URL`, `OPENAI_MODEL`).
4. `createReactAgent({ llm: model, tools: [browserSnapshotTool] })`.
5. Export async generator or async function `runWorkflowAgentWithEvents({ runId, userText }: { runId: string; userText: string }): AsyncIterable<WorkflowSseEvent>` that:
   - Yields `{ type: 'run_start', runId, timestamp }`.
   - Uses `agent.streamEvents({ messages: [{ role: 'user', content: userText }] }, { version: 'v2', recursionLimit: WORKFLOW_AGENT_MAX_STEPS })` (adjust API to match installed `@langchain/langgraph` docs).
   - Maps LangGraph events to `tool_call_start` / `tool_call_result` / `assistant_final` (on final AI message).
   - On success yields `run_end`; on thrown error yields `error` then `run_end`.

**Note:** If `thought`/`plan` events are not available from the stream, document in a code comment (per design spec §5.3).

- [ ] **Step 2: Unit test with mocked agent path**

Prefer mocking at the boundary: export a small `mapStreamEventToWorkflowEvent` pure function if it simplifies testing; or snapshot a short list of mocked graph events.

Run: `pnpm exec jest src/lib/workflow-learning/agent-runner.test.ts --runInBand`

- [ ] **Step 3: Commit**

```bash
git add src/lib/workflow-learning/agent-runner.ts src/lib/workflow-learning/agent-runner.test.ts
git commit -m "feat(workflow-learning): ReAct agent runner with SSE event mapping"
```

---

### Task 6: POST `/api/workflow-learning/chat` (SSE)

**Files:**

- Create: `src/app/api/workflow-learning/chat/route.ts`

- [ ] **Step 1: Implement route**

```ts
export const runtime = 'nodejs';
// export const maxDuration = 120; // optional on Vercel; local dev ignores

import { NextResponse } from 'next/server';
import { requireAuth, UnauthorizedError } from '@/lib/auth/session';
import { randomUUID } from 'crypto';
import { formatSseData } from '@/lib/workflow-learning/sse';
import { runWorkflowAgentWithEvents } from '@/lib/workflow-learning/agent-runner';
```

- `POST`: `requireAuth()`, parse `{ message?: string }`, 400 if empty.
- `runId = randomUUID()`.
- Return `new Response(ReadableStream, { headers: { 'Content-Type': 'text/event-stream; charset=utf-8', 'Cache-Control': 'no-cache', Connection: 'keep-alive' } })`.
- In stream `start`, iterate `runWorkflowAgentWithEvents`, `controller.enqueue(encoder.encode(formatSseData(e)))`, `controller.close()` in `finally`.
- Map `UnauthorizedError` to JSON 401 (non-stream).

- [ ] **Step 2: Manual curl test (local)**

With app running and session cookie (or skip if using browser):

```bash
curl -N -X POST http://localhost:3000/api/workflow-learning/chat \
  -H "Content-Type: application/json" \
  -d '{"message":"打开 http://127.0.0.1:3000/api/health 并总结"}' \
  --cookie "your-session=..."
```

Expected: `data: {...}` lines.

- [ ] **Step 3: Commit**

```bash
git add src/app/api/workflow-learning/chat/route.ts
git commit -m "feat(api): SSE workflow-learning chat route"
```

---

### Task 7: Client stream + SSE parser

**Files:**

- Create: `src/lib/workflow-learning/parse-sse.ts`
- Create: `src/lib/workflow-learning/parse-sse.test.ts`
- Create: `src/lib/workflow-learning/client.ts`

- [ ] **Step 1: Parser tests**

Feed a string:

```
data: {"type":"run_start","runId":"r1","timestamp":"..."}

data: {"type":"run_end","runId":"r1","timestamp":"..."}

```

Assert two parsed events (use `JSON.parse` on each `data:` line).

- [ ] **Step 2: Implement `client.ts`**

`streamWorkflowLearningMessage(message: string)`:

- `fetch('/api/workflow-learning/chat', { method: 'POST', headers: { 'Content-Type': 'application/json' }, body: JSON.stringify({ message }), credentials: 'same-origin' })`.
- Throw if `!res.ok` with body text.
- Return `res.body` as `ReadableStream<Uint8Array>`.

- [ ] **Step 3: Commit**

```bash
git add src/lib/workflow-learning/parse-sse.ts src/lib/workflow-learning/parse-sse.test.ts src/lib/workflow-learning/client.ts
git commit -m "feat(workflow-learning): client fetch and SSE parser"
```

---

### Task 8: UI — `WorkflowLearningChat`

**Files:**

- Create: `src/components/workflow-learning/workflow-learning-chat.tsx`

- [ ] **Step 1: State model**

- `messages`: array of `{ id, role: 'user'|'assistant', content?, traceEvents?: WorkflowSseEvent[], finalText?: string }`.
- On send: append user message; append assistant placeholder with `traceEvents: []`; set `isRunning true`.
- Read `stream` with `ReadableStreamDefaultReader`, decode UTF-8, buffer incomplete lines, on each full `data:` JSON push to last assistant `traceEvents` and update `finalText` on `assistant_final`.

- [ ] **Step 2: Render**

- User bubble: plain text.
- Assistant: **Trace panel** — list `tool_call_start` / `tool_call_result` as cards (status, duration if present).
- Below trace: **final answer** from `assistant_final.content` or similar field you defined in `types.ts`.
- Disable input + button while `isRunning`; show “执行中…”.

- [ ] **Step 3: Commit**

```bash
git add src/components/workflow-learning/workflow-learning-chat.tsx
git commit -m "feat(ui): workflow-learning chat with execution trace"
```

---

### Task 9: Page + nav

**Files:**

- Create: `src/app/workflow-learning/page.tsx`
- Modify: `src/app/layout.tsx`

- [ ] **Step 1: Page**

Copy structure from `src/app/chat/page.tsx`: `getServerAuthSession`, title “Workflow Learning”, subtitle referencing Phase 1 / Playwright / local dev.

- [ ] **Step 2: Nav**

Add link next to Chat in `src/app/layout.tsx`.

- [ ] **Step 3: Commit**

```bash
git add src/app/workflow-learning/page.tsx src/app/layout.tsx
git commit -m "feat(app): workflow-learning page and nav link"
```

---

### Task 10: Documentation and developer setup

**Files:**

- Modify: `AGENTS.md` or `README.md` (one short subsection)

- [ ] **Step 1: Document**

Add bullet: Workflow Learning Phase 1 requires **Chromium** via `pnpm exec playwright install` (first time); feature is **local-dev oriented**.

- [ ] **Step 2: Commit**

```bash
git add AGENTS.md
git commit -m "docs: note Playwright install for workflow-learning"
```

---

### Task 11: Verification

- [ ] **Step 1: Lint and typecheck**

Run: `pnpm lint && pnpm type-check`  
Expected: clean.

- [ ] **Step 2: Unit tests**

Run: `pnpm test:ci`  
Expected: PASS.

- [ ] **Step 3: Browser smoke (human)**

1. `pnpm dev`
2. Log in, open `/workflow-learning`
3. Send: `请使用工具打开 http://127.0.0.1:3000/api/health 并告诉我页面标题或可见文字`
4. Confirm trace shows tool start/result and final answer.

---

## Acceptance checklist (Phase 1)

- [ ] Logged-out users see login gate; logged-in users see chat UI.
- [ ] SSE stream emits `run_start`, at least one tool cycle when the model chooses the browser tool, `assistant_final`, `run_end` for a typical prompt.
- [ ] Playwright only navigates allowlisted URLs; unit tests cover allowlist.
- [ ] No change to recruitment `/api/chat` behavior.
- [ ] `pnpm test:ci` passes; Playwright browser **not** required in CI for default Jest (mock or skip real launch in tests).

---

## Risk notes

- **LangGraph API drift:** `streamEvents` / `recursionLimit` names differ by version—adjust imports against installed `@langchain/langgraph` and official LangGraph.js docs for that version.
- **First cold start:** Chromium launch can take several seconds—acceptable for Phase 1; optionally reuse browser across requests in a later phase (not required now).
- **Model refuses to call tools:** System prompt should explicitly require using the browser tool when the user asks to open a page.

---

## After this plan

Update `docs/superpowers/specs/2026-03-29-workflow-learning-phase1-design.md` §12 if implementation choices differ (e.g. event field names). Then proceed to Phase 2 plan per PRD.
