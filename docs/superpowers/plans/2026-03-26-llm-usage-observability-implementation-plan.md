# LLM Usage Observability Implementation Plan

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** Build an LLM call observability system that stores per-call raw records and serves day/week/total dashboards with clear error highlighting.

**Architecture:** Add a unified server-side logging wrapper, persist detail records in MySQL via Prisma, and maintain fast dashboard reads through scheduled daily/weekly/total aggregation tables. Expose dedicated stats APIs and a dashboard page with role-aware visibility for raw payload fields.

**Tech Stack:** Next.js App Router, TypeScript, Prisma + MySQL, Jest, existing UI components in `src/components/ui`.

---

## File Structure (Planned)

### Create

- `prisma/migrations/20260327090000_add_llm_observability/migration.sql`
- `src/lib/llm-observability/types.ts`
- `src/lib/llm-observability/error-classifier.ts`
- `src/lib/llm-observability/log-repo.ts`
- `src/lib/llm-observability/log-service.ts`
- `src/lib/llm-observability/aggregate-repo.ts`
- `src/lib/llm-observability/aggregate-service.ts`
- `src/lib/llm-observability/aggregate-cron.ts`
- `src/lib/llm-observability/log-service.test.ts`
- `src/lib/llm-observability/aggregate-service.test.ts`
- `src/lib/llm-observability/error-classifier.test.ts`
- `src/app/api/llm-stats/overview/route.ts`
- `src/app/api/llm-stats/trend/route.ts`
- `src/app/api/llm-stats/errors/route.ts`
- `src/app/api/llm-stats/logs/route.ts`
- `src/app/api/llm-stats/overview/route.test.ts`
- `src/app/api/llm-stats/trend/route.test.ts`
- `src/app/api/llm-stats/errors/route.test.ts`
- `src/app/api/llm-stats/logs/route.test.ts`
- `src/app/llm-observability/page.tsx`
- `src/components/llm-observability/overview-cards.tsx`
- `src/components/llm-observability/trend-charts.tsx`
- `src/components/llm-observability/error-panel.tsx`
- `src/components/llm-observability/log-table.tsx`
- `src/components/llm-observability/filter-bar.tsx`
- `src/components/llm-observability/log-details-drawer.tsx`
- `src/components/llm-observability/page.test.tsx`

### Modify

- `prisma/schema.prisma` (add models + indexes + enum-like fields)
- `src/lib/jd-agent/llm.ts` (instrument `runLLM`)
- `src/lib/jd-agent/openai-adapter.ts` (capture latency/status/header context if needed)
- `src/lib/chat/chain.ts` (instrument chat LLM path)
- `src/lib/env.ts` (add observability feature flags and aggregation watermark config)
- `src/app/layout.tsx` (add nav entry if dashboard should be directly accessible)

### Optional Docs

- `README.md` (how to run aggregation and dashboard)

---

### Task 1: Database Schema for Logs and Aggregates

**Files:**

- Modify: `prisma/schema.prisma`
- Create: `prisma/migrations/20260327090000_add_llm_observability/migration.sql`
- Test: `src/lib/llm-observability/log-service.test.ts`

- [ ] **Step 1: Write failing repository test for new tables and uniqueness**

Add a test asserting:

- insert detail log succeeds with `callId`
- duplicate `callId` fails (dedup guarantee)
- aggregate upsert path for `daily` succeeds

- [ ] **Step 2: Run the test to confirm failure**

Run: `pnpm test src/lib/llm-observability/log-service.test.ts --runInBand`  
Expected: FAIL because schema/models do not exist.

- [ ] **Step 3: Implement minimal Prisma schema changes**

Add models:

- `LlmCallLog`
- `LlmUsageStatsDaily`
- `LlmUsageStatsWeekly`
- `LlmUsageStatsTotal`

`LlmCallLog` must include (at minimum):

- `callId` (unique)
- `traceId`
- `requestId`
- `endpoint`
- `provider`
- `model`
- `requestHeaders`
- `requestPayload`
- `responsePayload`
- `inputTokens`
- `outputTokens`
- `totalTokens`
- `latencyMs`
- `httpStatus`
- `isError`
- `errorDomain`
- `errorCode`
- `providerStatus`
- `retryCount`
- `finalOutcome`
- `timestamp` (event time, UTC)
- `createdAt` (audit time)

Add indexes:

- `(timestamp)`
- `(isError, timestamp)`
- `(provider, model, timestamp)`
- `(endpoint, timestamp)`
- unique `(callId)`
- unique `(provider, requestId)` fallback when `callId` is absent

