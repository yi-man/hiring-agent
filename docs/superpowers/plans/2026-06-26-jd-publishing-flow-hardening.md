# JD Publishing Flow Hardening Implementation Plan

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** Harden the existing JD publishing LangGraph MVP so task progress and fallback repair metadata match `2026-06-26-jd-publishing-langgraph-explore-design.md`.

**Architecture:** Keep `service.ts` and the existing LangGraph orchestration intact. Add a repository helper for `JobPublishTask.currentStep`, call it from the graph after every step route decision, and align fallback repair metadata names with the design document.

**Tech Stack:** Next.js App Router, TypeScript, Prisma/PostgreSQL, `@langchain/langgraph`, Jest, Bun.

---

### Task 1: Persist Step Progress

**Files:**

- Modify: `src/lib/jd-publishing/publish-repo.ts`
- Test: `src/lib/jd-publishing/publish-repo.test.ts`
- Modify: `src/lib/jd-publishing/graph.ts`
- Test: `src/lib/jd-publishing/graph.test.ts`

- [x] **Step 1: Write failing repository test**

```ts
await updatePublishTaskCurrentStep({ taskId: 'task-1', currentStep: 'fill_title' });

expect(prismaMock.jobPublishTask.update).toHaveBeenCalledWith({
  where: { id: 'task-1' },
  data: { currentStep: 'fill_title' },
});
```

- [x] **Step 2: Run red test**

Run: `bunx jest src/lib/jd-publishing/publish-repo.test.ts --runInBand --coverage=false`

Expected: FAIL because `updatePublishTaskCurrentStep` is not exported.

- [x] **Step 3: Implement repository helper**

```ts
export async function updatePublishTaskCurrentStep(params: {
  taskId: string;
  currentStep: string | null;
}): Promise<void> {
  await prisma.jobPublishTask.update({
    where: { id: params.taskId },
    data: { currentStep: params.currentStep },
  });
}
```

- [x] **Step 4: Write failing graph test**

```ts
expect(updateTaskCurrentStep.mock.calls.map(([call]) => call.currentStep)).toEqual([
  'fill_title',
  'done',
  null,
]);
```

- [x] **Step 5: Wire graph dependency**

Add `updateTaskCurrentStep` to `PublishingGraphDependencies`, default it to `updatePublishTaskCurrentStep`, and call it from `executeStepNode` when the graph advances, reaches terminal success, fails, or routes to fallback.

- [x] **Step 6: Re-run graph/repo tests**

Run: `bunx jest src/lib/jd-publishing/publish-repo.test.ts src/lib/jd-publishing/graph.test.ts --runInBand --coverage=false`

Expected: PASS.

### Task 2: Align Fallback Repair Metadata

**Files:**

- Modify: `src/lib/jd-publishing/types.ts`
- Modify: `src/lib/jd-publishing/graph.ts`
- Test: `src/lib/jd-publishing/graph.test.ts`

- [x] **Step 1: Write failing graph assertion**

```ts
expect(createNextSkillVersion).toHaveBeenCalledWith(
  expect.objectContaining({
    meta: expect.objectContaining({
      created_from: 'agent',
      repaired_from_skill_id: 'skill-1',
      repaired_from_version: 1,
      failed_step_id: 'fill_title',
      repair_reason: 'title selector changed',
    }),
  }),
);
```

- [x] **Step 2: Run red test**

Run: `bunx jest src/lib/jd-publishing/graph.test.ts --runInBand --coverage=false`

Expected: FAIL because current metadata uses `repaired_reason` and omits `failed_step_id`.

- [x] **Step 3: Implement metadata alignment**

Set `failed_step_id` from the failed trace step and `repair_reason` from `onFail.reason` or `errorMessage`. Keep `created_from`, `repaired_from_skill_id`, and `repaired_from_version`.

- [x] **Step 4: Re-run graph test**

Run: `bunx jest src/lib/jd-publishing/graph.test.ts --runInBand --coverage=false`

Expected: PASS.

### Task 3: Verification

**Commands:**

- `bunx jest src/lib/jd-publishing/publish-repo.test.ts src/lib/jd-publishing/graph.test.ts src/lib/jd-publishing/service.test.ts src/lib/jd-publishing/skill-executor.test.ts src/lib/jd-publishing/explore.test.ts src/lib/jd-publishing/executors/playwright-executor.test.ts --runInBand --coverage=false`
- `bun run type-check`

- [x] Run the focused JD publishing suite.
- [x] Run TypeScript type-check.
- [x] Review `git diff` to confirm the change is scoped to JD publishing flow hardening and its plan doc.
