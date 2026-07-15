# Candidate Screening Browser Workflow Implementation Plan

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** Make the complete `boss-like` browser portion of candidate screening a versioned, self-repairing Workflow that is explored on first use, reused on later runs, and visible from the screening execution page.

**Architecture:** Keep `candidate_screening_runs` as the task and audit record, adding nullable Workflow identity and current-step fields. Reuse the existing versioned `publish_skills` storage with a new `screen_candidates` name, but add screening-specific high-level actions and a target-aware runtime. The existing screening LangGraph remains responsible for planning, persistence, vector recall, evaluation, ranking, and action planning; the new runtime owns login, search, profile enrichment, greeting, collect, browser traces, and one-shot target repair.

**Tech Stack:** Next.js 16 App Router, React 18, TypeScript 5.7, Prisma/PostgreSQL, Redis, LangGraph, Playwright, Jest, Bun.

## Global Constraints

- Use Bun only; do not create another lockfile.
- Keep TypeScript strict and use `@/` imports for source modules.
- Keep the existing `PublishSkill` Prisma model and `publish_skills` table; do not rename either in this feature.
- Add `CandidateScreeningRun.skillId` as `skill_id` and `currentWorkflowStep` as `current_workflow_step`; both must be nullable for historical-run compatibility.
- The only supported screening platform remains `boss-like`.
- A target repair may create one new active Workflow version and retry the failed browser step exactly once; never loop indefinitely.
- Login, search, and detail-enrichment errors fail the run. Greeting/collect errors fail only that candidate action and processing continues.
- Use real PostgreSQL/Redis and the existing boss-like browser fixture for integration tests. Keep unit tests deterministic and independent of an LLM key.
- Playwright browser E2E remains on port 3100; daily development remains on port 3000.
- Follow the existing `@@map`/`@map` Prisma conventions and run Prisma migration plus `prisma generate` for schema changes.

---

## File Structure

- Modify `prisma/schema.prisma`: add nullable Workflow fields and an index to `CandidateScreeningRun`.
- Create `prisma/migrations/20260713100000_add_candidate_screening_workflow/migration.sql`: add `skill_id`, `current_workflow_step`, and the workflow index to `candidate_screening_runs`.
- Modify `src/lib/candidate-screening/repo.ts` and `src/lib/candidate-screening/repo.test.ts`: persist/map the new fields.
- Modify `src/lib/jd-publishing/types.ts`, `src/lib/jd-publishing/publish-repo.ts`, and their tests: make active-skill lookup name-aware while preserving JD publishing APIs.
- Create `src/lib/candidate-screening/workflow/types.ts`: screening action, target, trace, and execution contracts.
- Create `src/lib/candidate-screening/workflow/skill-registry.ts` and test: a declarative `screen_candidates` Workflow recipe.
- Create `src/lib/candidate-screening/workflow/explore.ts` and test: first-run target exploration and repair-target discovery.
- Create `src/lib/candidate-screening/workflow/executor.ts` and test: target-aware execution, persisted progress, repair/version upgrade, and one retry.
- Modify `src/lib/candidate-screening/adapters/types.ts`, `boss-like.ts`, `factory.ts`, and tests: accept discovered targets and expose the browser executor to the Workflow runtime without changing default behavior.
- Modify `src/lib/candidate-screening/runner.ts` and `runner.test.ts`: resolve/explore a Workflow before browser work and route all five browser actions through the runtime.
- Modify `src/components/candidate-screening/screening-run-log.tsx` and `tests/unit/components/CandidateScreening.test.tsx`: render Workflow state, exact-version link, repair information, and legacy fallback.
- Modify `tests/integration/candidate-screening/screening-flow.e2e.test.ts`: exercise first explore, active-version reuse, actual browser actions, and controlled repair against PostgreSQL/Redis.
- Modify `tests/e2e-playwright/candidate-screening.spec.ts` and `package.json`: cover the user-facing Workflow link and provide focused candidate-screening integration/E2E scripts.

---

### Task 1: Persist Workflow Identity on Candidate Screening Runs

**Files:**

- Modify: `prisma/schema.prisma:554-580`
- Create: `prisma/migrations/20260713100000_add_candidate_screening_workflow/migration.sql`
- Modify: `src/lib/candidate-screening/repo.ts:20-44,151-177,538-567,886-960`
- Test: `src/lib/candidate-screening/repo.test.ts`

**Interfaces:**

- Produces `CandidateScreeningRunDto.skillId: string | null` and `CandidateScreeningRunDto.currentWorkflowStep: string | null`.
- Produces `CreateRunParams.skillId?: string | null`, `CreateRunParams.currentWorkflowStep?: string | null`, and equivalent `UpdateRunParams` fields.
- All existing callers may omit the fields and receive `null` values.

- [ ] **Step 1: Write the failing repository mapping test**

Add a focused case beside `creates a screening run scoped to user and JD` in `src/lib/candidate-screening/repo.test.ts`:

