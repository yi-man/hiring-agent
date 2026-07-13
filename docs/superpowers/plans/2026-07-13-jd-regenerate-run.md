# JD Regenerate Run Implementation Plan

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** Make「重新生成 JD」async like create: submit → regenerate-run execution page with polled stages →「查看详情」back to the same JD (in-place update via `continue_generate`).

**Architecture:** Add `JobDescriptionRegenerateRun` + events (screening-shaped FKs). `POST /api/jd/[id]/regenerate-runs` returns `202` and schedules `runJobDescriptionRegenerateRun` via `scheduleBackgroundTask`. UI navigates to `/jd-generator/[id]/regenerate-runs/[runId]`. Delete sync `POST /api/jd/[id]/regenerate`.

**Tech Stack:** Next.js 16 App Router, React 18, TypeScript 5.7, Prisma + PostgreSQL, Jest, Bun.

**Spec:** `docs/superpowers/specs/2026-07-13-jd-regenerate-run-design.md`

## Global Constraints

- Use Bun (`bun run test`, `bun run type-check`, `bunx prisma migrate dev`).
- Strict TypeScript; no `any` abuse.
- Scope: regenerate-run only; do not change LangGraph prompts or create-run behavior.
- Dev server stays on port 3000; Playwright stays on 3100.
- DB naming per `docs/references/database-conventions.md` (Prisma PascalCase models, snake_case `@@map` tables/columns).
- Optional list endpoint / detail「最近重新生成」link: **defer** (not in this plan).

## File map

| File                                                          | Responsibility                               |
| ------------------------------------------------------------- | -------------------------------------------- |
| `prisma/schema.prisma` + migration                            | New run/event models + User/JD relations     |
| `src/lib/jd/regenerate-run-repo.ts`                           | CRUD, DTO map, stale fail, list events       |
| `src/lib/jd/regenerate-run-runner.ts`                         | Background stages → agent → in-place save    |
| `src/lib/jd/regenerate-run-service.ts`                        | Create run + queue event + schedule task     |
| `src/app/api/jd/[id]/regenerate-runs/route.ts`                | `POST` start run                             |
| `src/app/api/jd/[id]/regenerate-runs/[runId]/route.ts`        | `GET` run + events                           |
| `src/lib/jd/client.ts`                                        | Client fetch helpers; remove sync regenerate |
| `src/components/jd-generator/jd-regenerate-run-execution.tsx` | Progress UI (adapt create-run execution)     |
| `src/app/jd-generator/[id]/regenerate-runs/[runId]/page.tsx`  | Auth-gated page shell                        |
| `src/components/jd-generator/jd-pages.tsx`                    | Detail: submit + navigate                    |
| Delete `src/app/api/jd/[id]/regenerate/route.ts`              | Sync path removed                            |

---

### Task 1: Prisma schema + migration

**Files:**

- Modify: `prisma/schema.prisma`
- Create: `prisma/migrations/20260713000000_jd_regenerate_runs/migration.sql` (timestamp may differ if `migrate dev` generates it)

**Interfaces:**

- Produces models `JobDescriptionRegenerateRun`, `JobDescriptionRegenerateRunEvent`
- Adds `User.jobDescriptionRegenerateRuns` / `jobDescriptionRegenerateRunEvents`
- Adds `JobDescription.regenerateRuns`

- [ ] **Step 1: Add models to `schema.prisma`**

On `User`, add:

```prisma
jobDescriptionRegenerateRuns       JobDescriptionRegenerateRun[]
jobDescriptionRegenerateRunEvents  JobDescriptionRegenerateRunEvent[]
```

On `JobDescription`, add:

```prisma
regenerateRuns                   JobDescriptionRegenerateRun[]
```

After `JobDescriptionCreateRunEvent` (or near create-run models), add:

