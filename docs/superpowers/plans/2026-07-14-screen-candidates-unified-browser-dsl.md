# Unified `screen_candidates` Browser DSL Implementation Plan

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** Replace the candidate-screening custom action workflow with one versioned `screen_candidates` browser-step graph that searches each keyword, observes resumes, invokes the existing AI evaluation, then sends a greeting and collects selected candidates.

**Architecture:** Reuse the JD skill schema, graph semantics, version repository, browser executors, target resolution, and repair lifecycle. Extend the shared step executor with an `observe` primitive and a resumable runner keyed by existing `currentStepId`; candidate screening parses its observations and makes AI decisions outside the DSL. The Boss-like explorer produces one primitive graph and returns its first real search observation so that exploration never repeats that keyword.

**Tech Stack:** Next.js 16, TypeScript 5.7 strict mode, LangGraph, Jest, Playwright, Prisma/PostgreSQL, Redis, Bun.

## Global Constraints

- Use Bun and the existing `bun.lock`; do not add dependencies or alter lock files manually.
- Keep `PublishSkill` storage (`publish_skills`), `next`, `currentStepId`, target descriptors, and existing `publish_jd` APIs compatible.
- New `screen_candidates` browser-v2 steps may use only browser primitives, `condition`, and `end`; no recruiting-specific DSL action or `entrypoint` field.
- Do not add tables or Prisma migrations. Use existing Candidate, CandidateResume, CandidateScreeningResult, CandidateActionLog, CandidateScreeningRun, and run-event records.
- Browser tests use real PostgreSQL/Redis where marked and the Boss-like fixture or real page; never replace the browser workflow with adapter mocks in those tests.
- Every behavior change starts with a failing focused Jest test, then receives the smallest implementation needed to pass.

---

## File Structure

| Path                                                               | Responsibility                                                                                                                                                     |
| ------------------------------------------------------------------ | ------------------------------------------------------------------------------------------------------------------------------------------------------------------ |
| `src/lib/jd-publishing/types.ts`                                   | Neutral browser-v2 aliases, `observe` result types, and legacy-action compatibility marker.                                                                        |
| `src/lib/jd-publishing/skill-executor.ts`                          | Generic primitive dispatch, observation capture, and resumable `runBrowserWorkflow`; preserves JD wrappers.                                                        |
| `src/lib/jd-publishing/publish-repo.ts`                            | Select only active browser-v2 screening Skills while retaining generic version allocation.                                                                         |
| `src/lib/candidate-screening/workflow/types.ts`                    | Browser-v2 screening types, explorer result, and step-id constants.                                                                                                |
| `src/lib/candidate-screening/workflow/skill-registry.ts`           | Builds one primitive `screen_candidates` graph from discovered targets.                                                                                            |
| `src/lib/candidate-screening/workflow/explore.ts`                  | Learns targets, returns the first list observation, and relearns primitive targets on drift.                                                                       |
| `src/lib/candidate-screening/workflow/executor.ts`                 | Candidate orchestration over the shared runner: load/explore, search one keyword, observe one profile, contact-and-collect, repair/retry.                          |
| `src/lib/candidate-screening/adapters/boss-like.ts`                | Retains pure HTML parsing, identity/profile helpers, browser context, and legacy compatibility only; browser-v2 execution does not call its screen/action methods. |
| `src/lib/candidate-screening/runner.ts`                            | Keyword loop, durable candidate queue/events, AI decision boundary, and two-log contact/collect recovery.                                                          |
| `tests/integration/candidate-screening/screening-flow.e2e.test.ts` | Real database/browser proof of exploration, loops, AI gate, contact+collect, legacy replacement, and repair.                                                       |

## Task 1: Extend the shared DSL with a safe `observe` primitive

**Files:**

- Modify: `src/lib/jd-publishing/types.ts`
- Modify: `src/lib/jd-publishing/skill-executor.ts`
- Modify: `src/lib/jd-publishing/skill-executor.test.ts`
- Modify: `src/lib/workflows/flow.test.ts`

**Interfaces:**

- Consumes: existing `BrowserExecutor.snapshot()`, `PublishStep`, and `PublishExecutionContext`.
- Produces: `BrowserWorkflowObservation`, `BrowserWorkflowRunResult`, and `runBrowserWorkflow()`; `runPublishingSkill()` remains a compatible wrapper.

- [ ] **Step 1: Write failing tests for saved observations and arbitrary resumption.**

