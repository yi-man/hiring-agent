# JD Regenerate Run Design

**Date:** 2026-07-13  
**Status:** Ready for implementation  
**Goal:** Align「重新生成 JD」UX with「新建 JD」: submit → dedicated execution page with stage/event progress →「查看详情」link back to the same JD. Keep in-place update and `continue_generate` agent semantics.

## Decisions (locked)

| Topic                        | Choice                                                                                                                                                                                                                          |
| ---------------------------- | ------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------- |
| Persistence                  | In-place update of the same JD id (no new version row)                                                                                                                                                                          |
| Input snapshot               | Detail **content** form via `formToJd(form)` + optional `extraInstruction` (+ tone) at submit — same payload as today’s sync regenerate                                                                                         |
| Unsaved non-content UI state | Publish sidebar edits (`publishSalary` / selected locations, etc.) are **not** snapshotted; navigating to the execution page discards that ephemeral React state (reload detail from DB). No auto-`PUT` before regenerate in v1 |
| Architecture                 | Independent regenerate-run (mirror create-run), not extend create-run table                                                                                                                                                     |
| Agent                        | Unchanged: `continue_generate` (evaluate → always improve → reevaluate → finalize improved)                                                                                                                                     |
| Published JD                 | Reject regenerate (`409`), same as today                                                                                                                                                                                        |
| Legacy sync route            | **Delete in the same PR** after migrating callers/tests to regenerate-runs (no external clients assumed)                                                                                                                        |

## Problem

Create JD is async: `POST /api/jd/create-runs` → `202` → `/jd-generator/create-runs/{runId}` polls every ~1.5s with stages/events →「查看详情」.

Regenerate stays on the detail page and awaits a single blocking `POST /api/jd/{id}/regenerate`. The UI only flips the button to「生成中」while the full LangGraph runs (typically ≥3 LLM calls). Long requests feel stuck and are vulnerable to proxy/browser timeouts.

## User flow

1. User opens `/jd-generator/{id}` (editable, not `published`).
2. Optionally edits JD **content** fields and fills「追加要求」.
3. Clicks「重新生成」.
4. Client `POST /api/jd/{id}/regenerate-runs` with `{ currentJd, extraInstruction?, tone? }` (`currentJd` = `formToJd(form)`).
5. Server creates run with `status: 'pending'` and `currentStage: 'queued'`, schedules background runner, returns `202 { run }`.
6. Client navigates to `/jd-generator/{id}/regenerate-runs/{runId}` (return target: detail page).
7. Execution page polls `GET .../regenerate-runs/{runId}` every 1.5s until `success` or `failed`.
8. On success: banner +「查看详情」→ `/jd-generator/{id}` (same id; content already updated in DB).
9. On failure: show `errorMessage` + events;「返回详情」keeps previous JD content unchanged.

Detail page no longer blocks on regenerate HTTP. Linking to the latest in-flight/historical regenerate-run from detail is a **nice-to-have**, not required for v1.

## Data model

New tables, following create-run + screening-run conventions (`docs/references/database-conventions.md`).

### `JobDescriptionRegenerateRun` → `job_description_regenerate_runs`

| Field                      | Type      | Notes                                           |
| -------------------------- | --------- | ----------------------------------------------- |
| `id`                       | uuid PK   |                                                 |
| `userId`                   | string    | owner                                           |
| `jobDescriptionId`         | string    | **required** (unlike create-run)                |
| `tone`                     | string    | snapshot at submit                              |
| `extraInstruction`         | string    | default `''`                                    |
| `currentJd`                | Json      | content snapshot used as agent input            |
| `status`                   | string    | `pending` \| `running` \| `success` \| `failed` |
| `currentStage`             | string?   | see stages below                                |
| `errorMessage`             | string?   |                                                 |
| `startedAt` / `finishedAt` | DateTime? |                                                 |
| `createdAt` / `updatedAt`  | DateTime  |                                                 |

Indexes (aligned with screening runs):

