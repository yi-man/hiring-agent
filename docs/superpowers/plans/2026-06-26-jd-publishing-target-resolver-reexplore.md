# JD Publishing Target Resolver Re-Explore Implementation Plan

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** Complete the post-MVP JD publishing spec by replacing string selector execution with structured targets, deterministic DOM uniqueness reports, structured Explore snapshots, and failure re-explore repair.

**Architecture:** Add a shared DOM resolver module that both Explore and Playwright execution use. Keep `BrowserExecutor` as the graph boundary, extend it with transport-compatible command/result types and structured snapshots, and preserve legacy `locator` params only as a backward-compatible input that is normalized into `TargetDescriptor`.

**Tech Stack:** TypeScript 5 strict mode, Jest, Playwright, LangGraph, Prisma JSON persistence, Bun.

---

### Task 1: Types And Transport Boundary

**Files:**

- Modify: `src/lib/jd-publishing/types.ts`
- Test: `src/lib/jd-publishing/skill-executor.test.ts`

- [ ] **Step 1: Add a failing type-level behavior test**

Add a test named `passes structured target descriptors to browser actions` to `src/lib/jd-publishing/skill-executor.test.ts`. The test should create a `fill` step whose params contain:

```ts
target: {
  kind: 'field',
  role: 'textbox',
  name: '职位名称',
  exact: true,
  valueHint: 'title',
  scope: { kind: 'form', name: '发布职位' },
}
```

The `RecordingExecutor.fill` method should receive this object instead of the legacy locator string, and the trace params should retain the structured target after interpolation.

- [ ] **Step 2: Run the focused test and verify red**

Run:

```bash
bunx jest src/lib/jd-publishing/skill-executor.test.ts --runInBand --coverage=false
```

Expected red result: the executor receives an empty string or the TypeScript signature rejects structured targets.

- [ ] **Step 3: Extend publishing types**

Add `TargetDescriptor`, `DomCandidate`, `StructuredDomSnapshot`, `LocatorMatchReport`, `BrowserCommand`, `BrowserCommandResult`, and `BrowserTargetInput = string | TargetDescriptor` to `src/lib/jd-publishing/types.ts`. Change `BrowserStepResult.domSnapshot` to `string | StructuredDomSnapshot`, add optional `match`, and update browser methods so `fill`, `click`, and `addKeywords` accept structured targets while remaining compatible with strings.

- [ ] **Step 4: Update single-step execution**

Update `src/lib/jd-publishing/skill-executor.ts` so action params prefer `params.target` over `params.locator`, and `params.submitTarget` over `params.submitLocator`, while legacy skill params still execute.

- [ ] **Step 5: Re-run the focused test**

Run the same Jest command and expect the new structured target test plus existing legacy locator tests to pass.

### Task 2: Shared DOM Resolver

**Files:**

- Create: `src/lib/jd-publishing/dom-resolver.ts`
- Test: `src/lib/jd-publishing/dom-resolver.test.ts`

- [ ] **Step 1: Write resolver red tests**

Create tests for these behaviors:

```ts
it('resolves a unique field by stable name attribute');
it('resolves a unique button by role and accessible name');
it('resolves a field through label association');
it('resolves a field through placeholder');
it('refuses ambiguous equal-score candidates');
it('returns not_found when no candidate matches');
it('prefers a scoped form candidate over a page-level duplicate');
it('builds a structured snapshot with page state');
```

Use real Playwright pages with `headless: true` and assert each result includes `status`, `strategy`, `candidateCount`, `confidence`, and candidate evidence.

- [ ] **Step 2: Run the resolver tests and verify red**

Run:

```bash
bunx jest src/lib/jd-publishing/dom-resolver.test.ts --runInBand --coverage=false
```

Expected red result: the module does not exist.

- [ ] **Step 3: Implement deterministic resolver**

Implement `createStructuredDomSnapshot(page)`, `classifyStructuredSnapshot(snapshot)`, `targetFromLegacyLocator(locator, kind)`, and `resolveTarget(page, target, options)`. Strategy order must be stable attributes, ARIA role/name, label association, placeholder, scoped semantic proximity, safe CSS stable attrs, and XPath diagnostics only. Filter candidates for visibility, enabled state, editability for fill, scope, and expected kind. Return `ambiguous` instead of executing when multiple equal-score candidates remain.

- [ ] **Step 4: Re-run resolver tests**

Run the same resolver Jest command and expect all resolver tests to pass.

### Task 3: Playwright Executor Uses Resolver Reports

**Files:**

- Modify: `src/lib/jd-publishing/executors/playwright-executor.ts`
- Modify: `src/lib/jd-publishing/executors/playwright-executor.test.ts`

- [ ] **Step 1: Add executor red tests**

Add tests that assert:

```ts
await executor.fill(target, value);
```

returns `result.match.status === 'unique'`, ambiguous duplicate buttons fail with `error` containing `ambiguous_target`, and `snapshotStructured()` returns `pageState: 'publish_form'` for the boss-like form fixture.

- [ ] **Step 2: Run executor tests and verify red**

Run:

```bash
bunx jest src/lib/jd-publishing/executors/playwright-executor.test.ts --runInBand --coverage=false
```

Expected red result: no resolver match report or structured snapshot method exists.