```ts
it('persists workflow identity and current browser step on a screening run', async () => {
  prismaMock.candidateScreeningRun.create.mockResolvedValueOnce({
    id: 'run-1',
    userId: 'u1',
    jobDescriptionId: 'jd-1',
    platform: 'boss-like',
    mode: 'execution',
    status: 'pending',
    currentStage: 'searching_live',
    skillId: 'screen-candidates-v1',
    currentWorkflowStep: 'search_candidates',
    searchPlan: null,
    evaluationSchema: null,
    stats: null,
    errorMessage: null,
    startedAt: null,
    finishedAt: null,
    createdAt,
    updatedAt,
  });

  const run = await createCandidateScreeningRun({
    userId: 'u1',
    jobDescriptionId: 'jd-1',
    platform: 'boss-like',
    mode: 'execution',
    skillId: 'screen-candidates-v1',
    currentWorkflowStep: 'search_candidates',
  });

  expect(prismaMock.candidateScreeningRun.create).toHaveBeenCalledWith({
    data: expect.objectContaining({
      skillId: 'screen-candidates-v1',
      currentWorkflowStep: 'search_candidates',
    }),
  });
  expect(run).toEqual(
    expect.objectContaining({
      skillId: 'screen-candidates-v1',
      currentWorkflowStep: 'search_candidates',
    }),
  );
});
```

Also add `skillId: null` and `currentWorkflowStep: null` to existing `mockScreeningRun` fixture rows so historical mappings are explicitly covered.

- [ ] **Step 2: Run the repository test and verify RED**

Run:

```bash
bunx jest src/lib/candidate-screening/repo.test.ts --runInBand --coverage=false
```

Expected: FAIL because `CreateRunParams` and `CandidateScreeningRunDto` do not accept the new fields and/or the mapped DTO omits them.

- [ ] **Step 3: Add schema and repository support**

Add the exact fields and index to the existing Prisma model:

```prisma
  skillId             String?                      @map("skill_id")
  currentWorkflowStep String?                      @map("current_workflow_step")
```

Add the index before `@@map`:

```prisma
  @@index([skillId], map: "idx_candidate_screening_runs_skill_id")
```

Extend `CandidateScreeningRunRecord`, `CandidateScreeningRunDto`, `CreateRunParams`, and `UpdateRunParams` with matching nullable fields. Map them in `mapRun`, then apply them only when the incoming parameter is not `undefined`:

```ts
if (params.skillId !== undefined) data.skillId = params.skillId;
if (params.currentWorkflowStep !== undefined) {
  data.currentWorkflowStep = params.currentWorkflowStep;
}
```

Use the same `undefined` guard in `createCandidateScreeningRun` so omitted fields preserve historical/default behavior.

Create the exact migration file with:

```sql
ALTER TABLE "candidate_screening_runs"
ADD COLUMN "skill_id" TEXT,
ADD COLUMN "current_workflow_step" TEXT;

CREATE INDEX "idx_candidate_screening_runs_skill_id"
ON "candidate_screening_runs"("skill_id");
```

Apply the migration and regenerate the client after the schema edit:

```bash
bunx prisma migrate deploy
bun run prisma:generate
```

Confirm the SQL adds nullable `skill_id` and `current_workflow_step` columns plus `idx_candidate_screening_runs_skill_id`; do not edit an existing migration.

- [ ] **Step 4: Run the repository test and verify GREEN**

Run:

```bash
bunx jest src/lib/candidate-screening/repo.test.ts --runInBand --coverage=false
bun run type-check
```

Expected: PASS; mapped historical rows report `skillId: null` and `currentWorkflowStep: null`.

- [ ] **Step 5: Commit the persistence boundary**

```bash
git add prisma/schema.prisma prisma/migrations src/lib/candidate-screening/repo.ts src/lib/candidate-screening/repo.test.ts
git commit -m "feat(candidate-screening): persist workflow run state"
```

---

### Task 2: Generalize Active Workflow Lookup and Define the Screening Recipe

**Files:**

- Modify: `src/lib/jd-publishing/types.ts:39-95`
- Modify: `src/lib/jd-publishing/publish-repo.ts:98-170`
- Test: `src/lib/jd-publishing/publish-repo.test.ts`
- Create: `src/lib/candidate-screening/workflow/types.ts`
- Create: `src/lib/candidate-screening/workflow/skill-registry.ts`
- Test: `src/lib/candidate-screening/workflow/skill-registry.test.ts`

**Interfaces:**

- Produces `getActivePublishSkillByName(params: { name: string; platform: PublishPlatform }): Promise<PublishSkill | null>`.
- Keeps `getActivePublishSkillFromDb(platform)` as a compatibility wrapper for `{ name: 'publish_jd', platform }`.
- Produces `ScreeningWorkflowAction` and `BossLikeScreeningTargets`.
- Produces `buildBossLikeScreeningSkill(overrides?, targetOverrides?)` with name `screen_candidates`.

- [ ] **Step 1: Write failing generic lookup and workflow-recipe tests**

In `src/lib/jd-publishing/publish-repo.test.ts`, add:

```ts
it('loads the active workflow for an explicit name and platform', async () => {
  prismaMock.publishSkill.findFirst.mockResolvedValueOnce(skillRow({ name: 'screen_candidates' }));

  await getActivePublishSkillByName({ name: 'screen_candidates', platform: 'boss-like' });

  expect(prismaMock.publishSkill.findFirst).toHaveBeenCalledWith({
    where: { name: 'screen_candidates', platform: 'boss-like', isActive: true },
    orderBy: [{ version: 'desc' }, { updatedAt: 'desc' }],
  });
});
```

Create `src/lib/candidate-screening/workflow/skill-registry.test.ts` with this intent test:

```ts
it('builds a complete boss-like screening workflow', () => {
  const skill = buildBossLikeScreeningSkill();

  expect(skill).toEqual(
    expect.objectContaining({
      name: 'screen_candidates',
      platform: 'boss-like',
      version: 1,
      isActive: true,
    }),
  );
  expect(skill.steps.filter((step) => step.type === 'action').map((step) => step.action)).toEqual([
    'ensure_login',
    'search_candidates',
    'enrich_candidate',
    'chat_candidate',
    'collect_candidate',
  ]);
});
```