```ts
it('captures HTML without embedding it in the trace', async () => {
  const executor = new RecordingExecutor();
  executor.snapshot = jest.fn().mockResolvedValue('<main>candidate list</main>');
  const result = await runBrowserWorkflow({
    skill: skillWith([
      {
        id: 'observe_list',
        type: 'action',
        action: 'observe',
        params: { format: 'html', saveAs: 'listHtml' },
        next: 'done',
      },
      { id: 'done', type: 'end' },
    ]),
    currentStepId: 'observe_list',
    executor,
    context: emptyContext,
  });
  expect(result.observations).toEqual({ listHtml: '<main>candidate list</main>' });
  expect(result.traceSteps[0]?.result).toEqual({ success: true });
});

it('starts at the supplied currentStepId', async () => {
  const result = await runBrowserWorkflow({
    skill,
    currentStepId: 'fill_title',
    executor: new RecordingExecutor(),
    context: contextWithTitle,
  });
  expect(result.traceSteps.map((step) => step.stepId)).toEqual(['fill_title']);
});
```

- [ ] **Step 2: Run the focused test and verify it fails.**

Run: `bunx jest src/lib/jd-publishing/skill-executor.test.ts --runInBand --coverage=false`
Expected: FAIL because `runBrowserWorkflow` and `observe` do not exist.

- [ ] **Step 3: Add browser-v2 action types and a generic runner.**

```ts
export type BrowserWorkflowAction = BrowserAction | 'observe';
export type LegacyScreeningWorkflowAction =
  | 'ensure_login'
  | 'search_candidates'
  | 'enrich_candidate'
  | 'chat_candidate'
  | 'collect_candidate';
export type PublishSkillAction = BrowserWorkflowAction | LegacyScreeningWorkflowAction;

export type BrowserWorkflowObservation = {
  key: string;
  format: 'html';
  value: string;
};

export type BrowserWorkflowRunResult = {
  status: 'success' | 'failed' | 'fallback';
  currentStepId: string | null;
  traceSteps: PublishTraceStep[];
  observations: Record<string, string>;
  failedStep?: PublishTraceStep;
  onFail?: PublishStepOnFail;
};
```

`executePublishingStep()` must dispatch `observe` by calling `executor.snapshot()`, validate a non-empty `{ format: 'html', saveAs }`, and return the value separately from `PublishTraceStep`. `runBrowserWorkflow()` begins at `currentStepId ?? skill.steps[0]?.id`, retains the existing bounded iteration guard and condition routing, and accumulates observations. Refactor `runPublishingSkill()` to call it so JD task status and traces remain unchanged.

- [ ] **Step 4: Add backward-compatibility and flow-rendering assertions.**

```ts
expect(
  (
    await executePublishingStep({
      stepId: 'legacy',
      skill: legacySkill,
      executor,
      context: emptyContext,
    })
  ).traceStep?.result.error,
).toBe('unsupported action: search_candidates');
expect(buildWorkflowFlow(observeSkill.steps).nodes).toContainEqual(
  expect.objectContaining({ id: 'observe_list', description: 'observe' }),
);
```

- [ ] **Step 5: Run tests, type check, and commit.**

Run: `bunx jest src/lib/jd-publishing/skill-executor.test.ts src/lib/workflows/flow.test.ts --runInBand --coverage=false && bun run type-check`
Expected: PASS.

```bash
git add src/lib/jd-publishing/types.ts src/lib/jd-publishing/skill-executor.ts src/lib/jd-publishing/skill-executor.test.ts src/lib/workflows/flow.test.ts
git commit -m "feat(workflow): add resumable browser observations"
```

## Task 2: Select browser-v2 skills without affecting JD publishing

**Files:**

- Modify: `src/lib/jd-publishing/types.ts`
- Modify: `src/lib/jd-publishing/publish-repo.ts`
- Modify: `src/lib/jd-publishing/publish-repo.test.ts`

**Interfaces:**

- Consumes: `PublishSkill.meta`, `createExploredPublishSkill()`, and existing version locks.
- Produces: `BROWSER_WORKFLOW_DSL_VERSION`, `isBrowserV2Skill()`, and `getActiveBrowserV2SkillByName()`.

- [ ] **Step 1: Write failing tests for legacy exclusion and successor allocation.**

```ts
it('does not select an active legacy screen_candidates workflow', async () => {
  prismaMock.publishSkill.findFirst.mockResolvedValue(
    skillRow({ name: 'screen_candidates', version: 4, meta: { created_from: 'explore' } }),
  );
  await expect(
    getActiveBrowserV2SkillByName({ name: 'screen_candidates', platform: 'boss-like' }),
  ).resolves.toBeNull();
});

it('allocates browser-v2 v5 after legacy v4', async () => {
  prismaMock.publishSkill.findFirst.mockResolvedValueOnce(
    skillRow({
      id: 'screen-v4',
      name: 'screen_candidates',
      version: 4,
      isActive: true,
      meta: { created_from: 'explore' },
    }),
  );
  prismaMock.publishSkill.create.mockResolvedValueOnce(
    skillRow({
      id: 'screen-v5',
      name: 'screen_candidates',
      version: 5,
      isActive: true,
      meta: { dsl_version: 'browser-v2', created_from: 'explore' },
    }),
  );
  const created = await createExploredPublishSkill(browserV2ScreeningSkill());
  expect(created.version).toBe(5);
  expect(prismaMock.publishSkill.updateMany).toHaveBeenCalledWith(
    expect.objectContaining({
      data: { isActive: false },
    }),
  );
});
```