```prisma
model JobDescriptionRegenerateRun {
  id               String                             @id @default(uuid())
  userId           String                             @map("user_id")
  jobDescriptionId String                             @map("job_description_id")
  tone             String                             @default("tech")
  extraInstruction String                             @default("") @map("extra_instruction")
  currentJd        Json                               @map("current_jd")
  status           String                             @default("pending")
  currentStage     String?                            @map("current_stage")
  errorMessage     String?                            @map("error_message")
  startedAt        DateTime?                          @map("started_at")
  finishedAt       DateTime?                          @map("finished_at")
  createdAt        DateTime                           @default(now()) @map("created_at")
  updatedAt        DateTime                           @updatedAt @map("updated_at")
  user             User                               @relation(fields: [userId], references: [id], onDelete: Cascade, onUpdate: Restrict)
  jobDescription   JobDescription                     @relation(fields: [jobDescriptionId, userId], references: [id, userId], onDelete: Cascade, onUpdate: Restrict)
  events           JobDescriptionRegenerateRunEvent[]

  @@unique([id, userId], map: "job_description_regenerate_runs_id_user_id_key")
  @@unique([id, userId, jobDescriptionId], map: "job_description_regenerate_runs_id_user_jd_key")
  @@index([userId, jobDescriptionId, createdAt(sort: Desc)], map: "idx_jd_regenerate_runs_user_jd_created")
  @@index([status, updatedAt(sort: Desc)], map: "idx_jd_regenerate_runs_status_updated")
  @@map("job_description_regenerate_runs")
}

model JobDescriptionRegenerateRunEvent {
  id               String                       @id @default(uuid())
  userId           String                       @map("user_id")
  runId            String                       @map("run_id")
  jobDescriptionId String                       @map("job_description_id")
  stage            String
  level            String                       @default("info")
  message          String
  detail           Json?
  createdAt        DateTime                     @default(now()) @map("created_at")
  user             User                         @relation(fields: [userId], references: [id], onDelete: Cascade, onUpdate: Restrict)
  run              JobDescriptionRegenerateRun  @relation(fields: [runId, userId, jobDescriptionId], references: [id, userId, jobDescriptionId], onDelete: Cascade, onUpdate: Restrict)

  @@index([userId, runId, createdAt], map: "idx_jd_regenerate_run_events_user_run_created")
  @@index([runId, createdAt], map: "idx_jd_regenerate_run_events_run_created")
  @@map("job_description_regenerate_run_events")
}
```

- [ ] **Step 2: Create and apply migration**

Run:

```bash
bunx prisma migrate dev --name jd_regenerate_runs
bunx prisma generate
```

Expected: migration applied; client generates without errors.

- [ ] **Step 3: Commit**

```bash
git add prisma/schema.prisma prisma/migrations
git commit -m "$(cat <<'EOF'
feat: add JD regenerate run schema

EOF
)"
```

---

### Task 2: Regenerate-run repository

**Files:**

- Create: `src/lib/jd/regenerate-run-repo.ts`
- Create: `src/lib/jd/regenerate-run-repo.test.ts` (or colocate patterns matching create-run; prefer colocated `*.test.ts` if create-run has none—create-run has no repo unit test; put focused tests in `regenerate-run-repo.test.ts` for stale-fail + map helpers via prisma mock **only if** project already mocks prisma for repos; otherwise cover stale via route tests in Task 4 and keep repo thin without dedicated DB mock tests)

**Prefer:** Keep repo untested in isolation like create-run-repo; stale covered in Task 4 API tests. This task implements repo only with a smoke type-check.

**Interfaces (produce):**

```ts
export type JobDescriptionRegenerateRunStatus = 'pending' | 'running' | 'success' | 'failed';
export type JobDescriptionRegenerateRunStage =
  | 'queued'
  | 'input_preparation'
  | 'llm_generation'
  | 'saving'
  | 'completed';
export type JobDescriptionRegenerateRunEventLevel = 'info' | 'success' | 'warning' | 'error';

export type JobDescriptionRegenerateRunDto = {
  id: string;
  userId: string;
  jobDescriptionId: string;
  tone: JDTone;
  extraInstruction: string;
  currentJd: JD;
  status: JobDescriptionRegenerateRunStatus;
  currentStage: JobDescriptionRegenerateRunStage | null;
  errorMessage: string | null;
  startedAt: string | null;
  finishedAt: string | null;
  createdAt: string;
  updatedAt: string;
};

export type JobDescriptionRegenerateRunEventDto = {
  id: string;
  userId: string;
  runId: string;
  jobDescriptionId: string;
  stage: JobDescriptionRegenerateRunStage;
  level: JobDescriptionRegenerateRunEventLevel;
  message: string;
  detail: Record<string, unknown> | null;
  createdAt: string;
};

export const STALE_REGENERATE_RUN_TIMEOUT_MS = 10 * 60 * 1000;

export async function failStaleJobDescriptionRegenerateRuns(params: {
  userId: string;
  now?: Date;
  timeoutMs?: number;
}): Promise<number>;

export async function createJobDescriptionRegenerateRun(params: {
  userId: string;
  jobDescriptionId: string;
  tone: JDTone;
  extraInstruction: string;
  currentJd: JD;
  status?: JobDescriptionRegenerateRunStatus;
  currentStage?: JobDescriptionRegenerateRunStage | null;
}): Promise<JobDescriptionRegenerateRunDto>;

export async function updateJobDescriptionRegenerateRun(params: {
  userId: string;
  runId: string;
  status?: JobDescriptionRegenerateRunStatus;
  currentStage?: JobDescriptionRegenerateRunStage | null;
  errorMessage?: string | null;
  startedAt?: Date | null;
  finishedAt?: Date | null;
}): Promise<JobDescriptionRegenerateRunDto | null>;

export async function getJobDescriptionRegenerateRun(params: {
  userId: string;
  runId: string;
  jobDescriptionId?: string;
}): Promise<JobDescriptionRegenerateRunDto | null>;

export async function createJobDescriptionRegenerateRunEvent(params: {
  userId: string;
  runId: string;
  jobDescriptionId: string;
  stage: JobDescriptionRegenerateRunStage;
  level?: JobDescriptionRegenerateRunEventLevel;
  message: string;
  detail?: Record<string, unknown> | null;
}): Promise<JobDescriptionRegenerateRunEventDto>;

export async function listJobDescriptionRegenerateRunEvents(params: {
  userId: string;
  runId: string;
  limit?: number;
}): Promise<JobDescriptionRegenerateRunEventDto[]>;
```