- [ ] **Step 2: Run tests and verify RED**

Run:

```bash
bunx jest src/lib/jd-publishing/publish-repo.test.ts src/lib/candidate-screening/workflow/skill-registry.test.ts --runInBand --coverage=false
```

Expected: FAIL because neither the generic lookup nor the screening Workflow module exists.

- [ ] **Step 3: Add shared action typing, lookup, and declarative recipe**

In `src/lib/jd-publishing/types.ts`, preserve native publishing actions and add a distinct union:

```ts
export type ScreeningWorkflowAction =
  | 'ensure_login'
  | 'search_candidates'
  | 'enrich_candidate'
  | 'chat_candidate'
  | 'collect_candidate';

export type PublishSkillAction = BrowserAction | ScreeningWorkflowAction;
```

Keep `executePublishingStep` safe by rejecting a non-`BrowserAction` with an unsupported-action result; JD publishing must never dispatch the screening actions.

Add the name-aware repository query and preserve the old API:

```ts
export async function getActivePublishSkillByName(params: {
  name: string;
  platform: PublishPlatform;
}): Promise<PublishSkill | null> {
  const row = await prisma.publishSkill.findFirst({
    where: { name: params.name, platform: params.platform, isActive: true },
    orderBy: [{ version: 'desc' }, { updatedAt: 'desc' }],
  });
  return row ? mapSkill(row) : null;
}

export function getActivePublishSkillFromDb(platform: PublishPlatform) {
  return getActivePublishSkillByName({ name: 'publish_jd', platform });
}
```

In `src/lib/candidate-screening/workflow/types.ts`, use these contracts:

```ts
export type BossLikeScreeningTargets = {
  username: TargetDescriptor;
  password: TargetDescriptor;
  loginButton: TargetDescriptor;
  searchInput: TargetDescriptor;
  searchSubmit: TargetDescriptor;
  detailContent: TargetDescriptor;
  greetButton: TargetDescriptor;
  messageInput: TargetDescriptor;
  sendButton: TargetDescriptor;
  collectButton: TargetDescriptor;
};

export type ScreeningWorkflowSkill = PublishSkill & { name: 'screen_candidates' };
```

Make `buildBossLikeScreeningSkill()` define five action steps followed by `{ id: 'done', type: 'end' }`. Each action uses `onFail: { type: 'fallback_agent', reason: '<specific browser failure>' }` and stores the required descriptors under `params.targets`. Use neutral initial descriptors such as `搜索候选人`, `搜索`, `打招呼`, `消息`, `发送`, and `收藏`, so the first explorer can replace them with discovered targets.

- [ ] **Step 4: Run tests and verify GREEN**

Run:

```bash
bunx jest src/lib/jd-publishing/publish-repo.test.ts src/lib/candidate-screening/workflow/skill-registry.test.ts --runInBand --coverage=false
bun run type-check
```

Expected: PASS; `publish_jd` lookup behavior remains covered by existing tests and `screen_candidates` renders as a normal Workflow in `published-workflows` tests.

- [ ] **Step 5: Commit reusable Workflow definitions**

```bash
git add src/lib/jd-publishing/types.ts src/lib/jd-publishing/publish-repo.ts src/lib/jd-publishing/publish-repo.test.ts src/lib/candidate-screening/workflow/types.ts src/lib/candidate-screening/workflow/skill-registry.ts src/lib/candidate-screening/workflow/skill-registry.test.ts
git commit -m "feat(workflows): add candidate screening workflow recipe"
```

---

### Task 3: Make the Boss-like Adapter Target-Aware and Explore a Complete Workflow

**Files:**

- Modify: `src/lib/candidate-screening/adapters/types.ts`
- Modify: `src/lib/candidate-screening/adapters/boss-like.ts`
- Modify: `src/lib/candidate-screening/adapters/factory.ts`
- Test: `src/lib/candidate-screening/adapters/boss-like.test.ts`
- Create: `src/lib/candidate-screening/workflow/explore.ts`
- Test: `src/lib/candidate-screening/workflow/explore.test.ts`

**Interfaces:**

- Produces optional `targets?: Partial<BossLikeScreeningTargets>` parameters for login, search, enrich, chat, and collect operations.
- Produces `getBrowserExecutor(): BrowserExecutor` on `CandidateSourceAdapter`.
- Produces `exploreBossLikeScreeningWorkflow(params): Promise<ScreeningWorkflowSkill>`.
- Explorer never sends a greeting or clicks collect.

- [ ] **Step 1: Write failing target-use and exploration tests**

Add to `boss-like.test.ts`:

```ts
it('uses discovered screening targets for search and greeting actions', async () => {
  const executor = new FakeBrowserExecutor([resumeListFixture, detailFixture]);
  const adapter = new BossLikeCandidateSourceAdapter({ executor });
  const targets = {
    searchInput: { kind: 'field', role: 'textbox', name: '人才关键词', exact: true },
    searchSubmit: { kind: 'button', role: 'button', name: '开始检索', exact: true },
    greetButton: { kind: 'button', role: 'button', name: '立即沟通', exact: true },
    messageInput: { kind: 'field', role: 'textbox', name: '沟通内容', exact: true },
    sendButton: { kind: 'button', role: 'button', name: '确认发送', exact: true },
  };

  await collectAsyncBatches(
    adapter.searchCandidates(searchPlan, { maxCandidates: 1, batchSize: 1 }, { targets }),
  );
  await adapter.chatCandidate(
    { candidateId: '1', displayName: '王小明', profileUrl: '/employer/resumes/1' },
    chatPlan,
    { targets },
  );

  expect(executor.calls).toEqual(
    expect.arrayContaining([
      'fill:人才关键词:Java',
      'click:开始检索',
      'click:立即沟通',
      'fill:沟通内容:你好，我们正在招聘高级后端工程师，方便聊聊吗？',
      'click:确认发送',
    ]),
  );
});
```