- [ ] **Step 4: Create migration SQL**

Run: `pnpm prisma migrate dev --name add_llm_observability` (or project standard migration workflow)  
Ensure SQL includes UTC-safe datetime columns and aggregate unique keys by bucket + dimensions.

- [ ] **Step 5: Re-run test and verify pass**

Run: `pnpm test src/lib/llm-observability/log-service.test.ts --runInBand`  
Expected: PASS for schema-backed insert/upsert behavior.

- [ ] **Step 6: Commit**

```bash
git add prisma/schema.prisma prisma/migrations/20260327090000_add_llm_observability/migration.sql src/lib/llm-observability/log-service.test.ts
git commit -m "feat: add llm observability schema and dedup constraints"
```

### Task 2: LLM Log Service and Error Taxonomy

**Files:**

- Create: `src/lib/llm-observability/types.ts`
- Create: `src/lib/llm-observability/error-classifier.ts`
- Create: `src/lib/llm-observability/log-repo.ts`
- Create: `src/lib/llm-observability/log-service.ts`
- Create: `src/lib/llm-observability/error-classifier.test.ts`
- Create: `src/lib/llm-observability/log-service.test.ts`

- [ ] **Step 1: Write failing tests for classification and persisted fields**

Cover:

- success call records tokens/latency/status
- timeout/rate-limit/auth/network map to stable `errorDomain` + `errorCode`
- payload fields persist as raw JSON/text

- [ ] **Step 2: Run tests to verify failure**

Run: `pnpm test src/lib/llm-observability/error-classifier.test.ts src/lib/llm-observability/log-service.test.ts --runInBand`  
Expected: FAIL due to missing implementation.

- [ ] **Step 3: Implement minimal classifier and log service**

Implement APIs:

- `classifyLlmError(error): { errorDomain, errorCode, providerStatus }`
- `recordLlmCallStart(context)`
- `recordLlmCallEnd(context, resultOrError)`

Ensure:

- event time uses wrapper `timestamp` (UTC)
- `createdAt` is audit-only
- write failure does not throw into business path

- [ ] **Step 4: Re-run tests**

Run: `pnpm test src/lib/llm-observability/error-classifier.test.ts src/lib/llm-observability/log-service.test.ts --runInBand`  
Expected: PASS.

- [ ] **Step 5: Commit**

```bash
git add src/lib/llm-observability/types.ts src/lib/llm-observability/error-classifier.ts src/lib/llm-observability/log-repo.ts src/lib/llm-observability/log-service.ts src/lib/llm-observability/error-classifier.test.ts src/lib/llm-observability/log-service.test.ts
git commit -m "feat: add llm log service with error taxonomy"
```

### Task 3: Instrument Existing LLM Call Paths

**Files:**

- Modify: `src/lib/jd-agent/llm.ts`
- Modify: `src/lib/jd-agent/openai-adapter.ts`
- Modify: `src/lib/chat/chain.ts`
- Test: `src/lib/jd-agent/llm.test.ts`

- [ ] **Step 1: Add failing tests for instrumentation side effects**

Test that each LLM path:

- generates a `callId`
- logs request/response/tokens/latency
- marks failures with `isError = true`

- [ ] **Step 2: Run targeted tests and confirm failure**

Run: `pnpm test src/lib/jd-agent/llm.test.ts --runInBand`  
Expected: FAIL for missing logging calls.

- [ ] **Step 3: Add minimal instrumentation**

Wrap each model call with:

- start timestamp
- capture request headers/payload and response payload
- collect token usage
- call `logService.recordLlmCallEnd(...)` in success and error branches

- [ ] **Step 4: Re-run tests**

Run: `pnpm test src/lib/jd-agent/llm.test.ts --runInBand`  
Expected: PASS with stable snapshots/assertions.

- [ ] **Step 5: Commit**

```bash
git add src/lib/jd-agent/llm.ts src/lib/jd-agent/openai-adapter.ts src/lib/chat/chain.ts src/lib/jd-agent/llm.test.ts
git commit -m "feat: instrument llm call paths with observability logs"
```

### Task 4: Aggregation Service (5-min + Daily/Weekly Solidification)

**Files:**

- Create: `src/lib/llm-observability/aggregate-repo.ts`
- Create: `src/lib/llm-observability/aggregate-service.ts`
- Create: `src/lib/llm-observability/aggregate-cron.ts`
- Create: `src/lib/llm-observability/aggregate-service.test.ts`
- Modify: `src/lib/env.ts`