- unique `(id, userId)`
- unique `(id, userId, jobDescriptionId)` for composite FKs from events
- `(userId, jobDescriptionId, createdAt desc)`
- `(status, updatedAt desc)` for stale-run sweeps

Relations: `User`, `JobDescription` via `(jobDescriptionId, userId)` composite FK, cascade delete.

### `JobDescriptionRegenerateRunEvent` → `job_description_regenerate_run_events`

**Locked to screening-event shape** (not create-run’s thinner shape):

| Field              | Type                    |
| ------------------ | ----------------------- |
| `id`               | uuid PK                 |
| `userId`           | string                  |
| `runId`            | string                  |
| `jobDescriptionId` | string                  |
| `stage`            | string                  |
| `level`            | string (default `info`) |
| `message`          | string                  |
| `detail`           | Json?                   |
| `createdAt`        | DateTime                |

FK: `(runId, userId, jobDescriptionId)` → run’s `unique (id, userId, jobDescriptionId)`, cascade delete.  
Indexes: `(userId, runId, createdAt)`, `(runId, createdAt)`.

### Stages

```
queued → input_preparation → llm_generation → saving → completed
```

| Stage               | Meaning                                            |
| ------------------- | -------------------------------------------------- |
| `queued`            | Run created                                        |
| `input_preparation` | Validate JD still mutable; resolve tone / snapshot |
| `llm_generation`    | `runJDAgent({ action: 'continue_generate', ... })` |
| `saving`            | `updateMutableJobDescription` in place             |
| `completed`         | Terminal success                                   |

Stale policy (same as create-run): on **list and get** regenerate-run endpoints, call a user-scoped `failStaleJobDescriptionRegenerateRuns` that marks non-terminal runs older than **10 minutes** as `failed`.

## API

### `POST /api/jd/[id]/regenerate-runs`

- Auth required; 404 if JD missing; 409 if `published`.
- Body: `parseRegenerateJobDescriptionPayload`; if `currentJd` omitted, fall back to stored `content`.
- Persist snapshot on the run row (do **not** wait for agent).
- Schedule `runJobDescriptionRegenerateRun` via existing `scheduleBackgroundTask` / `after()`.
- Response: `202 { run }` with `status: 'pending'`, `currentStage: 'queued'`.

### `GET /api/jd/[id]/regenerate-runs/[runId]`

- Auth + ownership; run must belong to `{id}`.
- Apply stale-fail (user-scoped batch) before read.
- Response: `{ run, events }` with events ordered by `createdAt asc`, limit semantics same as create-run (`clampLimit(100)`).

### `GET /api/jd/[id]/regenerate-runs` (optional v1)

- List recent runs for this JD (`limit`, default small). Useful for detail sidebar「最近重新生成」. Ship in same PR if cheap; otherwise defer.

### Legacy `POST /api/jd/[id]/regenerate`

**Delete in the same PR** after UI and tests use regenerate-runs. Do not keep a sync shim or `410` placeholder.

## Background runner

Mirror `create-run-runner.ts`:

1. Load run; no-op if already terminal.
2. `running` + `input_preparation`: load JD; if missing/`published`, fail run.
3. `llm_generation`: `runJDAgent({ action: 'continue_generate', currentJd: run.currentJd, extraInstruction: run.extraInstruction, tone: run.tone }, { userId })`. Record timing/token/context detail like create-run.
4. `saving`: `updateMutableJobDescription({ userId, id: run.jobDescriptionId, content, evaluation, generationMeta, tone, status: 'created' })`. If update returns null (e.g. published mid-flight), fail run with clear message; **do not** invent a new JD.
5. `completed` / `success`.
6. On any throw: `failed` + error event; run status `failed` (HTTP already returned 202). For `JDAgentContextRetrievalError`, put `code: 'JD_CONTEXT_RETRIEVAL_FAILED'` in event `detail` (preserve today’s structured code even though there is no sync 502).