Create `explore.test.ts` with a structured executor snapshot sequence and assert:

```ts
it('explores list and detail targets without sending or collecting', async () => {
  const skill = await exploreBossLikeScreeningWorkflow({
    executor,
    baseUrl,
    credentials,
    searchPlan,
  });

  expect(skill.id).toMatch(/^boss-like-screen-candidates-explore-/);
  expect(skill.steps).toEqual(
    expect.arrayContaining([
      expect.objectContaining({
        id: 'search_candidates',
        params: expect.objectContaining({
          targets: expect.objectContaining({
            searchSubmit: expect.objectContaining({ name: '搜索' }),
          }),
        }),
      }),
      expect.objectContaining({
        id: 'chat_candidate',
        params: expect.objectContaining({
          targets: expect.objectContaining({
            sendButton: expect.objectContaining({ name: '发送' }),
          }),
        }),
      }),
    ]),
  );
  expect(executor.calls).not.toEqual(expect.arrayContaining(['click:发送', 'click:收藏']));
});
```

Add a second test where no card is available and assert `exploreBossLikeScreeningWorkflow` rejects with `screening_explore_no_candidate_detail`.

- [ ] **Step 2: Run tests and verify RED**

Run:

```bash
bunx jest src/lib/candidate-screening/adapters/boss-like.test.ts src/lib/candidate-screening/workflow/explore.test.ts --runInBand --coverage=false
```

Expected: FAIL because adapter signatures do not accept targets and the explorer does not exist.

- [ ] **Step 3: Add optional target overrides and the explorer**

Use this adapter contract in `adapters/types.ts`:

```ts
export type CandidateBrowserActionOptions = {
  targets?: Partial<BossLikeScreeningTargets>;
};

export type CandidateSourceAdapter = {
  platform: CandidateScreeningPlatform;
  getBrowserExecutor(): BrowserExecutor;
  loginIfNeeded(options?: CandidateBrowserActionOptions): Promise<void>;
  searchCandidates(
    plan: SearchPlan,
    options: SearchOptions,
    workflow?: CandidateBrowserActionOptions,
  ): AsyncIterable<RawCandidateBatch>;
  enrichCandidate(
    candidate: RawCandidate,
    options?: CandidateBrowserActionOptions,
  ): Promise<RawCandidate>;
  collectCandidate(
    candidate: StoredCandidateRef,
    options?: CandidateBrowserActionOptions,
  ): Promise<ActionExecutionResult>;
  chatCandidate(
    candidate: StoredCandidateRef,
    plan: CandidateActionPlan,
    options?: CandidateBrowserActionOptions,
  ): Promise<ActionExecutionResult>;
  close(): Promise<void>;
};
```

In `BossLikeCandidateSourceAdapter`, retain the current defaults but select `options?.targets?.<key> ?? '<existing string>'` at every `fill`, `click`, and detail wait boundary. Extract the current enrichment branch into `enrichCandidate` and call it from `searchCandidates`; this lets the Workflow runtime record the detail step separately.

The explorer must:

1. navigate to the resume list and inspect the login snapshot;
2. build login, search, and action descriptors from `StructuredDomSnapshot` candidates using the same stable-attribute strategy as `jd-publishing/explore.ts`;
3. submit the first real search keyword;
4. parse the raw list snapshot with `extractBossLikeCandidatesFromHtml`, navigate to the first safe profile URL, and inspect the detail snapshot;
5. require unique search, detail, greet, message, send, and collect targets;
6. return `buildBossLikeScreeningSkill()` with discovered target overrides and `meta.created_from: 'explore'`.

Use a direct `snapshot`/`navigate` operation for exploration, not `chatCandidate` or `collectCandidate`; exploration may open the greeting composer only to inspect it and must never submit or collect.

- [ ] **Step 4: Run tests and verify GREEN**

Run:

```bash
bunx jest src/lib/candidate-screening/adapters/boss-like.test.ts src/lib/candidate-screening/workflow/explore.test.ts --runInBand --coverage=false
bun run type-check
```

Expected: PASS; default adapter tests continue using Chinese fallback targets while override tests prove the discovered descriptors are honored.

- [ ] **Step 5: Commit browser target and explorer support**

```bash
git add src/lib/candidate-screening/adapters src/lib/candidate-screening/workflow/explore.ts src/lib/candidate-screening/workflow/explore.test.ts
git commit -m "feat(candidate-screening): explore browser workflow targets"
```

---

### Task 4: Implement Workflow Execution, Repair, and Single Retry

**Files:**

- Create: `src/lib/candidate-screening/workflow/executor.ts`
- Test: `src/lib/candidate-screening/workflow/executor.test.ts`
- Modify: `src/lib/jd-publishing/publish-repo.ts` only if the active-version creation helper needs a name-aware test export
- Test: `src/lib/jd-publishing/publish-repo.test.ts`

**Interfaces:**