Mirror helpers from `src/lib/jd/create-run-repo.ts`: `clampLimit`, JSON null handling, status/stage normalize, stale `updateMany` with message:

`JD 重新生成任务超时未完成（服务可能已重启中断），已自动标记为失败，请重试。`

For `currentJd` mapping: validate with existing `isJDContent` from `@/lib/jd/api` (or equivalent); if corrupt, throw on map or treat as runtime error.

- [ ] **Step 1: Implement `regenerate-run-repo.ts`** following create-run-repo structure, screening-style event create including `jobDescriptionId`.

- [ ] **Step 2: Type-check**

```bash
bun run type-check
```

Expected: PASS (or only unrelated pre-existing errors).

- [ ] **Step 3: Commit**

```bash
git add src/lib/jd/regenerate-run-repo.ts
git commit -m "$(cat <<'EOF'
feat: add JD regenerate run repository

EOF
)"
```

---

### Task 3: Runner + service (TDD)

**Files:**

- Create: `src/lib/jd/regenerate-run-runner.ts`
- Create: `src/lib/jd/regenerate-run-runner.test.ts`
- Create: `src/lib/jd/regenerate-run-service.ts`
- Create: `src/lib/jd/regenerate-run-service.test.ts`

**Interfaces:**

```ts
// regenerate-run-runner.ts
export async function runJobDescriptionRegenerateRun(params: {
  userId: string;
  runId: string;
}): Promise<void>;

// regenerate-run-service.ts
export async function createAndStartJobDescriptionRegenerateRun(params: {
  userId: string;
  jobDescriptionId: string;
  tone: JDTone;
  extraInstruction: string;
  currentJd: JD;
}): Promise<JobDescriptionRegenerateRunDto>;
```

- [ ] **Step 1: Write failing runner tests** in `regenerate-run-runner.test.ts` (mock repo + `runJDAgent` + `getJobDescriptionById` + `updateMutableJobDescription`, same style as `create-run-runner.test.ts`):

1. Happy path: pending → stages `input_preparation` → `llm_generation` → `saving` → `completed` / `success`; calls `runJDAgent` with `action: 'continue_generate'` and run snapshot; calls `updateMutableJobDescription` with agent JD; records success events.
2. No-op when run already `success`/`failed`.
3. Fails when JD missing or `published` during `input_preparation`.
4. Fails when `updateMutableJobDescription` returns `null`.
5. On `JDAgentContextRetrievalError`, marks run `failed` and event `detail` includes `code: 'JD_CONTEXT_RETRIEVAL_FAILED'`.

Example assertion skeleton:

```ts
expect(runJDAgentMock).toHaveBeenCalledWith(
  {
    action: 'continue_generate',
    currentJd: run.currentJd,
    extraInstruction: run.extraInstruction,
    tone: run.tone,
  },
  { userId: 'u1' },
);
```

- [ ] **Step 2: Run tests — expect FAIL**

```bash
bun run test -- src/lib/jd/regenerate-run-runner.test.ts
```

Expected: FAIL (module/functions missing).