- [ ] **Step 2: Run the repository test and verify it fails.**

Run: `bunx jest src/lib/jd-publishing/publish-repo.test.ts --runInBand --coverage=false`
Expected: FAIL because browser-v2 filtering is unavailable.

- [ ] **Step 3: Add the marker and narrow lookup.**

```ts
export const BROWSER_WORKFLOW_DSL_VERSION = 'browser-v2' as const;

export function isBrowserV2Skill(skill: Pick<PublishSkill, 'meta'>): boolean {
  return skill.meta?.dsl_version === BROWSER_WORKFLOW_DSL_VERSION;
}

export async function getActiveBrowserV2SkillByName(params: {
  name: string;
  platform: PublishPlatform;
}) {
  const active = await getActivePublishSkillByName(params);
  return active && isBrowserV2Skill(active) ? active : null;
}
```

Leave `getActivePublishSkillByName()` unfiltered for JD callers and history. Browser-v2 exploration must supply `dsl_version`, allowing `createExploredPublishSkill()` to reuse its existing transaction and naturally create v5/deactivate v4.

- [ ] **Step 4: Run tests and commit.**

Run: `bunx jest src/lib/jd-publishing/publish-repo.test.ts --runInBand --coverage=false && bun run type-check`
Expected: PASS.

```bash
git add src/lib/jd-publishing/types.ts src/lib/jd-publishing/publish-repo.ts src/lib/jd-publishing/publish-repo.test.ts
git commit -m "feat(workflow): select browser v2 skills explicitly"
```

## Task 3: Build one primitive `screen_candidates` graph and return the first search result from Explore

**Files:**

- Modify: `src/lib/candidate-screening/workflow/types.ts`
- Modify: `src/lib/candidate-screening/workflow/skill-registry.ts`
- Modify: `src/lib/candidate-screening/workflow/skill-registry.test.ts`
- Modify: `src/lib/candidate-screening/workflow/explore.ts`
- Modify: `src/lib/candidate-screening/workflow/explore.test.ts`

**Interfaces:**

- Consumes: discovered `TargetDescriptor`s, `SearchPlan`, and `extractBossLikeCandidatesFromHtml()`.
- Produces: `SCREENING_STEP_IDS`, `BossLikeScreeningExploration`, and `repairBossLikeScreeningSteps()`.

- [ ] **Step 1: Write the primitive-graph expectation.**

```ts
expect(skill.steps.filter((step) => step.type === 'action').map((step) => step.action)).toEqual([
  'navigate',
  'fill',
  'fill',
  'click',
  'wait_for_url',
  'fill',
  'click',
  'wait_for_text',
  'observe',
  'navigate',
  'wait_for_text',
  'observe',
  'navigate',
  'click',
  'fill',
  'click',
  'wait_for_text',
  'click',
  'navigate',
  'click',
]);
expect(skill.meta).toMatchObject({ dsl_version: 'browser-v2', created_from: 'explore' });
expect(stepById(skill, 'contact_wait_success')).toMatchObject({
  action: 'wait_for_text',
  next: 'collect_click',
});
```

- [ ] **Step 2: Run registry/explorer tests and verify the old high-level-action expectation fails.**

Run: `bunx jest src/lib/candidate-screening/workflow/skill-registry.test.ts src/lib/candidate-screening/workflow/explore.test.ts --runInBand --coverage=false`
Expected: FAIL because the registry still emits `ensure_login/search_candidates/enrich_candidate/chat_candidate/collect_candidate`.

- [ ] **Step 3: Build all segments using template variables and single-target params.**

```ts
export const SCREENING_STEP_IDS = {
  searchOpen: 'search_open', searchFill: 'search_fill', searchObserve: 'search_observe',
  detailOpen: 'detail_open', detailObserve: 'detail_observe',
  contactOpen: 'contact_open', contactSend: 'contact_send',
  collectOpen: 'collect_open', collectClick: 'collect_click',
} as const;

{ id: 'search_fill', type: 'action', action: 'fill',
  params: { target: targets.searchInput, value: '{{input.keyword}}' }, next: 'search_submit',
  onFail: { type: 'fallback_agent', reason: 'search input changed' } }
{ id: 'search_observe', type: 'action', action: 'observe',
  params: { format: 'html', saveAs: 'listHtml' }, next: 'search_complete' }
{ id: 'detail_open', type: 'action', action: 'navigate',
  params: { url: '{{input.profileUrl}}' }, next: 'detail_wait' }
{ id: 'contact_fill_message', type: 'action', action: 'fill',
  params: { target: targets.messageInput, value: '{{input.message}}' }, next: 'contact_send' }
```

