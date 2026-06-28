# JD Publishing Full Closure Implementation Plan

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** Close the JD publishing PR gaps by removing unsafe runtime defaults, preserving trace diagnostics, repairing the correct failed target, generating skills from structured DOM snapshots, and adding a real command/result transport executor.

**Architecture:** Keep `BrowserExecutor` as the graph boundary. Move boss-like target authoring into a structured DOM mapper that derives descriptors from `StructuredDomSnapshot`, and add a transport executor that translates browser method calls into `BrowserCommand` envelopes for extension or agent-browser adapters.

**Tech Stack:** TypeScript 5, Jest, Playwright, LangGraph, Prisma JSON persistence, Bun.

---

### Task 1: Regression Tests

**Files:**

- Modify: `src/lib/jd-publishing/service.test.ts`
- Modify: `src/lib/jd-publishing/executors/playwright-executor.test.ts`
- Modify: `src/lib/jd-publishing/graph.test.ts`
- Modify: `src/lib/jd-publishing/explore.test.ts`
- Create: `src/lib/jd-publishing/executors/command-transport-executor.test.ts`

- [ ] Add tests proving non-test runtime config rejects missing boss-like URL and credentials.
- [ ] Add a Playwright test proving `fill()` action errors retain the resolved `LocatorMatchReport`.
- [ ] Add a graph test proving fallback repairs `submitTarget` when `add_keywords` fails on the submit button.
- [ ] Add Explore tests proving generated targets come from the structured snapshot and every generated target is dry-run resolved.
- [ ] Add command transport executor tests proving commands are emitted and results normalize to `BrowserStepResult`.

### Task 2: Runtime Config And Trace Fixes

**Files:**

- Modify: `src/lib/jd-publishing/service.ts`
- Modify: `src/lib/jd-publishing/executors/playwright-executor.ts`
- Modify: `src/lib/jd-publishing/types.ts`
- Modify: `src/lib/jd-publishing/dom-resolver.ts`

- [ ] Require `BOSS_LIKE_BASE_URL`, `BOSS_LIKE_EMPLOYER_USERNAME`, and `BOSS_LIKE_EMPLOYER_PASSWORD` outside local/test environments.
- [ ] Preserve the resolved match report for `fill()` execution exceptions.
- [ ] Add resolver attempt metadata while keeping the existing `strategy` field for compatibility.

### Task 3: Correct Re-Explore Target Selection

**Files:**

- Modify: `src/lib/jd-publishing/graph.ts`
- Modify: `src/lib/jd-publishing/types.ts`

- [ ] Include the failed target param key in `BrowserStepResult` when target resolution or action execution fails.
- [ ] During fallback, prefer the failed `match.target` and patch `target` or `submitTarget` according to the failed key.

### Task 4: Generic Structured Explore Authoring

**Files:**

- Modify: `src/lib/jd-publishing/explore.ts`
- Modify: `src/lib/jd-publishing/skill-registry.ts`

- [ ] Generate boss-like skill descriptors from `StructuredDomSnapshot` candidates instead of fixed field/button constants.
- [ ] Dry-run every generated action target that is reachable on the current page, including login targets when login was visited.
- [ ] Keep deterministic fallback labels only as semantic business requirements, not as hardcoded selector output.

### Task 5: Command Transport Executor

**Files:**

- Create: `src/lib/jd-publishing/executors/command-transport-executor.ts`
- Modify: `src/lib/jd-publishing/types.ts`

- [ ] Add `BrowserCommandTransport` and `CommandTransportBrowserExecutor`.
- [ ] Implement `navigate`, `fill`, `click`, `waitForUrl`, `check`, `waitForText`, `addKeywords`, `snapshotStructured`, and `resolveTarget` through command/result envelopes.
- [ ] Keep graph execution unchanged by depending only on `BrowserExecutor`.

### Task 6: Verification

**Files:**

- Modify as needed under `src/lib/jd-publishing`
- Modify as needed under `tests/integration/jd-publishing`

- [ ] Run focused red/green Jest suites for changed modules.
- [ ] Run `bun run test:integration:jd-publishing`.
- [ ] Run `bun run type-check`.
- [ ] Run `bun run lint`.
- [ ] Push the branch and check PR CI; if GitHub billing still blocks jobs, report the exact blocker.