- [ ] **Step 1: Write failing tests for bucket accuracy and idempotency**

Cover:

- 5-minute run aggregates `today + this week` with watermark `now-10m`
- daily solidification at D+1 00:05
- weekly solidification Monday 00:10
- rerun gives same result (idempotent upsert)
- delayed event for `D-1` is incorporated automatically in next cycle

- [ ] **Step 2: Run tests to verify failure**

Run: `pnpm test src/lib/llm-observability/aggregate-service.test.ts --runInBand`  
Expected: FAIL due to missing services.

- [ ] **Step 3: Implement minimal aggregation**

Implement:

- `runRealtimeAggregation(nowUtc)`
- `runDailySolidification(dateUtc)`
- `runWeeklySolidification(weekStartUtc)`
- `runBackfill(startDateUtc, endDateUtc)`

Required behavior:

- every realtime run must also idempotently recompute `D-2..D` daily buckets using UTC event time
- no manual trigger should be required for normal delayed-write correction

Use UTC storage and configurable display timezone in API layer.

- [ ] **Step 4: Re-run tests**

Run: `pnpm test src/lib/llm-observability/aggregate-service.test.ts --runInBand`  
Expected: PASS.

- [ ] **Step 5: Commit**

```bash
git add src/lib/llm-observability/aggregate-repo.ts src/lib/llm-observability/aggregate-service.ts src/lib/llm-observability/aggregate-cron.ts src/lib/llm-observability/aggregate-service.test.ts src/lib/env.ts
git commit -m "feat: add llm usage aggregation jobs and backfill"
```

### Task 5: Stats APIs (Overview, Trend, Errors, Logs)

**Files:**

- Create: `src/app/api/llm-stats/overview/route.ts`
- Create: `src/app/api/llm-stats/trend/route.ts`
- Create: `src/app/api/llm-stats/errors/route.ts`
- Create: `src/app/api/llm-stats/logs/route.ts`
- Create: `src/app/api/llm-stats/overview/route.test.ts`
- Create: `src/app/api/llm-stats/trend/route.test.ts`
- Create: `src/app/api/llm-stats/errors/route.test.ts`
- Create: `src/app/api/llm-stats/logs/route.test.ts`

- [ ] **Step 1: Write failing API contract tests**

Validate:

- query params (`timezone`, date range, provider/model, `onlyError`)
- response shape and numeric fields
- unauthorized access denied for raw payload endpoint fields

- [ ] **Step 2: Run tests and confirm failure**

Run: `pnpm test src/app/api/llm-stats --runInBand`  
Expected: FAIL because routes are missing.

- [ ] **Step 3: Implement minimal route handlers**

Rules:

- all routes read from aggregate tables except `/logs`
- `/logs` supports pagination + filters + detail expansion fields
- timezone handling defaults to `Asia/Shanghai`
- week semantics use ISO week (Monday start)

- [ ] **Step 4: Re-run tests**

Run: `pnpm test src/app/api/llm-stats --runInBand`  
Expected: PASS.

- [ ] **Step 5: Commit**

```bash
git add src/app/api/llm-stats/overview/route.ts src/app/api/llm-stats/trend/route.ts src/app/api/llm-stats/errors/route.ts src/app/api/llm-stats/logs/route.ts src/app/api/llm-stats/overview/route.test.ts src/app/api/llm-stats/trend/route.test.ts src/app/api/llm-stats/errors/route.test.ts src/app/api/llm-stats/logs/route.test.ts
git commit -m "feat: add llm stats api endpoints"
```

### Task 6: Dashboard UI with Error Highlighting and Drill-Down

**Files:**

- Create: `src/app/llm-observability/page.tsx`
- Create: `src/components/llm-observability/filter-bar.tsx`
- Create: `src/components/llm-observability/overview-cards.tsx`
- Create: `src/components/llm-observability/trend-charts.tsx`
- Create: `src/components/llm-observability/error-panel.tsx`
- Create: `src/components/llm-observability/log-table.tsx`
- Create: `src/components/llm-observability/log-details-drawer.tsx`
- Create: `src/components/llm-observability/page.test.tsx`
- Modify: `src/app/layout.tsx` (optional nav link)

- [ ] **Step 1: Write failing component/page tests**

Cover:

- top filters update request params
- today/week/total cards render
- error rows render with visual emphasis
- drawer shows request/header/response raw payload fields for authorized users

- [ ] **Step 2: Run tests and verify failure**