The login condition must route both branches to `search_fill`. `contact_wait_success` routes to the shared `collect_click`; `collect_open` also routes to that same click. Attach `fallback_agent` only to target-bearing primitive steps, so repair receives an actionable target.

- [ ] **Step 4: Return and test the first actual search observation.**

```ts
export type BossLikeScreeningExploration = {
  skill: ScreeningWorkflowSkill;
  firstKeyword: string;
  firstListHtml: string;
};

const explored = await exploreBossLikeScreeningWorkflow({
  executor,
  baseUrl,
  credentials,
  searchPlan,
});
expect(explored?.firstKeyword).toBe('Java');
expect(explored?.firstListHtml).toContain('data-candidate-id');
expect(executor.calls.filter((call) => call === 'click:搜索')).toHaveLength(1);
```

The explorer may log in, search once, open one profile, and open the composer to learn targets. It must not fill/send a greeting or click collect. Update repair mapping from old action IDs to primitive IDs; a composer failure returns patches for greeting, message input, and send from the same relearned context.

- [ ] **Step 5: Run focused tests and commit.**

Run: `bunx jest src/lib/candidate-screening/workflow/skill-registry.test.ts src/lib/candidate-screening/workflow/explore.test.ts --runInBand --coverage=false && bun run type-check`
Expected: PASS.

```bash
git add src/lib/candidate-screening/workflow/types.ts src/lib/candidate-screening/workflow/skill-registry.ts src/lib/candidate-screening/workflow/skill-registry.test.ts src/lib/candidate-screening/workflow/explore.ts src/lib/candidate-screening/workflow/explore.test.ts
git commit -m "feat(candidate-screening): explore primitive browser workflow"
```

## Task 4: Run screening segments through the shared runner instead of adapter actions

**Files:**

- Modify: `src/lib/candidate-screening/workflow/executor.ts`
- Modify: `src/lib/candidate-screening/workflow/executor.test.ts`
- Modify: `src/lib/candidate-screening/adapters/types.ts`
- Modify: `src/lib/candidate-screening/adapters/boss-like.ts`
- Modify: `src/lib/candidate-screening/adapters/boss-like.test.ts`

**Interfaces:**

- Consumes: `runBrowserWorkflow()`, browser-v2 lookup, observations, and pure Boss-like HTML parsing.
- Produces: `runSearchKeyword()`, `observeCandidateProfile()`, `contactAndCollectCandidate()`, and `collectCandidate()`.

- [ ] **Step 1: Write a failing session test proving observations, not adapter actions, supply candidate data.**

```ts
it('parses listHtml and profileHtml from shared workflow observations', async () => {
  const session = createCandidateScreeningWorkflowSession(
    makeDependencies({
      runBrowserWorkflow: jest
        .fn()
        .mockResolvedValueOnce(
          successfulRun({ listHtml: listHtmlFor('Ada', '/employer/resumes/301') }),
        )
        .mockResolvedValueOnce(
          successfulRun({ profileHtml: detailHtmlFor('Ada', '/employer/resumes/301') }),
        ),
    }),
  );
  const searched = await session.runSearchKeyword({ keyword: 'Java', maxCandidates: 5 });
  const detail = await session.observeCandidateProfile(searched.candidates[0]!);
  expect(detail.resumeText).toContain('Java');
  expect(dependencies.adapter.searchCandidates).not.toHaveBeenCalled();
  expect(dependencies.adapter.enrichCandidate).not.toHaveBeenCalled();
});
```

- [ ] **Step 2: Run the test and verify it fails against the high-level session.**

Run: `bunx jest src/lib/candidate-screening/workflow/executor.test.ts --runInBand --coverage=false`
Expected: FAIL because the session invokes `adapter.searchCandidates()` and `adapter.enrichCandidate()`.

- [ ] **Step 3: Replace session high-level dispatch with segment calls.**

```ts
export type CandidateScreeningWorkflowSession = {
  loadOrExplore(params: {
    searchPlan: SearchPlan;
    stage: CandidateScreeningRunStage;
  }): Promise<ScreeningWorkflowSkill | null>;
  loadExact(params: {
    skillId: string;
    stage: CandidateScreeningRunStage;
  }): Promise<ScreeningWorkflowSkill>;
  runSearchKeyword(params: {
    keyword: string;
    maxCandidates: number;
  }): Promise<{ keyword: string; candidates: RawCandidate[] }>;
  observeCandidateProfile(candidate: RawCandidate): Promise<RawCandidate>;
  contactAndCollectCandidate(
    candidate: StoredCandidateRef,
    plan: CandidateActionPlan,
  ): Promise<ActionExecutionResult>;
  collectCandidate(candidate: StoredCandidateRef): Promise<ActionExecutionResult>;
  close(): Promise<void>;
};
```