- Produces `CandidateScreeningWorkflowSession` with `loadOrExplore`, `searchCandidates`, `enrichCandidate`, `chatCandidate`, `collectCandidate`, and `close`.
- Produces exact event details `{ workflowStep, skillId, previousSkillId?, retry?, repair? }`.
- Uses `createExploredPublishSkill` for first exploration and `createNextActivePublishSkillVersion` for repair.

- [ ] **Step 1: Write failing runtime tests**

Create an executor test fixture with an in-memory `PublishSkill`, mocked adapter, and mocked repository. Add these behavioral tests:

```ts
it('explores once, persists v1, and runs the requested browser steps through it', async () => {
  const session = createCandidateScreeningWorkflowSession(dependencies);

  await session.loadOrExplore({ searchPlan, stage: 'searching_live' });
  await session.searchCandidates(searchPlan, { maxCandidates: 1, batchSize: 1 });

  expect(dependencies.getActiveSkill).toHaveBeenCalledWith({
    name: 'screen_candidates',
    platform: 'boss-like',
  });
  expect(dependencies.createExploredSkill).toHaveBeenCalledWith(
    expect.objectContaining({ name: 'screen_candidates', version: 1 }),
  );
  expect(dependencies.updateRun).toHaveBeenCalledWith(
    expect.objectContaining({ skillId: 'screen-v1', currentWorkflowStep: 'search_candidates' }),
  );
});

it('repairs one unique failed target, persists v2, and retries the step exactly once', async () => {
  adapter.searchCandidates
    .mockImplementationOnce(() => {
      throw browserTargetError('search_candidates', 'searchSubmit', oldTarget);
    })
    .mockImplementationOnce(() => batches({ candidates: [rawCandidate] }));
  executor.snapshotStructured.mockResolvedValue(repairedListSnapshot);
  executor.resolveTarget.mockResolvedValue(uniqueTargetReport(repairedTarget));

  await session.searchCandidates(searchPlan, { maxCandidates: 1, batchSize: 1 });

  expect(dependencies.createNextSkillVersion).toHaveBeenCalledWith(
    expect.objectContaining({
      previousSkill: expect.objectContaining({ id: 'screen-v1' }),
      meta: expect.objectContaining({
        repaired_from_skill_id: 'screen-v1',
        failed_step_id: 'search_candidates',
      }),
    }),
  );
  expect(adapter.searchCandidates).toHaveBeenCalledTimes(2);
});

it('does not repair or retry an ambiguous target failure', async () => {
  executor.resolveTarget.mockResolvedValue(ambiguousTargetReport(oldTarget));

  await expect(
    session.searchCandidates(searchPlan, { maxCandidates: 1, batchSize: 1 }),
  ).rejects.toThrow('ambiguous_target');
  expect(dependencies.createNextSkillVersion).not.toHaveBeenCalled();
  expect(adapter.searchCandidates).toHaveBeenCalledTimes(1);
});
```

- [ ] **Step 2: Run the runtime test and verify RED**

Run:

```bash
bunx jest src/lib/candidate-screening/workflow/executor.test.ts --runInBand --coverage=false
```

Expected: FAIL because the session and recovery contracts do not exist.

- [ ] **Step 3: Implement a target-aware session with bounded repair**

Implement the session with this public shape:

```ts
export type CandidateScreeningWorkflowSession = {
  skill: ScreeningWorkflowSkill | null;
  loadOrExplore(params: {
    searchPlan: SearchPlan;
    stage: CandidateScreeningRunStage;
  }): Promise<ScreeningWorkflowSkill | null>;
  searchCandidates(plan: SearchPlan, options: SearchOptions): AsyncIterable<RawCandidateBatch>;
  enrichCandidate(candidate: RawCandidate): Promise<RawCandidate>;
  chatCandidate(
    candidate: StoredCandidateRef,
    plan: CandidateActionPlan,
  ): Promise<ActionExecutionResult>;
  collectCandidate(candidate: StoredCandidateRef): Promise<ActionExecutionResult>;
};
```

For every action:

1. set `currentWorkflowStep` before calling the adapter;
2. emit an `info` run event with `workflowStep` and `skillId`;
3. call the adapter using the action step's `params.targets`;
4. clear `currentWorkflowStep` only after a successful step;
5. emit a `success` event with the browser trace/candidate context.

Wrap failed target-based calls in a typed `ScreeningWorkflowTargetError` carrying `stepId`, `targetKey`, `target`, `BrowserStepResult`, and optional candidate ID. On the first such failure only, obtain `snapshotStructured`, resolve a unique target, patch the failed action's `params.targets[targetKey]`, and call:

```ts
await createNextActivePublishSkillVersion({
  previousSkill: skill,
  steps: patchedSteps,
  meta: {
    ...skill.meta,
    repaired_from_skill_id: skill.id,
    repaired_from_version: skill.version,
    failed_step_id: failed.stepId,
    repair_reason: failed.message,
  },
});
```

Set the returned version as the session skill, update the run `skillId`, write a version-upgrade event, and invoke the same action once with `retry: true`. Let the retry exception escape unchanged. Non-target errors and non-unique reports escape without an upgrade or retry.

Do not call the generic JD `executePublishingStep` for screening actions; it correctly remains limited to native `BrowserAction` values.

- [ ] **Step 4: Run the runtime test and verify GREEN**

Run:

```bash
bunx jest src/lib/candidate-screening/workflow/executor.test.ts src/lib/jd-publishing/publish-repo.test.ts --runInBand --coverage=false
bun run type-check
```

Expected: PASS; the test proves first exploration, active-workflow reuse, unique repair to v2, a single retry, and no repair for ambiguity.