- [ ] **Step 3: Implement runner**

Stages/event messages (Chinese, aligned with UI labels):

| Stage               | Event message examples                                                      |
| ------------------- | --------------------------------------------------------------------------- |
| `input_preparation` | `正在校验 JD 状态`                                                          |
| `llm_generation`    | `正在按追加要求改写 JD` + success detail with timing/tokens like create-run |
| `saving`            | `正在写回工作台` / `JD 已写回工作台`                                        |
| `completed`         | `JD 重新生成完成`                                                           |

Import `JDAgentContextRetrievalError` from `@/lib/jd-agent/service`.

- [ ] **Step 4: Run runner tests — expect PASS**

```bash
bun run test -- src/lib/jd/regenerate-run-runner.test.ts
```

- [ ] **Step 5: Write failing service test**

Mock `createJobDescriptionRegenerateRun`, `createJobDescriptionRegenerateRunEvent`, `scheduleBackgroundTask`, assert:

- creates run with `status: 'pending'`, `currentStage: 'queued'`
- writes queued event message `JD 重新生成任务已创建`
- schedules `() => runJobDescriptionRegenerateRun({ userId, runId })`

Mirror `src/lib/jd/create-run-service.test.ts`.

- [ ] **Step 6: Implement service** (copy `create-run-service.ts` pattern).

- [ ] **Step 7: Run service tests — PASS**

```bash
bun run test -- src/lib/jd/regenerate-run-service.test.ts
```

- [ ] **Step 8: Commit**

```bash
git add src/lib/jd/regenerate-run-runner.ts src/lib/jd/regenerate-run-runner.test.ts \
  src/lib/jd/regenerate-run-service.ts src/lib/jd/regenerate-run-service.test.ts
git commit -m "$(cat <<'EOF'
feat: add JD regenerate run runner and service

EOF
)"
```

---

### Task 4: API routes (TDD)

**Files:**

- Create: `src/app/api/jd/[id]/regenerate-runs/route.ts`
- Create: `src/app/api/jd/[id]/regenerate-runs/route.test.ts`
- Create: `src/app/api/jd/[id]/regenerate-runs/[runId]/route.ts`
- Create: `src/app/api/jd/[id]/regenerate-runs/[runId]/route.test.ts`

**Interfaces:**

- `POST /api/jd/[id]/regenerate-runs` → `202 { run }`
- `GET /api/jd/[id]/regenerate-runs/[runId]` → `{ run, events }`

- [ ] **Step 1: Write failing POST tests** (mock `requireAuth`, `getJobDescriptionById`, `createAndStartJobDescriptionRegenerateRun`, `parseRegenerateJobDescriptionPayload` path via real parse):

1. Auth user + editable JD → `202`, body has `run.status === 'pending'`, service called with snapshot (`currentJd` from body or fallback to `current.content`).
2. Missing JD → `404`.
3. `published` → `409` with message containing `published`.
4. Invalid body (bad tone) → `400`.

- [ ] **Step 2: Implement POST route**

```ts
// Pseudocode structure — follow create-runs + old regenerate auth/error helpers
export async function POST(request, context: { params: Promise<{ id: string }> }) {
  const auth = await requireAuth();
  const { id } = await context.params;
  const current = await getJobDescriptionById(auth.user.id, id);
  if (!current) return 404;
  if (current.status === 'published') return 409;
  const parsed = parseRegenerateJobDescriptionPayload(
    await request.json().catch(() => ({})),
    current.tone,
  );
  if (!parsed.ok) return 400;
  const currentJd = parsed.value.currentJd ?? current.content;
  const run = await createAndStartJobDescriptionRegenerateRun({
    userId: auth.user.id,
    jobDescriptionId: id,
    tone: parsed.value.tone,
    extraInstruction: parsed.value.extraInstruction,
    currentJd,
  });
  return NextResponse.json({ run }, { status: 202 });
}
```

- [ ] **Step 3: POST tests PASS**

```bash
bun run test -- src/app/api/jd/[id]/regenerate-runs/route.test.ts
```

- [ ] **Step 4: Write failing GET [runId] tests**

1. Returns `{ run, events }` after calling `failStaleJobDescriptionRegenerateRuns`.
2. Wrong `id` vs run’s `jobDescriptionId` → `404` (get with `jobDescriptionId` filter).
3. Missing run → `404`.
4. Stale: mock `failStale` invoked before get (assert call with `userId`).

- [ ] **Step 5: Implement GET** mirroring `create-runs/[runId]/route.ts`, but require `params.id` matches run:

```ts
await failStaleJobDescriptionRegenerateRuns({ userId: auth.user.id });
const run = await getJobDescriptionRegenerateRun({
  userId: auth.user.id,
  runId,
  jobDescriptionId: id,
});
```

Events: `listJobDescriptionRegenerateRunEvents({ userId, runId, limit: 200 })`.

- [ ] **Step 6: GET tests PASS**

```bash
bun run test -- 'src/app/api/jd/[id]/regenerate-runs/[runId]/route.test.ts'
```

- [ ] **Step 7: Commit**

```bash
git add 'src/app/api/jd/[id]/regenerate-runs'
git commit -m "$(cat <<'EOF'
feat: add JD regenerate-runs API

EOF
)"
```

---

### Task 5: Client + execution page + detail navigation

**Files:**

- Modify: `src/lib/jd/client.ts`
- Create: `src/components/jd-generator/jd-regenerate-run-execution.tsx`
- Create: `src/app/jd-generator/[id]/regenerate-runs/[runId]/page.tsx`
- Modify: `src/components/jd-generator/jd-pages.tsx`
- Modify: `tests/unit/pages/JDGeneratorPage.test.tsx`

**Interfaces:**

```ts
export async function startJobDescriptionRegenerateRun(
  jobDescriptionId: string,
  payload: RegenerateJobDescriptionRequest,
): Promise<JobDescriptionRegenerateRunDto>;

export async function fetchJobDescriptionRegenerateRunWithEvents(
  jobDescriptionId: string,
  runId: string,
): Promise<{ run: JobDescriptionRegenerateRunDto; events: JobDescriptionRegenerateRunEventDto[] }>;
```

- [ ] **Step 1: Update failing page test** in `JDGeneratorPage.test.tsx` for regenerate case:

Replace expectation of `POST /api/jd/jd-1/regenerate` returning updated JD with:

1. `POST /api/jd/jd-1/regenerate-runs` with same body `{ currentJd, extraInstruction }`.
2. Response `{ run: { id: 'regen-run-1', ... } }` status handled via client (mock `ok: true` and ensure client treats 202 as ok—`response.ok` is true for 202).
3. `pushMock` called with URL matching  
   `/jd-generator/jd-1/regenerate-runs/regen-run-1?returnTo=...&returnLabel=...`  
   (use `withReturnTarget` pattern like create test at lines 258–260).

Adjust fetch mock chain: after initial detail loads, regenerate POST returns run; **do not** expect in-place summary update from regenerate response.

- [ ] **Step 2: Run page test — expect FAIL**

```bash
bun run test -- tests/unit/pages/JDGeneratorPage.test.tsx
```

- [ ] **Step 3: Add client helpers**; remove `regenerateJobDescription` (or leave unused only until Task 6—prefer replace call sites now and delete function in Task 6 with route).

`startJobDescriptionRegenerateRun`:

```ts
const response = await fetch(`/api/jd/${jobDescriptionId}/regenerate-runs`, {
  method: 'POST',
  headers: { 'Content-Type': 'application/json' },
  body: JSON.stringify(payload),
});
// accept 202; throw if !ok || !data.run
```

`fetchJobDescriptionRegenerateRunWithEvents`:

```ts
fetch(`/api/jd/${jobDescriptionId}/regenerate-runs/${runId}`);
```

- [ ] **Step 4: Change `handleRegenerate` in `jd-pages.tsx`**

```ts
async function handleRegenerate() {
  if (!jobDescription || !form) return;
  if (status === 'published') return;
  setIsRegenerating(true); // submit-in-flight only
  setError('');
  try {
    const run = await startJobDescriptionRegenerateRun(jobDescription.id, {
      currentJd: formToJd(form),
      extraInstruction: extraInstruction.trim(),
    });
    router.push(
      withReturnTarget(`/jd-generator/${jobDescription.id}/regenerate-runs/${run.id}`, {
        href: currentPathWithSearch(`/jd-generator/${jobDescription.id}`, searchParams),
        label: '返回 JD',
      }),
    );
  } catch (e) {
    setError(e instanceof Error ? e.message : '重新生成 JD 失败');
    setIsRegenerating(false);
  }
}
```

Ensure `useRouter` / `useSearchParams` / return-url helpers already imported like create view.

Button: while `isRegenerating`, show「提交中」or keep「生成中」but it only covers POST→navigate, not full agent.

- [ ] **Step 5: Add execution component + page**