Each call sets `currentWorkflowStep` before every primitive with the shared runner `onStep`, emits primitive-step run events, and clears the step at a terminal node. `runSearchKeyword()` consumes `firstListHtml` for the explorer's matching first keyword and otherwise begins at `search_open`. `observeCandidateProfile()` begins at `detail_open`, parses only `profileHtml`, and merges it with the list candidate. `contactAndCollectCandidate()` begins at `contact_open`; direct collection begins at `collect_open`.

Keep `BossLikeCandidateSourceAdapter` methods for Candidate Communication and legacy callers, but browser-v2 screening may only use its executor, explore context, parser, and URL normalizer.

- [ ] **Step 4: Add repair/retry regression coverage.**

```ts
it('patches greeting, message, and send then retries one failed contact segment', async () => {
  await session.contactAndCollectCandidate(candidate, plan);
  expect(createNextSkillVersion).toHaveBeenCalledTimes(1);
  expect(repairedSkill.steps).toEqual(expect.arrayContaining([
    expect.objectContaining({ id: 'contact_open_greeting', params: expect.objectContaining({ target: expect.objectContaining({ name: '开始沟通' }) } }),
    expect.objectContaining({ id: 'contact_fill_message', params: expect.objectContaining({ target: expect.objectContaining({ name: '消息' }) } }),
    expect.objectContaining({ id: 'contact_send', params: expect.objectContaining({ target: expect.objectContaining({ name: '发送' }) } }),
  ]));
  expect(runBrowserWorkflow).toHaveBeenCalledTimes(2);
});
```

Require a unique replacement from the structured snapshot before creating a successor. Persist the new `skillId/currentWorkflowStep`; retry once only, and record unresolved/second failure without aborting subsequent candidates.

- [ ] **Step 5: Run tests and commit.**

Run: `bunx jest src/lib/candidate-screening/workflow/executor.test.ts src/lib/candidate-screening/adapters/boss-like.test.ts --runInBand --coverage=false && bun run type-check`
Expected: PASS.

```bash
git add src/lib/candidate-screening/workflow/executor.ts src/lib/candidate-screening/workflow/executor.test.ts src/lib/candidate-screening/adapters/types.ts src/lib/candidate-screening/adapters/boss-like.ts src/lib/candidate-screening/adapters/boss-like.test.ts
git commit -m "refactor(candidate-screening): execute browser dsl segments"
```

## Task 5: Drive keyword loops, AI gating, and contact-plus-collect recovery in the Runner

**Files:**

- Modify: `src/lib/candidate-screening/runner.ts`
- Modify: `src/lib/candidate-screening/runner.test.ts`
- Modify: `src/lib/candidate-screening/actions.ts`
- Modify: `src/lib/candidate-screening/actions.test.ts`
- Modify: `src/lib/candidate-screening/repo.ts`
- Modify: `src/lib/candidate-screening/repo.test.ts`

**Interfaces:**

- Consumes: Task 4 session methods, existing ingestion/evaluation/result repositories, and existing action idempotency keys.
- Produces: one browser call per keyword, durable `search_keyword_completed` events, detail-before-evaluate behavior, and separate chat/collect action logs for a chat decision.

- [ ] **Step 1: Write failing tests for the loop and the AI boundary.**

```ts
it('runs one search segment per keyword and dedupes before profile observation', async () => {
  workflowSession.runSearchKeyword
    .mockResolvedValueOnce({ keyword: 'Java', candidates: [adaListCandidate, graceListCandidate] })
    .mockResolvedValueOnce({ keyword: 'PostgreSQL', candidates: [adaListCandidate] });
  await runCandidateScreening(testRun());
  expect(workflowSession.runSearchKeyword).toHaveBeenNthCalledWith(1, {
    keyword: 'Java',
    maxCandidates: 2,
  });
  expect(workflowSession.runSearchKeyword).toHaveBeenNthCalledWith(2, {
    keyword: 'PostgreSQL',
    maxCandidates: 2,
  });
  expect(workflowSession.observeCandidateProfile).toHaveBeenCalledTimes(2);
});

it('does not contact or collect an AI-rejected profile', async () => {
  evaluateCandidate.mockResolvedValue(rejectedEvaluation);
  await runCandidateScreening(executionRun());
  expect(workflowSession.contactAndCollectCandidate).not.toHaveBeenCalled();
  expect(workflowSession.collectCandidate).not.toHaveBeenCalled();
});
```

- [ ] **Step 2: Run Runner tests and verify they fail.**

Run: `bunx jest src/lib/candidate-screening/runner.test.ts --runInBand --coverage=false`
Expected: FAIL because `collectRawCandidates()` still delegates one adapter stream and the explicit detail observation boundary does not exist.

- [ ] **Step 3: Implement per-keyword calls and completed-keyword events.**