- [ ] **Step 5: Commit execution and repair behavior**

```bash
git add src/lib/candidate-screening/workflow/executor.ts src/lib/candidate-screening/workflow/executor.test.ts src/lib/jd-publishing/publish-repo.ts src/lib/jd-publishing/publish-repo.test.ts
git commit -m "feat(candidate-screening): repair workflow browser steps"
```

---

### Task 5: Route the Screening Graph and Manual Actions Through the Workflow Session

**Files:**

- Modify: `src/lib/candidate-screening/runner.ts:75-185,1025-1085,1499-1535,1805-2135`
- Test: `src/lib/candidate-screening/runner.test.ts`

**Interfaces:**

- `ScreeningRunnerDependencies` gains a factory for `CandidateScreeningWorkflowSession` so tests can inject one.
- `CandidateScreeningGraphResources` holds `{ adapter, workflowSession, latestStats }`.
- New runs set `skillId`; historical manual-action runs with `skillId === null` retain direct-adapter compatibility.

- [ ] **Step 1: Write failing runner tests**

Add these cases to `runner.test.ts` using an injected mocked session:

```ts
it('loads a screening workflow before live search and stores its skill id', async () => {
  const workflow = makeWorkflowSession({ skill: makeWorkflowSkill({ id: 'screen-v1' }) });
  const dependencies = makeDependencies();
  dependencies.createWorkflowSession = jest.fn().mockReturnValue(workflow);

  await runCandidateScreening({
    runId: 'run-1',
    userId: 'user-1',
    jobDescription,
    request,
    dependencies,
  });

  expect(workflow.loadOrExplore).toHaveBeenCalledWith(expect.objectContaining({ searchPlan }));
  expect(workflow.searchCandidates).toHaveBeenCalledWith(searchPlan, {
    maxCandidates: 20,
    batchSize: 10,
  });
  expect(dependencies.repo.updateRun).toHaveBeenCalledWith(
    expect.objectContaining({ skillId: 'screen-v1' }),
  );
});

it('uses the same workflow session for planned chat and collect actions', async () => {
  const workflow = makeWorkflowSession();
  // Seed one chat and one collect action through makeDependencies() results.

  await runCandidateScreening({
    runId: 'run-1',
    userId: 'user-1',
    jobDescription,
    request: { ...request, mode: 'execution' },
    dependencies,
  });

  expect(workflow.chatCandidate).toHaveBeenCalledWith(expect.any(Object), chatDecision);
  expect(workflow.collectCandidate).toHaveBeenCalledWith(expect.any(Object));
});

it('continues the run after a workflow greeting failure for one candidate', async () => {
  workflow.chatCandidate.mockResolvedValueOnce({ success: false, error: 'send button missing' });
  workflow.collectCandidate.mockResolvedValueOnce({
    success: true,
    browserTrace: { action: 'collect' },
  });

  await runCandidateScreening(/* execution request with chat then collect */);

  expect(workflow.collectCandidate).toHaveBeenCalled();
  expect(dependencies.repo.updateRun).toHaveBeenCalledWith(
    expect.objectContaining({ status: 'success' }),
  );
});
```

- [ ] **Step 2: Run the runner test and verify RED**

Run:

```bash
bunx jest src/lib/candidate-screening/runner.test.ts --runInBand --coverage=false
```

Expected: FAIL because the runner still invokes `adapter.loginIfNeeded`, `adapter.searchCandidates`, `adapter.chatCandidate`, and `adapter.collectCandidate` directly.

- [ ] **Step 3: Integrate the session without altering domain-stage semantics**

Add the factory to the dependency contract and make the default factory construct a session around the adapter, workflow repository helpers, and the existing run-event/update-run functions.

In `searchLiveNode`:

```ts
const adapter = state.dependencies.createAdapter(state.request.platform, { userId: state.userId });
resources.adapter = adapter;
const workflowSession = state.dependencies.createWorkflowSession({
  adapter,
  userId: state.userId,
  runId: state.runId,
  jobDescriptionId: state.jobDescription.id,
  platform: state.request.platform,
  repo: state.dependencies.repo,
});
resources.workflowSession = workflowSession;
const skill = await workflowSession.loadOrExplore({ searchPlan, stage: 'searching_live' });
if (skill) {
  await state.dependencies.repo.updateRun({
    userId: state.userId,
    runId: state.runId,
    skillId: skill.id,
  });
}
const rawCandidates = await collectRawCandidates({
  adapter: workflowSession,
  searchPlan,
  request: state.request,
  stats,
});
```

Change `collectRawCandidates` to accept the narrow `searchCandidates` capability instead of the concrete adapter type. In `executePlannedActionsForRun`, inject `executeChat` and `executeCollect` callbacks; the graph supplies `workflowSession.chatCandidate` and `.collectCandidate`, while legacy manual endpoints use direct adapter callbacks only when `run.skillId` is null.

For new manual action requests with a non-null `skillId`, load that exact Workflow version and create a session from it; do not silently switch to a newer active version. Preserve the present direct-adapter fallback for historical runs with `skillId: null`.

Keep existing action-log persistence and error handling. A session result of `{ success: false }` must flow into `persistExecutionResult`/`markExecutionFailed` and the next candidate loop iteration must still run.

- [ ] **Step 4: Run runner tests and verify GREEN**

Run:

```bash
bunx jest src/lib/candidate-screening/runner.test.ts src/lib/candidate-screening/service.test.ts --runInBand --coverage=false
bun run type-check
```