Copy `jd-create-run-execution.tsx` → `jd-regenerate-run-execution.tsx` and adapt:

- Props: `{ jobDescriptionId: string; runId: string }`
- Fetch via `fetchJobDescriptionRegenerateRunWithEvents(jobDescriptionId, runId)`
- Title: `JD 重新生成执行`
- Stage labels:

```ts
const stageLabels = {
  queued: '任务创建',
  input_preparation: '校验 JD 状态',
  llm_generation: '按追加要求改写 JD',
  saving: '写回工作台',
  completed: '完成',
};
```

- Subtitle: show `extraInstruction` truncated or tone; not department/position from create-run.
- Success detail href: always `/jd-generator/${jobDescriptionId}` (run already has that id).
- Context href: same JD context page pattern.
- Missing run copy: `JD 重新生成任务不存在`.

Page shell (`page.tsx`): same auth pattern as create-runs page; pass both `id` and `runId` from `params`.

- [ ] **Step 6: Page test PASS + type-check**

```bash
bun run test -- tests/unit/pages/JDGeneratorPage.test.tsx
bun run type-check
```

- [ ] **Step 7: Commit**

```bash
git add src/lib/jd/client.ts src/components/jd-generator/jd-pages.tsx \
  src/components/jd-generator/jd-regenerate-run-execution.tsx \
  'src/app/jd-generator/[id]/regenerate-runs' \
  tests/unit/pages/JDGeneratorPage.test.tsx
git commit -m "$(cat <<'EOF'
feat: wire JD regenerate to async execution page

EOF
)"
```

---

### Task 6: Remove sync regenerate + migrate API tests

**Files:**

- Delete: `src/app/api/jd/[id]/regenerate/route.ts`
- Modify: `tests/unit/api/jd-routes.test.ts` — remove sync regenerate cases (or replace with note that coverage lives in regenerate-runs route tests)
- Modify: `src/lib/jd/client.ts` — delete `regenerateJobDescription` if still present
- Modify: any mocks still referencing `regenerateJobDescription` in `tests/unit/components/CandidateScreening.test.tsx` (keep export stub only if still imported; remove mock if unused)

- [ ] **Step 1: Grep for remaining callers**

```bash
rg -n "regenerateJobDescription|/regenerate" src tests --glob '*.{ts,tsx}'
```

Expected after cleanup: only regenerate-runs paths + payload parse tests + docs.

- [ ] **Step 2: Delete sync route; update `jd-routes.test.ts`** by removing imports/`regenerates an existing JD...` blocks that call sync POST (those behaviors are now runner/API regenerate-runs tests).

- [ ] **Step 3: Run focused + broader JD tests**

```bash
bun run test -- src/lib/jd/regenerate-run-runner.test.ts \
  src/lib/jd/regenerate-run-service.test.ts \
  'src/app/api/jd/[id]/regenerate-runs' \
  tests/unit/pages/JDGeneratorPage.test.tsx \
  tests/unit/api/jd-routes.test.ts \
  src/lib/jd/api.test.ts
bun run type-check
bun run lint
```

Expected: all PASS.

- [ ] **Step 4: Commit**

```bash
git add -A src/app/api/jd/\[id\]/regenerate src/lib/jd/client.ts tests/unit
git commit -m "$(cat <<'EOF'
refactor: remove sync JD regenerate endpoint

EOF
)"
```

---

## Spec coverage checklist

| Spec requirement                                          | Task                        |
| --------------------------------------------------------- | --------------------------- |
| Independent regenerate-run tables (screening event shape) | Task 1                      |
| Stages queued→…→completed + stale 10min                   | Task 2–4                    |
| POST 202 + background `continue_generate` + in-place save | Task 3–4                    |
| GET run+events, stale on read, id ownership               | Task 4                      |
| Execution page + detail navigate + form snapshot          | Task 5                      |
| Delete sync `/regenerate`                                 | Task 6                      |
| `JD_CONTEXT_RETRIEVAL_FAILED` in event detail             | Task 3                      |
| Optional list / latest-run link                           | Deferred (out of this plan) |
| No version history / no graph changes                     | Global constraints          |

## Self-review notes

- No placeholders left for legacy route (delete only).
- Event model locked with `jobDescriptionId`.
- Unsaved publish sidebar discard documented in spec; UI task does not auto-PUT.
- Types/names consistent: `JobDescriptionRegenerateRunDto`, `startJobDescriptionRegenerateRun`, `runJobDescriptionRegenerateRun`.