```ts
for (const keyword of uniqueSearchValues(searchPlan.keywords)) {
  if (rawCandidates.length >= request.maxCandidates) break;
  const { candidates } = await workflowSession.runSearchKeyword({
    keyword,
    maxCandidates: request.maxCandidates - rawCandidates.length,
  });
  rawCandidates.push(...candidates);
  await recordRunEvent({
    ...eventScope,
    stage: 'searching_live',
    level: 'success',
    message: 'search_keyword_completed',
    detail: {
      keyword,
      candidateCount: candidates.length,
      remaining: request.maxCandidates - rawCandidates.length,
    },
  });
}
```

Before `ingestCandidate()`, call `observeCandidateProfile()` once for each globally unique list candidate with a valid `profileUrl`. Reuse `createCandidateIdentity()` for global de-duplication and keep existing ingest/rank/evaluate nodes. On resume, omit keywords with an existing completion event; when no completion event exists, re-searching before an external action is safe.

- [ ] **Step 4: Create two idempotent action logs for an admitted chat decision.**

```ts
function plannedActionSequence(action: CandidateDecisionAction): CandidateDecisionAction[] {
  return action === 'chat' ? ['chat', 'collect'] : action === 'collect' ? ['collect'] : [];
}

for (const action of plannedActionSequence(actionPlan.action)) {
  await repo.createActionLog({
    ...baseActionLog,
    action,
    message: action === 'chat' ? actionPlan.message : null,
    status: 'planned',
    idempotencyKey: createActionIdempotencyKey({ ...keyBase, action }),
  });
}
```

The result remains `decisionAction: 'chat'`. In `contactAndCollectCandidate()` mark the chat log successful at `contact_wait_success` and the collect log successful at `collect_click`. If collection fails after a successful message, the result is failed with `interviewStage: 'contacted'`; never re-run contact. Add `claimRetryableCollectActionLog()` that atomically changes only a failed `collect` row to `running`; its resumed browser segment starts at `collect_open`.

- [ ] **Step 5: Add an exact recovery test.**

```ts
it('resumes collection without re-sending an already successful greeting', async () => {
  workflowSession.contactAndCollectCandidate.mockResolvedValueOnce({
    success: false,
    error: 'collect target missing',
    browserTrace: { chat: 'success', collect: 'failed' },
  });
  workflowSession.collectCandidate.mockResolvedValueOnce({
    success: true,
    browserTrace: { action: 'collect' },
  });
  await executeScreeningRunActions(firstAttempt());
  await executeScreeningRunActions(secondAttempt());
  expect(workflowSession.contactAndCollectCandidate).toHaveBeenCalledTimes(1);
  expect(workflowSession.collectCandidate).toHaveBeenCalledTimes(1);
  expect(chatLog.status).toBe('success');
  expect(collectLog.status).toBe('success');
});
```

- [ ] **Step 6: Run tests and commit.**

Run: `bunx jest src/lib/candidate-screening/runner.test.ts src/lib/candidate-screening/actions.test.ts src/lib/candidate-screening/repo.test.ts --runInBand --coverage=false && bun run type-check`
Expected: PASS.

```bash
git add src/lib/candidate-screening/runner.ts src/lib/candidate-screening/runner.test.ts src/lib/candidate-screening/actions.ts src/lib/candidate-screening/actions.test.ts src/lib/candidate-screening/repo.ts src/lib/candidate-screening/repo.test.ts
git commit -m "feat(candidate-screening): loop browser dsl searches and actions"
```

## Task 6: Remove browser-v2 dependence on legacy screening session actions

**Files:**

- Modify: `src/lib/candidate-screening/workflow/executor.test.ts`
- Modify: `src/lib/candidate-screening/runner.test.ts`

**Interfaces:**

- Consumes: Tasks 1–5.
- Produces: a compile-time and test-level guarantee that browser-v2 screening never invokes high-level adapter browser methods; candidate communication behavior remains unchanged.

- [ ] **Step 1: Add a session API contract test.**

```ts
it('does not expose high-level screening actions for a browser-v2 skill', async () => {
  const session = createCandidateScreeningWorkflowSession(makeBrowserV2Dependencies());
  await session.loadExact({ skillId: 'screen-v5', stage: 'searching_live' });
  expect('searchCandidates' in session).toBe(false);
  expect('enrichCandidate' in session).toBe(false);
  expect('chatCandidate' in session).toBe(false);
});
```

- [ ] **Step 2: Run the contract test and verify it fails.**

Run: `bunx jest src/lib/candidate-screening/workflow/executor.test.ts --runInBand --coverage=false`
Expected: FAIL because the old session still exposes high-level methods.

- [ ] **Step 3: Delete only obsolete session paths.**

Remove `actionStep`, `targetsForStep`, `runAction`, `runSearchCandidates`, and all normal browser-v2 calls to adapter `searchCandidates/enrichCandidate/chatCandidate/collectCandidate`. Retain adapter methods for Candidate Communication and explicit legacy compatibility. Do not modify `BossLikeCandidateCommunicationAdapter`; its existing message-reply tests are the regression guard.