Expected: PASS; existing dry-run tests still prove no chat/collect happens, execution tests prove session reuse, and the new failure test proves candidate-level isolation.

- [ ] **Step 5: Commit runner integration**

```bash
git add src/lib/candidate-screening/runner.ts src/lib/candidate-screening/runner.test.ts
git commit -m "feat(candidate-screening): execute browser workflow in runs"
```

---

### Task 6: Expose Workflow State and Exact-Version Navigation in the Execution UI

**Files:**

- Modify: `src/components/candidate-screening/screening-run-log.tsx`
- Test: `tests/unit/components/CandidateScreening.test.tsx`
- Test: `tests/unit/api/candidate-screening-routes.test.ts`

**Interfaces:**

- `GET /api/candidate-screening/runs/[runId]` returns the DTO fields through existing repository mapping.
- `CandidateScreeningRunLog` renders a Workflow card using `run.skillId` and `run.currentWorkflowStep`.
- Historical runs render `历史任务未关联 Workflow` and no broken link.

- [ ] **Step 1: Write failing component tests**

In the existing `CandidateScreeningRunLog` test fixture, add the fields:

```ts
skillId: 'screen-candidates-v2',
currentWorkflowStep: 'chat_candidate',
```

Then add these assertions:

```ts
expect(await screen.findByText('筛选浏览器 Workflow')).toBeInTheDocument();
expect(screen.getByText('当前步骤：chat_candidate')).toBeInTheDocument();
expect(screen.getByRole('link', { name: '查看 Workflow 详情' })).toHaveAttribute(
  'href',
  '/workflows/screen-candidates-v2',
);
```

Add a second test rendering `skillId: null` and asserting `历史任务未关联 Workflow` is visible and no `查看 Workflow 详情` link exists.

- [ ] **Step 2: Run component tests and verify RED**

Run:

```bash
bunx jest tests/unit/components/CandidateScreening.test.tsx tests/unit/api/candidate-screening-routes.test.ts --runInBand --coverage=false
```

Expected: FAIL because the Workflow card and current-step text are absent.

- [ ] **Step 3: Add the additive Workflow card**

Import `GitBranch` and `ArrowRight` in `screening-run-log.tsx`. Add this section above the existing `搜索与评估` card:

```tsx
<section className="border-border rounded-lg border p-4">
  <div className="mb-3 flex items-center gap-2 text-sm font-medium">
    <GitBranch className="text-muted-foreground h-4 w-4" aria-hidden />
    筛选浏览器 Workflow
  </div>
  {run.skillId ? (
    <Link
      href={`/workflows/${run.skillId}`}
      className="group flex items-center justify-between gap-3"
    >
      <div>
        <div className="text-foreground text-sm font-medium group-hover:underline">
          查看 Workflow 详情
        </div>
        <div className="text-muted-foreground mt-1 text-xs">Skill ID: {run.skillId}</div>
        <div className="text-muted-foreground mt-1 text-xs">
          当前步骤：{run.currentWorkflowStep ?? '等待浏览器操作'}
        </div>
      </div>
      <ArrowRight className="text-muted-foreground h-4 w-4" aria-hidden />
    </Link>
  ) : (
    <p className="text-muted-foreground text-sm">历史任务未关联 Workflow</p>
  )}
</section>
```

Keep run events as the detailed source for exploration, repair, upgrade, and retry messages; do not introduce a separate event API or duplicate timeline.

- [ ] **Step 4: Run UI/API tests and verify GREEN**

Run:

```bash
bunx jest tests/unit/components/CandidateScreening.test.tsx tests/unit/api/candidate-screening-routes.test.ts --runInBand --coverage=false
bun run type-check
```

Expected: PASS; existing run-log rendering remains intact and both associated/historical states are covered.

- [ ] **Step 5: Commit the execution-page observability**

```bash
git add src/components/candidate-screening/screening-run-log.tsx tests/unit/components/CandidateScreening.test.tsx tests/unit/api/candidate-screening-routes.test.ts
git commit -m "feat(candidate-screening): show workflow on run log"
```

---

### Task 7: Verify the Real Browser Workflow Against PostgreSQL, Redis, and Boss-like

**Files:**

- Modify: `tests/integration/candidate-screening/screening-flow.e2e.test.ts`
- Modify: `package.json`

**Interfaces:**

- Produces `bun run test:integration:candidate-screening`.
- Uses the existing real-dependency fixture with `PlaywrightBrowserExecutor` and adds fixture controls for initial target labels and DOM drift.

- [ ] **Step 1: Write failing integration cases**

Add integration tests after the current successful execution fixture case:

```ts
it('explores and persists screen_candidates v1, then reuses it on a later run', async () => {
  const firstRun = await createRunAndExecute({ userId, jobDescription, request: executionRequest });
  const first = await getCandidateScreeningRun({ userId, runId: firstRun.id });
  expect(first?.skillId).toBeTruthy();

  const workflow = await prisma.publishSkill.findUnique({ where: { id: first?.skillId ?? '' } });
  expect(workflow).toEqual(
    expect.objectContaining({ name: 'screen_candidates', version: 1, isActive: true }),
  );

  const secondRun = await createRunAndExecute({
    userId,
    jobDescription,
    request: executionRequest,
  });
  const second = await getCandidateScreeningRun({ userId, runId: secondRun.id });
  expect(second?.skillId).toBe(first?.skillId);
  expect(
    await prisma.publishSkill.count({
      where: { name: 'screen_candidates', platform: 'boss-like' },
    }),
  ).toBe(1);
});

it('repairs a drifted search target once and records v2', async () => {
  fixture.setSearchButtonLabel('开始检索');
  const run = await createRunAndExecute({ userId, jobDescription, request: executionRequest });
  const persisted = await getCandidateScreeningRun({ userId, runId: run.id });
  const events = await listCandidateScreeningRunEvents({ userId, runId: run.id });

  expect(persisted?.skillId).not.toBe(firstWorkflowId);
  expect(events.map((event) => event.message)).toEqual(
    expect.arrayContaining([
      expect.stringContaining('Workflow 修复'),
      expect.stringContaining('重试成功'),
    ]),
  );
});
```

