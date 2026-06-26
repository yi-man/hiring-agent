# JD Publishing LangGraph Explore Implementation Plan

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** Implement the approved plan B for JD publishing: LangGraph orchestration, browser-confirmed Explore, trace/fallback flow, skill versioning, and UI-only Playwright execution.

**Architecture:** Add a `src/lib/jd-publishing/graph.ts` orchestration layer and a focused `explore.ts` authoring module. Keep `service.ts` as the API-facing wrapper, move step execution into reusable single-step helpers, and keep persistence in `publish-repo.ts`.

**Tech Stack:** Next.js App Router, TypeScript, Prisma/PostgreSQL, `@langchain/langgraph`, Playwright, Jest, Bun.

---

### Task 1: Repository And Type Support

**Files:**

- Modify: `src/lib/jd-publishing/types.ts`
- Modify: `src/lib/jd-publishing/publish-repo.ts`
- Test: `src/lib/jd-publishing/publish-repo.test.ts`

- [ ] Write failing tests for mapping `PublishSkill.meta`, creating an explored skill, and creating a next active skill version while preserving older versions.
- [ ] Run `bunx jest src/lib/jd-publishing/publish-repo.test.ts --runInBand --coverage=false` and confirm the new tests fail for missing helpers/meta.
- [ ] Add `PublishSkillMeta`, optional `onFail` for action steps, optional executor snapshot, and repository helpers.
- [ ] Re-run the repository test until it passes.

### Task 2: Single-Step Skill Execution

**Files:**

- Modify: `src/lib/jd-publishing/skill-executor.ts`
- Test: `src/lib/jd-publishing/skill-executor.test.ts`

- [ ] Write failing tests for `executePublishingStep`, including condition routing and fallback_agent failure routing.
- [ ] Run `bunx jest src/lib/jd-publishing/skill-executor.test.ts --runInBand --coverage=false` and confirm red.
- [ ] Export single-step execution while keeping `runPublishingSkill` compatible.
- [ ] Re-run the skill executor test until it passes.

### Task 3: Explore Authoring

**Files:**

- Create: `src/lib/jd-publishing/explore.ts`
- Test: `src/lib/jd-publishing/explore.test.ts`

- [ ] Write failing tests showing Explore reaches the form through browser operations and returns a boss-like `PublishSkill` with `meta.created_from = "explore"`.
- [ ] Run `bunx jest src/lib/jd-publishing/explore.test.ts --runInBand --coverage=false` and confirm red.
- [ ] Implement browser-confirmed Explore without direct API calls.
- [ ] Re-run Explore tests until green.

### Task 4: LangGraph Publishing Agent

**Files:**

- Create: `src/lib/jd-publishing/graph.ts`
- Test: `src/lib/jd-publishing/graph.test.ts`
- Modify: `src/lib/jd-publishing/service.ts`
- Test: `src/lib/jd-publishing/service.test.ts`

- [ ] Write failing graph tests for load-or-explore, step-by-step execution, fallback trace, and upgrade to version 2.
- [ ] Run graph/service tests and confirm red.
- [ ] Implement the LangGraph nodes and route functions.
- [ ] Update service to call the graph and to construct `PlaywrightBrowserExecutor` without API proxy options.
- [ ] Re-run graph/service tests until green.

### Task 5: Playwright Executor Cleanup

**Files:**

- Modify: `src/lib/jd-publishing/executors/playwright-executor.ts`
- Modify: `src/lib/jd-publishing/executors/playwright-executor.test.ts`
- Modify: `.env.example`

- [ ] Replace API proxy tests with UI-only executor tests and snapshot support.
- [ ] Remove `apiBaseUrl`, request proxy helpers, and `BOSS_LIKE_API_BASE_URL` documentation from the publishing path.
- [ ] Re-run executor tests until green.

### Task 6: Verification And PR

**Commands:**

- `bunx jest src/lib/jd-publishing/publish-repo.test.ts src/lib/jd-publishing/skill-executor.test.ts src/lib/jd-publishing/explore.test.ts src/lib/jd-publishing/graph.test.ts src/lib/jd-publishing/service.test.ts src/lib/jd-publishing/executors/playwright-executor.test.ts --runInBand --coverage=false`
- `bun run type-check`
- `bun run lint`
- `bun run test:ci -- --testPathIgnorePatterns tests/integration/chat/real-deps.e2e.test.ts`

- [ ] Start or reuse local app at `http://localhost:3000` and boss-like at `http://localhost:6183`.
- [ ] Run a headed Playwright real publish against boss-like through the hiring-agent API/UI.
- [ ] Verify the task trace in PostgreSQL and the new boss-like job row.
- [ ] Commit, push `codex/publish-jd`, and monitor PR 24 checks until green.