- [ ] **Step 4: Run screening and communication regressions, then commit.**

Run: `bunx jest src/lib/candidate-screening/workflow/executor.test.ts src/lib/candidate-screening/runner.test.ts src/lib/candidate-communication/adapters/boss-like.test.ts --runInBand --coverage=false`
Expected: PASS.

```bash
git add src/lib/candidate-screening/workflow/executor.ts src/lib/candidate-screening/workflow/executor.test.ts src/lib/candidate-screening/runner.test.ts
git commit -m "refactor(candidate-screening): remove legacy workflow dispatch"
```

## Task 7: Prove the complete workflow with real PostgreSQL, Redis, and browser execution

**Files:**

- Modify: `tests/integration/candidate-screening/screening-flow.e2e.test.ts`
- Modify: `tests/e2e-playwright/candidate-screening.spec.ts`

**Interfaces:**

- Consumes: production Runner, `PlaywrightBrowserExecutor`, `createExploredPublishSkill`, real Prisma/Redis setup, and the Boss-like fixture.
- Produces: regression proof for primitive persistence, no duplicate first search, keyword loops, AI gate, contact+collect, legacy upgrade, and composer repair.

- [ ] **Step 1: Extend the fixture with durable request-effect observations.**

```ts
type BossLikeServer = {
  baseUrl: string;
  requests: string[];
  sentMessageIds: string[];
  collectedCandidateIds: string[];
  setSearchButtonLabel(label: string): void;
  setGreetButtonLabel(label: string): void;
  close(): Promise<void>;
};
```

The list route must preserve `?keyword=` in `requests`; the message and collect handlers append their resume id to the respective array.

- [ ] **Step 2: Write the first-run browser-v2 integration test.**

```ts
it('explores once, reuses the first keyword observation, and collects only AI-admitted candidates', async () => {
  const run = await createRunAndExecute({
    request: browserExecutionRequest,
    evaluate: evaluateAdaAsChatAndGraceAsSkip,
  });
  const storedRun = await getCandidateScreeningRun({ userId, runId: run.id });
  const skill = await prisma.publishSkill.findUniqueOrThrow({ where: { id: storedRun!.skillId! } });
  expect(skill.meta).toMatchObject({ dsl_version: 'browser-v2' });
  expect((skill.steps as Array<{ action?: string }>).map((step) => step.action)).toContain(
    'observe',
  );
  expect((skill.steps as Array<{ action?: string }>).map((step) => step.action)).not.toEqual(
    expect.arrayContaining(['search_candidates', 'chat_candidate']),
  );
  expect(
    bossLike.requests.filter((request) => request === 'GET /employer/resumes?keyword=Java'),
  ).toHaveLength(1);
  expect(bossLike.sentMessageIds).toEqual([adaResumeId]);
  expect(bossLike.collectedCandidateIds).toEqual([adaResumeId]);
  expect(bossLike.sentMessageIds).not.toContain(graceResumeId);
});
```

- [ ] **Step 3: Add exact multi-keyword, legacy-upgrade, and repair cases.**

```ts
it('runs exactly one search per keyword and opens a duplicated profile once', async () => {
  await createExploredPublishSkill(browserV2ScreeningSkill());
  await runCandidateScreening({
    runId,
    userId,
    jobDescription,
    request: browserExecutionRequest,
    dependencies: {
      buildPlan: () => ({
        searchPlan: { ...workflowSearchPlan, keywords: ['Java', 'PostgreSQL'] },
        evaluationSchema,
      }),
      evaluateCandidate: evaluateAdaAsChatAndGraceAsSkip,
    },
  });
  expect(requestsForKeyword('Java')).toHaveLength(1);
  expect(requestsForKeyword('PostgreSQL')).toHaveLength(1);
  expect(detailRequestsFor(adaResumeId)).toHaveLength(1);
});

it('replaces active legacy v4 with active browser-v2 v5 before executing', async () => {
  const legacy = await createExploredPublishSkill(buildLegacyScreeningSkill({ version: 4 }));
  const run = await createRunAndExecute({
    request: browserExecutionRequest,
    evaluate: evaluateAdaAsChatAndGraceAsSkip,
  });
  const active = await prisma.publishSkill.findFirstOrThrow({
    where: { name: 'screen_candidates', platform: 'boss-like', isActive: true },
  });
  expect(active.version).toBe(legacy.version + 1);
  expect(active.meta).toMatchObject({ dsl_version: 'browser-v2' });
  expect((await prisma.publishSkill.findUniqueOrThrow({ where: { id: legacy.id } })).isActive).toBe(
    false,
  );
});

it('relearns greeting, message, and send together and retries only once', async () => {
  bossLike.setGreetButtonLabel('开始沟通');
  const stale = await createExploredPublishSkill(
    browserV2ScreeningSkill({ version: 1, greetButton: '打招呼' }),
  );
  await createRunAndExecute({
    request: browserExecutionRequest,
    evaluate: evaluateAdaAsChatAndGraceAsSkip,
  });
  const successor = await prisma.publishSkill.findFirstOrThrow({
    where: { name: stale.name, platform: stale.platform, isActive: true },
  });
  expect(successor.version).toBe(stale.version + 1);
  expect(bossLike.sentMessageIds).toEqual([adaResumeId]);
  expect(bossLike.collectedCandidateIds).toEqual([adaResumeId]);
});
```