Run: `pnpm test src/components/llm-observability/page.test.tsx --runInBand`  
Expected: FAIL because components do not exist.

- [ ] **Step 3: Implement minimal dashboard**

Implement sections:

- filter bar
- overview cards
- trend charts (calls/tokens/errors)
- error panel
- log table + detail drawer

Keep UI simple and consistent with existing project design system.

- [ ] **Step 4: Re-run tests**

Run: `pnpm test src/components/llm-observability/page.test.tsx --runInBand`  
Expected: PASS.

- [ ] **Step 5: Commit**

```bash
git add src/app/llm-observability/page.tsx src/components/llm-observability/filter-bar.tsx src/components/llm-observability/overview-cards.tsx src/components/llm-observability/trend-charts.tsx src/components/llm-observability/error-panel.tsx src/components/llm-observability/log-table.tsx src/components/llm-observability/log-details-drawer.tsx src/components/llm-observability/page.test.tsx src/app/layout.tsx
git commit -m "feat: add llm observability dashboard page"
```

### Task 7: Security, Retention, and Operational Guardrails

**Files:**

- Modify: `src/app/api/llm-stats/logs/route.ts`
- Modify: `src/lib/llm-observability/log-service.ts`
- Modify: `src/lib/llm-observability/aggregate-cron.ts`
- Modify: `README.md`

- [ ] **Step 1: Write failing tests for authorization and payload size handling**

Validate:

- unauthorized users cannot read raw payload fields
- oversized response storage path follows policy (truncate preview/reference)
- retention cleanup job path exists and is idempotent

- [ ] **Step 2: Run tests to verify failure**

Run: `pnpm test src/app/api/llm-stats/logs/route.test.ts src/lib/llm-observability/log-service.test.ts --runInBand`  
Expected: FAIL on missing guardrails.

- [ ] **Step 3: Implement minimal guardrails**

Implement:

- role check for payload visibility
- audit logging hook for payload read access
- retention jobs config (raw payload TTL vs aggregate TTL)
- document and verify encryption-at-rest controls for DB/object storage in runbook

- [ ] **Step 4: Re-run tests**

Run: `pnpm test src/app/api/llm-stats/logs/route.test.ts src/lib/llm-observability/log-service.test.ts --runInBand`  
Expected: PASS.

- [ ] **Step 5: Commit**

```bash
git add src/app/api/llm-stats/logs/route.ts src/lib/llm-observability/log-service.ts src/lib/llm-observability/aggregate-cron.ts README.md
git commit -m "chore: add observability security and retention guardrails"
```

### Task 8: End-to-End Verification and Release Readiness

**Files:**

- Modify: `tests/integration/e2e/*` (add one observability flow test if e2e exists)
- Modify: `README.md` (runbook updates)

- [ ] **Step 1: Add failing e2e/integration test for dashboard flow**

Scenario:

- create sample logs
- run aggregation
- open dashboard
- verify cards/trends/errors/log details match seeded data

- [ ] **Step 2: Run test to confirm failure**

Run: `pnpm cypress:run --spec "tests/integration/e2e/llm-observability.cy.ts"`  
Expected: FAIL before implementation hooks.

- [ ] **Step 3: Implement minimal test fixtures/runbook updates**

Add:

- seed script or test helper for observability data
- operator commands for realtime/daily/weekly/backfill runs

- [ ] **Step 4: Full verification**

Run:

- `pnpm lint`
- `pnpm type-check`
- `pnpm test:ci`

Security acceptance checklist:

- RBAC enforcement verified on payload fields
- payload read audit trail verified
- encryption-at-rest controls verified and documented

Expected: all PASS.

- [ ] **Step 5: Commit**

```bash
git add tests/integration/e2e/llm-observability.cy.ts README.md
git commit -m "test: add llm observability end-to-end verification"
```

---

## Implementation Notes

- Keep DRY: centralize logging in `log-service`, never duplicate capture logic across call sites.
- Keep YAGNI: first release only includes day/week/total + provider/model filters.
- Use frequent commits exactly per task; do not bundle multiple tasks in one commit.
- Prefer deterministic tests over snapshot-heavy tests for numeric metrics.
- If Prisma migration naming differs locally, preserve semantic intent and update this plan file before execution.

## Skills To Use During Execution

- `@superpowers/subagent-driven-development` (recommended execution mode)
- `@superpowers/verification-before-completion` before claiming done
- `@superpowers/systematic-debugging` if any test fails unexpectedly