Concurrency: allow multiple historical runs; **no hard lock** in v1. Last successful save wins (same as rapid double-click today). Optional later: reject new run if another is `pending`/`running` for same JD.

## UI

### Detail (`JDDetailView`)

- `handleRegenerate`: call `startJobDescriptionRegenerateRun(id, payload)` → `router.push` execution URL with return target = detail.
- Remove blocking wait on agent completion (brief submit loading until `202` is fine).
- Button label stays「重新生成」; disabled while submit in flight or if `published`.

### Execution page

- Route: `src/app/jd-generator/[id]/regenerate-runs/[runId]/page.tsx`
- Component: adapt `jd-create-run-execution.tsx` → `jd-regenerate-run-execution.tsx`, with:
  - Stage labels tuned for regenerate (e.g. `llm_generation` →「按追加要求改写 JD」; `saving` →「写回工作台」)
  - Success CTA:「查看详情」→ `/jd-generator/{id}`
  - Optional context link after success (same as create-run when JD id exists)
  - Back link uses return-url helpers like create-run

### Client

- Add `startJobDescriptionRegenerateRun` / `fetchJobDescriptionRegenerateRunWithEvents` in `src/lib/jd/client.ts`.

## Error handling

| Case                              | Behavior                                                                                    |
| --------------------------------- | ------------------------------------------------------------------------------------------- |
| Unauthenticated                   | 401 on POST/GET                                                                             |
| JD not found                      | 404 on POST                                                                                 |
| Published                         | 409 on POST; mid-run publish → run `failed` at saving                                       |
| Invalid body                      | 400                                                                                         |
| Agent / context retrieval failure | Run `failed`; events carry message (+ `detail.code` when applicable)                        |
| Stale run (>10 min non-terminal)  | Mark `failed` on list/get (user-scoped batch)                                               |
| JD deleted mid-run                | Run (+ events) cascade-deleted; execution poll shows「任务不存在」(expected)                |
| POST succeeds, navigation fails   | Retry regenerate, or open run URL if known (acceptable v1; latest-run link is nice-to-have) |

## Testing

- Unit: regenerate-run repo, runner (mock `runJDAgent` + `updateMutableJobDescription`), payload parse unchanged.
- API route tests: POST 202 + schedules background; GET with events; 409 published; 404; **stale-run mark on GET**.
- Component/unit or light integration: detail submit navigates (mock client); execution page polls until success and shows detail link.
- Keep agent `continue_generate` tests as-is (no behavior change).
- Migrate tests that hit sync regenerate to regenerate-runs; delete sync route tests with the route.

## Out of scope

- JD version history / new row per regenerate
- Streaming token-level JD text
- Unifying create-run and regenerate-run into one polymorphic table
- Hard concurrency lock / single-flight per JD
- Auto-saving publish sidebar fields before navigate
- Changing LangGraph prompts or evaluate/improve policy

## Implementation sketch (file touch list)

- `prisma/schema.prisma` + migration
- `src/lib/jd/regenerate-run-repo.ts`
- `src/lib/jd/regenerate-run-runner.ts`
- `src/lib/jd/regenerate-run-service.ts`
- `src/app/api/jd/[id]/regenerate-runs/route.ts`
- `src/app/api/jd/[id]/regenerate-runs/[runId]/route.ts`
- `src/app/jd-generator/[id]/regenerate-runs/[runId]/page.tsx`
- `src/components/jd-generator/jd-regenerate-run-execution.tsx`
- `src/lib/jd/client.ts`, `jd-pages.tsx`
- Delete `src/app/api/jd/[id]/regenerate/route.ts` (+ its tests) after migration
- Tests under `tests/unit` / colocated `*.test.ts` mirroring create-run coverage

## Success criteria

- Regenerate never leaves the user staring at a frozen detail page waiting on one long POST.
- User can see queued → prepare → LLM → save → done on an execution page.
- On success, one click opens the **same** JD detail with updated content.
- Agent path and in-place persistence semantics unchanged from today’s regenerate.