- [ ] **Step 4: Add rendered UI proof without a workflow-specific component.**

```ts
await page.goto(`/workflows/${skillId}`);
await expect(page.getByText('observe', { exact: true })).toBeVisible();
await expect(page.getByText('search_candidates', { exact: true })).toHaveCount(0);
await page.goto(`/jd-generator/${jobDescriptionId}/screening-runs/${runId}`);
await expect(page.getByText('search_keyword_completed')).toBeVisible();
```

- [ ] **Step 5: Run real-dependency tests and commit.**

Run: `bunx jest tests/integration/candidate-screening/screening-flow.e2e.test.ts --runInBand --coverage=false`
Expected: PASS with PostgreSQL, Redis, and Playwright Chromium configured.

Run: `bun run test:e2e:playwright:workflow`
Expected: PASS when the PostgreSQL session seed, Redis, `OPENAI_API_KEY`, and Chromium are available.

```bash
git add tests/integration/candidate-screening/screening-flow.e2e.test.ts tests/e2e-playwright/candidate-screening.spec.ts
git commit -m "test(candidate-screening): cover unified browser workflow"
```

## Task 8: Complete verification and live browser acceptance

**Files:**

- No planned file modification; this task records verification evidence for Tasks 1–7.

**Interfaces:**

- Consumes: all earlier tasks and the local Boss-like service.
- Produces: actual workflow/run/message-center links proving browser-v2 behavior.

- [ ] **Step 1: Run the complete focused suite.**

Run: `bunx jest src/lib/jd-publishing/skill-executor.test.ts src/lib/jd-publishing/publish-repo.test.ts src/lib/candidate-screening/workflow/skill-registry.test.ts src/lib/candidate-screening/workflow/explore.test.ts src/lib/candidate-screening/workflow/executor.test.ts src/lib/candidate-screening/adapters/boss-like.test.ts src/lib/candidate-screening/runner.test.ts src/lib/candidate-screening/repo.test.ts src/lib/workflows/flow.test.ts --runInBand --coverage=false`
Expected: PASS.

Run: `bun run type-check && bun run lint`
Expected: PASS.

- [ ] **Step 2: Perform the local browser acceptance run.**

Run: `bun run dev`
Expected: application serves at `http://localhost:3000` without changing the standard port.

Start an execution-mode run with at least two keywords and verify this exact evidence:

```text
Workflow detail: one screen_candidates browser-v2 graph with navigate/fill/click/wait/observe nodes.
Run timeline: one search_keyword_completed event per keyword, primitive current-step events, and AI decision events.
Boss-like detail: the admitted candidate has exactly one sent greeting and is collected.
Boss-like messages: that greeting is visible.
Rejected candidate: no message and no collection effect.
```

- [ ] **Step 3: Capture actual browser links in the final handoff.**

Use the generated run ID and skill ID, then provide links to `/workflows/<skillId>`, `/jd-generator/<jdId>/screening-runs/<runId>`, and the Boss-like message page. Do not substitute fixture IDs.

- [ ] **Step 4: Check the final diff and commit only real verification fixes.**

Run: `git diff --check && git status --short && bun run type-check && bun run lint`
Expected: no whitespace errors and PASS checks.

When this verification produces no diff, leave the branch unchanged. When it exposes a defect, return to the owning task, add its focused regression test, and use that task's exact commit scope after the fix passes.

## Plan Self-Review

- Spec coverage: Tasks 1–2 deliver generic DSL execution and legacy filtering; Tasks 3–4 create one explored primitive graph and invoke its reusable segments; Task 5 adds durable keyword queues, AI gating, contact-then-collect, and recovery; Task 7 verifies repair/versioning against real dependencies; Task 8 performs the requested live browser acceptance.
- Placeholder scan: every task contains concrete files, interfaces, test cases, commands, expected results, and commit scope.
- Type consistency: `BrowserWorkflowAction`, `BrowserWorkflowRunResult`, `runBrowserWorkflow`, `SCREENING_STEP_IDS`, `BossLikeScreeningExploration`, `runSearchKeyword`, `observeCandidateProfile`, `contactAndCollectCandidate`, and `claimRetryableCollectActionLog` are introduced before a later task consumes them.