- [ ] **Step 3: Wire resolver into Playwright execution**

Use `resolveTarget` in `fill`, `click`, `addKeywords`, and `waitForText`. On non-unique match, return `{ success: false, error: 'not_found_target: ...' | 'ambiguous_target: ...', domSnapshot: structuredSnapshot, match }`. On unique or high-confidence clear-margin matches, execute the chosen locator and return `{ success: true, match }`. Keep `check` compatible but avoid blind `.first()` for action execution.

- [ ] **Step 4: Re-run executor tests**

Run the same executor Jest command and expect all tests to pass.

### Task 4: Explore Generates Structured Skill DSL

**Files:**

- Modify: `src/lib/jd-publishing/explore.ts`
- Modify: `src/lib/jd-publishing/explore.test.ts`
- Modify: `src/lib/jd-publishing/skill-registry.ts`

- [ ] **Step 1: Add Explore red tests**

Add tests that assert Explore calls `snapshotStructured`, generated `fill_*`, `add_keywords`, and submit steps use `params.target` or `params.submitTarget`, and Explore refuses to persist a generated skill when any dry-run target report is `ambiguous` or `not_found`.

- [ ] **Step 2: Run Explore tests and verify red**

Run:

```bash
bunx jest src/lib/jd-publishing/explore.test.ts --runInBand --coverage=false
```

Expected red result: generated skills still use legacy locator params and no dry-run resolver reports exist.

- [ ] **Step 3: Generate structured boss-like targets**

Add a `buildBossLikeStructuredPublishSkill()` path that emits `TargetDescriptor` params for login, fields, keyword add button, submit button, and conditions. Explore should capture a structured snapshot, classify it as `publish_form`, dry-run each action target with `executor.resolveTarget` when available, and throw `explore_target_not_unique` with the failed report when any action target is not executable.

- [ ] **Step 4: Re-run Explore tests**

Run the same Explore Jest command and expect all tests to pass.

### Task 5: Fallback Re-Explore Repair

**Files:**

- Modify: `src/lib/jd-publishing/graph.ts`
- Modify: `src/lib/jd-publishing/graph.test.ts`

- [ ] **Step 1: Add graph red tests**

Add tests that assert fallback captures a structured snapshot, reruns resolver against the failed step target, creates a version N+1 whose steps patch only the failed step when the repaired target is unique, and fails with `ambiguous_target` without creating a new version when the target remains ambiguous.

- [ ] **Step 2: Run graph tests and verify red**

Run:

```bash
bunx jest src/lib/jd-publishing/graph.test.ts --runInBand --coverage=false
```

Expected red result: fallback only uses `onFail.repairSteps` and does not call resolver/snapshot hooks.

- [ ] **Step 3: Implement deterministic re-explore**

In `fallback_agent`, inspect `failedTraceStep.params.target`, call `executor.snapshotStructured` and `executor.resolveTarget` if available, and build repaired steps by cloning the current skill and replacing only the failed step's `params.target` when the report is unique. Keep `onFail.repairSteps` as a compatibility path. For ambiguous reports, finalize failed with an `ambiguous_target` diagnostic and no skill upgrade.

- [ ] **Step 4: Re-run graph tests**

Run the same graph Jest command and expect all tests to pass.

### Task 6: Integration And Regression Coverage

**Files:**

- Modify: `tests/integration/jd-publishing/publish-flow.e2e.test.ts`

- [ ] **Step 1: Add integration assertions**

Extend the real Postgres + Playwright integration test so every action trace has `result.match`, the Explore-created skill stores structured `params.target`, and the broken skill repair path proves the repaired active skill is reused successfully.

- [ ] **Step 2: Run integration test**

Run:

```bash
bun run test:integration:jd-publishing
```

Expected result: pass against real PostgreSQL and the in-test boss-like HTML server.

- [ ] **Step 3: Run focused JD publishing suite**

Run:

```bash
bunx jest src/lib/jd-publishing/dom-resolver.test.ts src/lib/jd-publishing/publish-repo.test.ts src/lib/jd-publishing/graph.test.ts src/lib/jd-publishing/service.test.ts src/lib/jd-publishing/skill-executor.test.ts src/lib/jd-publishing/explore.test.ts src/lib/jd-publishing/executors/playwright-executor.test.ts --runInBand --coverage=false
```

Expected result: all suites pass.

- [ ] **Step 4: Run project gates**

Run:

```bash
bun run type-check
bun run lint
```

Expected result: type-check passes and lint has no new errors.

### Task 7: PR Update

**Files:**

- Inspect: `git diff`
- Inspect: `gh pr view`

- [ ] **Step 1: Review diff for scope**

Run `git diff --stat` and `git diff --check`. Confirm changes are limited to JD publishing implementation, tests, and this plan.

- [ ] **Step 2: Commit and push**

Run:

```bash
git add src/lib/jd-publishing tests/integration/jd-publishing docs/superpowers/plans/2026-06-26-jd-publishing-target-resolver-reexplore.md
git commit -m "feat: add jd publishing target resolver"
git push
```

- [ ] **Step 3: Update PR and check CI**

Run:

```bash
gh pr view --json number,url,title,state
gh pr checks --json name,state,bucket,link
```

If checks are blocked by the existing account billing/spending-limit error, report that as an external CI blocker with the exact annotation.