- [ ] **Step 2: Run the integration test and verify RED**

Run:

```bash
bunx jest tests/integration/candidate-screening/screening-flow.e2e.test.ts --runInBand --coverage=false
```

Expected: FAIL because screening runs do not yet persist/use a Workflow or create repair versions.

- [ ] **Step 3: Make fixture actions observable and add the focused script**

Extend the fixture server with stateful controls:

- `setSearchButtonLabel(label: string)` changes the rendered unique search control between runs.
- detail pages keep the browser-visible `收藏` and greeting/message/send targets.
- greeting remains a real form POST to `/employer/resumes/:id/messages`.
- add a click handler for collect that sends `POST /employer/resumes/:id/collect` and record both paths in `requests`.

Assert the full successful run hits resume-list search, profile detail, message, and collect endpoints, and that persisted `candidate_action_logs` contain workflow browser traces.

Add this script without modifying generic test commands:

```json
"test:integration:candidate-screening": "bunx jest tests/integration/candidate-screening/screening-flow.e2e.test.ts --runInBand --coverage=false"
```

- [ ] **Step 4: Run integration test and verify GREEN**

Run:

```bash
bun run test:integration:candidate-screening
```

Expected: PASS with available PostgreSQL/Redis and Playwright Chromium. The test proves v1 exploration, reuse, actual search/detail/greeting/collect browser interactions, v2 repair, and one retry.

- [ ] **Step 5: Commit real-dependency coverage**

```bash
git add tests/integration/candidate-screening/screening-flow.e2e.test.ts package.json
git commit -m "test(candidate-screening): cover browser workflow integration"
```

---

### Task 8: Add Browser-facing E2E Coverage and Perform Final Verification

**Files:**

- Modify: `tests/e2e-playwright/candidate-screening.spec.ts`
- Modify: `package.json`

**Interfaces:**

- Produces `bun run test:e2e:playwright:candidate-screening`.
- E2E verifies route navigation, workflow association, exact-version link, visible step state, and legacy compatibility with API fixtures.

- [ ] **Step 1: Write the failing Playwright assertion**

Add a `skillId` and `currentWorkflowStep` to the mocked `/api/candidate-screening/runs/run-1` response. After the existing button starts the run and the route is displayed, add:

```ts
await expect(page.getByText('筛选浏览器 Workflow')).toBeVisible();
await expect(page.getByText('当前步骤：search_candidates')).toBeVisible();
await expect(page.getByRole('link', { name: '查看 Workflow 详情' })).toHaveAttribute(
  'href',
  '/workflows/screen-candidates-v1',
);
```

Add a second mock response with `skillId: null` and assert `历史任务未关联 Workflow` is visible.

- [ ] **Step 2: Run Playwright test and verify RED**

Run:

```bash
bunx playwright test tests/e2e-playwright/candidate-screening.spec.ts
```

Expected: FAIL because the screening execution page has no Workflow panel.

- [ ] **Step 3: Add the focused E2E script**

Add the exact script entry:

```json
"test:e2e:playwright:candidate-screening": "playwright test tests/e2e-playwright/candidate-screening.spec.ts"
```

The UI implementation from Task 6 should make the new assertions pass; do not mock the component itself. Keep API route interception at the existing browser boundary.

- [ ] **Step 4: Run full focused validation and verify GREEN**

Run these commands in order:

```bash
bunx jest src/lib/candidate-screening/workflow src/lib/candidate-screening/runner.test.ts src/lib/candidate-screening/repo.test.ts tests/unit/components/CandidateScreening.test.tsx --runInBand --coverage=false
bun run type-check
bun run lint
bun run test:integration:candidate-screening
bun run test:e2e:playwright:candidate-screening
```

Expected: all commands PASS. If real-dependency validation cannot run because PostgreSQL, Redis, `OPENAI_API_KEY`, or Chromium is unavailable, record the exact missing prerequisite and still run every deterministic test above.

- [ ] **Step 5: Commit E2E coverage and validation changes**

```bash
git add tests/e2e-playwright/candidate-screening.spec.ts package.json
git commit -m "test(candidate-screening): add workflow e2e coverage"
```

---

## Plan Self-Review

- **Spec coverage:** Tasks 1–2 persist and define versioned Workflow state; Tasks 3–5 explore, execute, repair, and isolate failures; Task 6 exposes the exact version and legacy state; Tasks 7–8 provide integration and browser E2E validation.
- **Scope:** The plan deliberately reuses the existing run, event, Workflow library, and `publish_skills` store. It does not rename storage or replace candidate-screening domain logic.
- **Type consistency:** `skillId` and `currentWorkflowStep` are nullable from Prisma through DTO, client response, component, fixtures, and tests. `screen_candidates` is the sole new workflow name and all browser actions use the same five names.
- **Placeholder scan:** No TODO/TBD or deferred implementation placeholders remain. The migration path and its complete SQL are fixed in Task 1.
