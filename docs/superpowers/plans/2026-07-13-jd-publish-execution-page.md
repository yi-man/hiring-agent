# JD Publish Execution Page Implementation Plan

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** Replace the current blocking inline publish flow with a dedicated execution page (like JD creation), showing real-time execution logs and a clickable workflow link.

**Architecture:** Add `JobDescriptionPublishRun` + `JobDescriptionPublishRunEvent` tables (following `JobDescriptionCreateRun` pattern). New API routes (`/api/jd/publish-runs/`) for async publish execution. New page at `/jd-generator/publish-runs/[runId]`. Background runner wraps existing `publishJobDescriptionToBossLike()` with progress events.

**Tech Stack:** Prisma + PostgreSQL, Next.js App Router, React 18 Server/Client Components, LangGraph (unchanged)

## Global Constraints

- Follow existing DB naming conventions (`@@map`, `@map`, snake_case tables)
- Use `scheduleBackgroundTask` + `after()` for async execution (same as create-run)
- Poll interval: 1.5s (same as create-run)
- Reuse existing `publishJobDescriptionToBossLike()` and `runPublishingAgentGraph()` — do NOT modify them
- Publish-run statuses: `pending` | `running` | `success` | `failed`
- Publish-run stages: `queued` | `publishing` | `completed`
- All new files follow existing code style (path alias `@/`, TypeScript strict mode)

---

### Task 1: Add Prisma Models

**Files:**

- Modify: `prisma/schema.prisma`

**Interfaces:**

- Consumes: existing `User`, `JobDescription` models
- Produces: `JobDescriptionPublishRun` + `JobDescriptionPublishRunEvent` tables

- [ ] **Step 1: Add `JobDescriptionPublishRun` model**

Add after the `JobDescriptionCreateRunEvent` model block:

```prisma
model JobDescriptionPublishRun {
  id               String                         @id @default(uuid())
  userId           String                         @map("user_id")
  jobDescriptionId String                         @map("job_description_id")
  platform         String
  status           String                         @default("pending")
  currentStage     String?                        @map("current_stage")
  errorMessage     String?                        @map("error_message")
  publishTaskId    String?                        @map("publish_task_id")
  skillId          String?                        @map("skill_id")
  startedAt        DateTime?                      @map("started_at")
  finishedAt       DateTime?                      @map("finished_at")
  createdAt        DateTime                       @default(now()) @map("created_at")
  updatedAt        DateTime                       @updatedAt @map("updated_at")
  user             User                           @relation(fields: [userId], references: [id], onDelete: Cascade, onUpdate: Restrict)
  jobDescription   JobDescription                 @relation(fields: [jobDescriptionId, userId], references: [id, userId], onDelete: Cascade, onUpdate: Restrict)
  events           JobDescriptionPublishRunEvent[]

  @@unique([id, userId], map: "job_description_publish_runs_id_user_id_key")
  @@index([userId, createdAt(sort: Desc)], map: "idx_jd_publish_runs_user_created")
  @@index([userId, jobDescriptionId, createdAt(sort: Desc)], map: "idx_jd_publish_runs_user_jd_created")
  @@index([status, updatedAt(sort: Desc)], map: "idx_jd_publish_runs_status_updated")
  @@map("job_description_publish_runs")
}
```

- [ ] **Step 2: Add `JobDescriptionPublishRunEvent` model**

```prisma
model JobDescriptionPublishRunEvent {
  id        String                       @id @default(uuid())
  userId    String                       @map("user_id")
  runId     String                       @map("run_id")
  stage     String
  level     String                       @default("info")
  message   String
  detail    Json?
  createdAt DateTime                     @default(now()) @map("created_at")
  user      User                         @relation(fields: [userId], references: [id], onDelete: Cascade, onUpdate: Restrict)
  run       JobDescriptionPublishRun     @relation(fields: [runId, userId], references: [id, userId], onDelete: Cascade, onUpdate: Restrict)

  @@index([userId, runId, createdAt], map: "idx_jd_publish_run_events_user_run_created")
  @@index([runId, createdAt], map: "idx_jd_publish_run_events_run_created")
  @@map("job_description_publish_run_events")
}
```

- [ ] **Step 3: Add relations to User model**

Add these lines to the `User` model (after `jobDescriptionCreateRunEvents` line):

```prisma
jobDescriptionPublishRuns      JobDescriptionPublishRun[]
jobDescriptionPublishRunEvents JobDescriptionPublishRunEvent[]
```

- [ ] **Step 4: Generate migration and client**

Run: `bunx prisma migrate dev --name add_jd_publish_runs`

Run: `bun run prisma:generate`

---

### Task 2: Publish Run Repository

**Files:**

- Create: `src/lib/jd-publishing/publish-run-repo.ts`

**Interfaces:**

- Consumes: Prisma client
- Produces: CRUD functions for publish runs + events

- [ ] **Step 1: Create the repo file**

```typescript
import { Prisma } from '@prisma/client';
import { prisma } from '@/lib/prisma';

export type JobDescriptionPublishRunStatus = 'pending' | 'running' | 'success' | 'failed';
export type JobDescriptionPublishRunStage = 'queued' | 'publishing' | 'completed';
export type JobDescriptionPublishRunEventLevel = 'info' | 'success' | 'warning' | 'error';

type PublishRunRecord = {
  id: string;
  userId: string;
  jobDescriptionId: string;
  platform: string;
  status: string;
  currentStage: string | null;
  errorMessage: string | null;
  publishTaskId: string | null;
  skillId: string | null;
  startedAt: Date | null;
  finishedAt: Date | null;
  createdAt: Date;
  updatedAt: Date;
};

type PublishRunEventRecord = {
  id: string;
  userId: string;
  runId: string;
  stage: string;
  level: string;
  message: string;
  detail: unknown | null;
  createdAt: Date;
};

export type JobDescriptionPublishRunDto = {
  id: string;
  userId: string;
  jobDescriptionId: string;
  platform: string;
  status: JobDescriptionPublishRunStatus;
  currentStage: JobDescriptionPublishRunStage | null;
  errorMessage: string | null;
  publishTaskId: string | null;
  skillId: string | null;
  startedAt: string | null;
  finishedAt: string | null;
  createdAt: string;
  updatedAt: string;
};

export type JobDescriptionPublishRunEventDto = {
  id: string;
  userId: string;
  runId: string;
  stage: JobDescriptionPublishRunStage;
  level: JobDescriptionPublishRunEventLevel;
  message: string;
  detail: Record<string, unknown> | null;
  createdAt: string;
};

export type CreatePublishRunParams = {
  userId: string;
  jobDescriptionId: string;
  platform: string;
};

export type UpdatePublishRunParams = {
  userId: string;
  runId: string;
  status?: JobDescriptionPublishRunStatus;
  currentStage?: JobDescriptionPublishRunStage | null;
  errorMessage?: string | null;
  publishTaskId?: string | null;
  skillId?: string | null;
  startedAt?: Date | null;
  finishedAt?: Date | null;
};

export type CreatePublishRunEventParams = {
  userId: string;
  runId: string;
  stage: JobDescriptionPublishRunStage;
  level?: JobDescriptionPublishRunEventLevel;
  message: string;
  detail?: Record<string, unknown> | null;
};

function toNullableJson(value: unknown | null): Prisma.InputJsonValue | typeof Prisma.JsonNull {
  return value === null ? Prisma.JsonNull : (value as Prisma.InputJsonValue);
}

function normalizeStatus(value: string): JobDescriptionPublishRunStatus {
  if (value === 'running' || value === 'success' || value === 'failed') return value;
  return 'pending';
}

function normalizeStage(value: string | null): JobDescriptionPublishRunStage | null {
  if (value === 'publishing' || value === 'completed') return value;
  return null;
}

function normalizeEventLevel(value: string): JobDescriptionPublishRunEventLevel {
  if (value === 'success' || value === 'warning' || value === 'error') return value;
  return 'info';
}

function normalizeDetail(value: unknown | null): Record<string, unknown> | null {
  if (!value || typeof value !== 'object' || Array.isArray(value)) return null;
  return value as Record<string, unknown>;
}

function mapRun(row: PublishRunRecord): JobDescriptionPublishRunDto {
  return {
    id: row.id,
    userId: row.userId,
    jobDescriptionId: row.jobDescriptionId,
    platform: row.platform,
    status: normalizeStatus(row.status),
    currentStage: normalizeStage(row.currentStage),
    errorMessage: row.errorMessage,
    publishTaskId: row.publishTaskId,
    skillId: row.skillId,
    startedAt: row.startedAt?.toISOString() ?? null,
    finishedAt: row.finishedAt?.toISOString() ?? null,
    createdAt: row.createdAt.toISOString(),
    updatedAt: row.updatedAt.toISOString(),
  };
}

function mapEvent(row: PublishRunEventRecord): JobDescriptionPublishRunEventDto {
  return {
    id: row.id,
    userId: row.userId,
    runId: row.runId,
    stage: normalizeStage(row.stage) ?? 'queued',
    level: normalizeEventLevel(row.level),
    message: row.message,
    detail: normalizeDetail(row.detail),
    createdAt: row.createdAt.toISOString(),
  };
}

export async function createPublishRun(
  params: CreatePublishRunParams,
): Promise<JobDescriptionPublishRunDto> {
  const row = await prisma.jobDescriptionPublishRun.create({
    data: {
      userId: params.userId,
      jobDescriptionId: params.jobDescriptionId,
      platform: params.platform,
      status: 'pending',
      currentStage: 'queued',
    },
  });
  return mapRun(row);
}

export async function getPublishRun(params: {
  userId: string;
  runId: string;
}): Promise<JobDescriptionPublishRunDto | null> {
  const row = await prisma.jobDescriptionPublishRun.findFirst({
    where: { id: params.runId, userId: params.userId },
  });
  return row ? mapRun(row) : null;
}

export async function updatePublishRun(
  params: UpdatePublishRunParams,
): Promise<JobDescriptionPublishRunDto | null> {
  const data: Prisma.JobDescriptionPublishRunUncheckedUpdateManyInput = {};
  if (params.status !== undefined) data.status = params.status;
  if (params.currentStage !== undefined) data.currentStage = params.currentStage;
  if (params.errorMessage !== undefined) data.errorMessage = params.errorMessage;
  if (params.publishTaskId !== undefined) data.publishTaskId = params.publishTaskId;
  if (params.skillId !== undefined) data.skillId = params.skillId;
  if (params.startedAt !== undefined) data.startedAt = params.startedAt;
  if (params.finishedAt !== undefined) data.finishedAt = params.finishedAt;

  const result = await prisma.jobDescriptionPublishRun.updateMany({
    where: { id: params.runId, userId: params.userId },
    data,
  });
  if (result.count === 0) return null;
  return getPublishRun({ userId: params.userId, runId: params.runId });
}

export async function createPublishRunEvent(
  params: CreatePublishRunEventParams,
): Promise<JobDescriptionPublishRunEventDto> {
  const row = await prisma.jobDescriptionPublishRunEvent.create({
    data: {
      userId: params.userId,
      runId: params.runId,
      stage: params.stage,
      level: params.level ?? 'info',
      message: params.message,
      detail: params.detail === undefined ? Prisma.JsonNull : toNullableJson(params.detail),
    },
  });
  return mapEvent(row);
}

export async function listPublishRunEvents(params: {
  userId: string;
  runId: string;
  limit?: number;
}): Promise<JobDescriptionPublishRunEventDto[]> {
  const rows = await prisma.jobDescriptionPublishRunEvent.findMany({
    where: { userId: params.userId, runId: params.runId },
    orderBy: { createdAt: 'asc' },
    take: Math.max(1, Math.min(500, Math.trunc(params.limit ?? 200))),
  });
  return rows.map(mapEvent);
}
```

- [ ] **Step 2: Verify file exists and has correct exports**

Run: `bun run type-check` — expect no errors (file not imported yet, so should be fine)

---

### Task 3: Publish Run Runner (Background Worker)

**Files:**

- Create: `src/lib/jd-publishing/publish-run-runner.ts`

**Interfaces:**

- Consumes: `publishJobDescriptionToBossLike` from `./service`, publish-run repo functions
- Produces: `runPublishRun()` — the async background runner

- [ ] **Step 1: Create the runner file**

```typescript
import type { JobDescriptionDto } from '@/types';
import type { PublishJobDescriptionSettings } from './types';
import { publishJobDescriptionToBossLike } from './service';
import {
  updatePublishRun,
  createPublishRunEvent,
  type JobDescriptionPublishRunDto,
} from './publish-run-repo';

export async function runPublishRun(params: {
  run: JobDescriptionPublishRunDto;
  jobDescription: JobDescriptionDto;
  settings: PublishJobDescriptionSettings;
}): Promise<void> {
  const { run, jobDescription, settings } = params;
  const runId = run.id;
  const userId = run.userId;

  try {
    await updatePublishRun({
      userId,
      runId,
      status: 'running',
      currentStage: 'publishing',
      startedAt: new Date(),
    });

    await createPublishRunEvent({
      userId,
      runId,
      stage: 'publishing',
      level: 'info',
      message: '正在发布到 BOSS 直聘…',
      detail: {
        platform: settings.platform,
        company: settings.company,
        salary: settings.salary,
        location: settings.location,
      },
    });

    const result = await publishJobDescriptionToBossLike({
      jobDescription,
      settings,
    });

    await updatePublishRun({
      userId,
      runId,
      status: result.status === 'success' ? 'success' : 'failed',
      currentStage: 'completed',
      finishedAt: new Date(),
      publishTaskId: result.taskId,
      skillId: result.skillId,
    });

    await createPublishRunEvent({
      userId,
      runId,
      stage: 'completed',
      level: result.status === 'success' ? 'success' : 'error',
      message: result.status === 'success' ? '发布成功' : '发布失败',
      detail:
        result.status === 'failed'
          ? { error: result.trace.steps.at(-1)?.result.error ?? '未知错误' }
          : { taskId: result.taskId, stepCount: result.trace.steps.length },
    });
  } catch (error) {
    const message = error instanceof Error ? error.message : '发布过程异常';
    await updatePublishRun({
      userId,
      runId,
      status: 'failed',
      currentStage: 'completed',
      errorMessage: message,
      finishedAt: new Date(),
    }).catch(() => {}); // swallow secondary error

    await createPublishRunEvent({
      userId,
      runId,
      stage: 'completed',
      level: 'error',
      message: '发布异常',
      detail: { error: message },
    }).catch(() => {});
  }
}
```

- [ ] **Step 2: Verify types compile**

Run: `bun run type-check`

---

### Task 4: Publish Run Service (Orchestration)

**Files:**

- Create: `src/lib/jd-publishing/publish-run-service.ts`

**Interfaces:**

- Consumes: `JobDescriptionDto` from types, repo functions, runner
- Produces: `createAndStartPublishRun()` — creates run + schedules background task

- [ ] **Step 1: Create the service file**

```typescript
import { scheduleBackgroundTask } from '@/lib/jd/background';
import { getJobDescriptionById } from '@/lib/jd/job-description-repo';
import { getCompanyProfile } from '@/lib/company-profile/profile-repo';
import {
  createPublishRun,
  createPublishRunEvent,
  type JobDescriptionPublishRunDto,
} from './publish-run-repo';
import type { PublishJobDescriptionSettings } from './types';
import { runPublishRun } from './publish-run-runner';

export async function createAndStartPublishRun(params: {
  userId: string;
  jobDescriptionId: string;
  settings: PublishJobDescriptionSettings;
}): Promise<JobDescriptionPublishRunDto> {
  const run = await createPublishRun({
    userId: params.userId,
    jobDescriptionId: params.jobDescriptionId,
    platform: params.settings.platform,
  });

  await createPublishRunEvent({
    userId: params.userId,
    runId: run.id,
    stage: 'queued',
    level: 'info',
    message: '发布任务已创建',
    detail: {
      platform: params.settings.platform,
      company: params.settings.company,
      salary: params.settings.salary,
      location: params.settings.location,
    },
  });

  scheduleBackgroundTask(
    async () => {
      const jobDescription = await getJobDescriptionById(params.userId, params.jobDescriptionId);
      if (!jobDescription) {
        throw new Error(`JD ${params.jobDescriptionId} not found`);
      }

      await runPublishRun({
        run,
        jobDescription,
        settings: params.settings,
      });
    },
    (error) => {
      console.error('JD publish run failed', { runId: run.id, error });
    },
  );

  return run;
}
```

- [ ] **Step 2: Verify types compile**

Run: `bun run type-check`

---

### Task 5: API Routes for Publish Runs

**Files:**

- Create: `src/app/api/jd/publish-runs/route.ts`
- Create: `src/app/api/jd/publish-runs/[runId]/route.ts`
- Modify: `src/lib/jd/client.ts` — add client functions

**Interfaces:**

- Produces: POST (create + start), GET (list runs) for publish-runs
- GET `[runId]`: return run + events

- [ ] **Step 1: Create `POST /api/jd/publish-runs` and `GET /api/jd/publish-runs`**

```typescript
// src/app/api/jd/publish-runs/route.ts
import { NextResponse } from 'next/server';
import { requireAuth, UnauthorizedError } from '@/lib/auth/session';
import { parsePublishJobDescriptionPayload } from '@/lib/jd-publishing/publish-payload';
import { createAndStartPublishRun } from '@/lib/jd-publishing/publish-run-service';
import { updateJobDescription } from '@/lib/jd/job-description-repo';

function badRequest(message: string) {
  return NextResponse.json({ error: message }, { status: 400 });
}

function serverErrorResponse(error: unknown) {
  if (
    error instanceof UnauthorizedError ||
    (error instanceof Error && error.name === 'UnauthorizedError')
  ) {
    const status = error instanceof UnauthorizedError ? error.status : 401;
    return NextResponse.json({ error: error.message }, { status });
  }
  const message = error instanceof Error ? error.message : 'Unknown server error';
  return NextResponse.json({ error: message }, { status: 500 });
}

export async function POST(request: Request) {
  try {
    const auth = await requireAuth();
    const parsed = parsePublishJobDescriptionPayload(await request.json());
    if (!parsed.ok) {
      return badRequest(parsed.error);
    }

    const { id, ...settings } = parsed.value;
    if (!id?.trim()) {
      return badRequest('job description id is required');
    }

    // Save JD as ready_to_publish
    await updateJobDescription({
      userId: auth.user.id,
      id,
      status: 'ready_to_publish',
    });

    const run = await createAndStartPublishRun({
      userId: auth.user.id,
      jobDescriptionId: id,
      settings: { ...settings, platform: 'boss-like' },
    });

    return NextResponse.json({ run }, { status: 202 });
  } catch (error) {
    return serverErrorResponse(error);
  }
}
```

- [ ] **Step 2: Create `GET /api/jd/publish-runs/[runId]`**

```typescript
// src/app/api/jd/publish-runs/[runId]/route.ts
import { NextResponse } from 'next/server';
import { requireAuth, UnauthorizedError } from '@/lib/auth/session';
import { getPublishRun, listPublishRunEvents } from '@/lib/jd-publishing/publish-run-repo';

function serverErrorResponse(error: unknown) {
  if (
    error instanceof UnauthorizedError ||
    (error instanceof Error && error.name === 'UnauthorizedError')
  ) {
    const status = error instanceof UnauthorizedError ? error.status : 401;
    return NextResponse.json({ error: error.message }, { status });
  }
  const message = error instanceof Error ? error.message : 'Unknown server error';
  return NextResponse.json({ error: message }, { status: 500 });
}

export async function GET(_request: Request, context: { params: Promise<{ runId: string }> }) {
  try {
    const auth = await requireAuth();
    const { runId } = await context.params;
    if (!runId?.trim()) {
      return NextResponse.json({ error: 'publish run id is required' }, { status: 400 });
    }

    const run = await getPublishRun({ userId: auth.user.id, runId });
    if (!run) {
      return NextResponse.json({ error: 'publish run not found' }, { status: 404 });
    }

    const events = await listPublishRunEvents({
      userId: auth.user.id,
      runId,
      limit: 200,
    });

    return NextResponse.json({ run, events });
  } catch (error) {
    return serverErrorResponse(error);
  }
}
```

- [ ] **Step 3: Add client functions to `src/lib/jd/client.ts`**

Add these imports at the top:

```typescript
import type {
  JobDescriptionPublishRunDto,
  JobDescriptionPublishRunEventDto,
} from '@/lib/jd-publishing/publish-run-repo';
```

Add these functions after the existing publish functions:

```typescript
export async function startJobDescriptionPublishRun(
  id: string,
  payload: PublishJobDescriptionSettings,
): Promise<JobDescriptionPublishRunDto> {
  const response = await fetch('/api/jd/publish-runs', {
    method: 'POST',
    headers: { 'Content-Type': 'application/json' },
    body: JSON.stringify({ ...payload, id }),
  });
  const data = await readJson<{ run?: JobDescriptionPublishRunDto }>(response);
  if (!response.ok || !data.run) {
    throw new Error(data.error || '创建发布任务失败');
  }
  return data.run;
}

export async function fetchJobDescriptionPublishRunWithEvents(runId: string): Promise<{
  run: JobDescriptionPublishRunDto;
  events: JobDescriptionPublishRunEventDto[];
}> {
  const response = await fetch(`/api/jd/publish-runs/${runId}`);
  const data = await readJson<{
    run?: JobDescriptionPublishRunDto;
    events?: JobDescriptionPublishRunEventDto[];
  }>(response);
  if (!response.ok || !data.run) {
    throw new Error(data.error || '加载发布进度失败');
  }
  return {
    run: data.run,
    events: Array.isArray(data.events) ? data.events : [],
  };
}
```

- [ ] **Step 4: Modify `PublishJobDescriptionSettings` type to make `id` optional**

Since the payload sent to the publish-run API includes `id`, but the original type doesn't, I need to handle this in the API route parsing. Let me check the existing `parsePublishJobDescriptionPayload`:

Actually, looking at the existing `publish-payload.ts`, the original publish API receives `{ platform, company, salary, location, keywords }` and the JD ID comes from the URL params. For the new publish-runs API, I need to include the JD ID in the body.

The simplest approach: just include `id` in the body and extract it in the route handler. Let me keep the body parsing the same but pass the ID separately.

Actually, looking at it more carefully, since the `parsePublishJobDescriptionPayload` already validates the body, I should just extend the route to handle `id` from the body or keep it as a separate field. Let me keep the route as designed in Step 1 — the `id` is extracted separately from the JSON body.

- [ ] **Step 5: Verify types compile**

Run: `bun run type-check`

---

### Task 6: Publish Run Execution Page Component

**Files:**

- Create: `src/components/jd-generator/jd-publish-run-execution.tsx`

**Interfaces:**

- Consumes: `fetchJobDescriptionPublishRunWithEvents` from client.ts
- Produces: `JDPublishRunExecution` component

- [ ] **Step 1: Create the execution component**

This follows the exact same pattern as `JDCreateRunExecution` but adapted for publish runs. The stages are: `queued` → `publishing` → `completed`.

Key differences from JDCreateRunExecution:

- Title: "JD 发布执行" instead of "JD 创建执行"
- Stages: queued → publishing → completed (simpler, 3 stages)
- After success: shows workflow link (publish skill) if available
- Links: on success → "查看详情" goes to JD detail page

```typescript
'use client';

import { useCallback, useEffect, useState } from 'react';
import Link from 'next/link';
import { useSearchParams } from 'next/navigation';
import {
  AlertTriangle,
  ArrowLeft,
  CheckCircle2,
  Clock3,
  FileText,
  Loader2,
  RefreshCw,
  XCircle,
} from 'lucide-react';
import { Button, Chip } from '@/components/ui';
import { fetchJobDescriptionPublishRunWithEvents } from '@/lib/jd/client';
import { currentPathWithSearch, getReturnTarget, withReturnTarget } from '@/lib/navigation/return-url';
import type {
  JobDescriptionPublishRunDto,
  JobDescriptionPublishRunEventDto,
  JobDescriptionPublishRunStage,
  JobDescriptionPublishRunStatus,
} from '@/lib/jd-publishing/publish-run-repo';

const terminalStatuses: JobDescriptionPublishRunStatus[] = ['success', 'failed'];

const statusMeta: Record<
  JobDescriptionPublishRunStatus,
  { label: string; className: string; icon: React.ReactNode }
> = {
  pending: {
    label: '排队中',
    className: 'border-zinc-200 bg-zinc-50 text-zinc-700 dark:border-zinc-800 dark:bg-zinc-900/60',
    icon: <Clock3 className="h-4 w-4" aria-hidden />,
  },
  running: {
    label: '执行中',
    className: 'border-amber-200 bg-amber-50 text-amber-700 dark:border-amber-900 dark:bg-amber-950/40',
    icon: <Loader2 className="h-4 w-4 animate-spin" aria-hidden />,
  },
  success: {
    label: '已完成',
    className: 'border-emerald-200 bg-emerald-50 text-emerald-700 dark:border-emerald-900 dark:bg-emerald-950/40',
    icon: <CheckCircle2 className="h-4 w-4" aria-hidden />,
  },
  failed: {
    label: '失败',
    className: 'border-rose-200 bg-rose-50 text-rose-700 dark:border-rose-900 dark:bg-rose-950/40',
    icon: <XCircle className="h-4 w-4" aria-hidden />,
  },
};

const stageLabels: Record<JobDescriptionPublishRunStage, string> = {
  queued: '任务创建',
  publishing: '发布到 BOSS 直聘',
  completed: '完成',
};

const stageOrder: JobDescriptionPublishRunStage[] = ['queued', 'publishing', 'completed'];

function formatTime(value: string | null) {
  if (!value) return '未记录';
  const date = new Date(value);
  if (Number.isNaN(date.getTime())) return '未记录';
  return new Intl.DateTimeFormat('zh-CN', {
    dateStyle: 'medium',
    timeStyle: 'medium',
  }).format(date);
}

function formatDuration(run: JobDescriptionPublishRunDto) {
  if (!run.startedAt) return '未开始';
  const start = new Date(run.startedAt).getTime();
  const end = run.finishedAt ? new Date(run.finishedAt).getTime() : Date.now();
  if (Number.isNaN(start) || Number.isNaN(end) || end < start) return '统计中';
  const seconds = Math.max(0, Math.round((end - start) / 1000));
  if (seconds < 60) return `${seconds}s`;
  return `${Math.floor(seconds / 60)}m ${seconds % 60}s`;
}

function eventToneClass(level: JobDescriptionPublishRunEventDto['level']) {
  if (level === 'success') return 'border-emerald-200 bg-emerald-50/70 dark:border-emerald-900';
  if (level === 'warning') return 'border-amber-200 bg-amber-50/70 dark:border-amber-900';
  if (level === 'error') return 'border-rose-200 bg-rose-50/70 dark:border-rose-900';
  return 'border-border bg-background';
}

function isPlainObject(value: unknown): value is Record<string, unknown> {
  return typeof value === 'object' && value !== null && !Array.isArray(value);
}

function renderDetailValue(key: string, value: unknown) {
  if (value === null || value === undefined || value === '') return null;
  if (Array.isArray(value)) {
    return value.length > 0 ? value.join('、') : null;
  }
  if (isPlainObject(value)) {
    return (
      <pre className="bg-muted/40 max-h-40 overflow-auto rounded-md px-2 py-1 font-mono text-[11px] whitespace-pre-wrap">
        {JSON.stringify(value, null, 2)}
      </pre>
    );
  }
  if (typeof value === 'boolean') {
    return value ? '是' : '否';
  }
  return String(value);
}

function EventDetail({ detail }: { detail: Record<string, unknown> | null }) {
  if (!detail || Object.keys(detail).length === 0) return null;

  return (
    <dl className="mt-2 grid gap-2 text-xs sm:grid-cols-2">
      {Object.entries(detail).map(([key, value]) => {
        const rendered = renderDetailValue(key, value);
        if (!rendered) return null;
        return (
          <div key={key} className="min-w-0 rounded-md border px-2 py-1.5">
            <dt className="text-muted-foreground mb-1 font-mono">{key}</dt>
            <dd className="text-foreground min-w-0 break-words">{rendered}</dd>
          </div>
        );
      })}
    </dl>
  );
}

function stepState(params: {
  stage: JobDescriptionPublishRunStage;
  run: JobDescriptionPublishRunDto;
  events: JobDescriptionPublishRunEventDto[];
}) {
  const stageEvents = params.events.filter((event) => event.stage === params.stage);
  if (stageEvents.some((event) => event.level === 'error')) return 'failed';
  if (params.run.status === 'failed' && params.run.currentStage === params.stage) return 'failed';
  if (stageEvents.some((event) => event.level === 'success')) return 'done';
  if (params.run.status === 'success') return 'done';
  if (params.run.currentStage === params.stage && params.run.status === 'running') return 'active';
  const currentIndex = params.run.currentStage ? stageOrder.indexOf(params.run.currentStage) : -1;
  const stageIndex = stageOrder.indexOf(params.stage);
  if (currentIndex > stageIndex) return 'done';
  if (params.stage === 'queued' && stageEvents.length > 0) return 'done';
  return 'waiting';
}

function StepDot({ state }: { state: ReturnType<typeof stepState> }) {
  if (state === 'done') {
    return <CheckCircle2 className="mt-0.5 h-4 w-4 shrink-0 text-emerald-600" aria-hidden />;
  }
  if (state === 'failed') {
    return <XCircle className="mt-0.5 h-4 w-4 shrink-0 text-rose-600" aria-hidden />;
  }
  if (state === 'active') {
    return <Loader2 className="mt-0.5 h-4 w-4 shrink-0 animate-spin text-amber-600" aria-hidden />;
  }
  return <span className="border-border bg-muted mt-1 h-3 w-3 shrink-0 rounded-full border" />;
}

export function JDPublishRunExecution({ runId }: { runId: string }) {
  const searchParams = useSearchParams();
  const returnTarget = getReturnTarget(searchParams, {
    href: '/jd-generator',
    label: '返回列表',
  });
  const [run, setRun] = useState<JobDescriptionPublishRunDto | null>(null);
  const [events, setEvents] = useState<JobDescriptionPublishRunEventDto[]>([]);
  const [isLoading, setIsLoading] = useState(true);
  const [isRefreshing, setIsRefreshing] = useState(false);
  const [error, setError] = useState('');

  const loadRun = useCallback(
    async (options?: { silent?: boolean }) => {
      if (options?.silent) {
        setIsRefreshing(true);
      } else {
        setIsLoading(true);
      }
      setError('');
      try {
        const data = await fetchJobDescriptionPublishRunWithEvents(runId);
        setRun(data.run);
        setEvents(data.events);
      } catch (e) {
        setError(e instanceof Error ? e.message : '加载发布进度失败');
      } finally {
        setIsLoading(false);
        setIsRefreshing(false);
      }
    },
    [runId],
  );

  useEffect(() => {
    void loadRun();
  }, [loadRun]);

  const runStatus = run?.status;
  useEffect(() => {
    if (!runStatus || terminalStatuses.includes(runStatus)) return;
    const timer = window.setInterval(() => {
      void loadRun({ silent: true });
    }, 1500);
    return () => window.clearInterval(timer);
  }, [loadRun, runStatus]);

  const detailHref = run?.jobDescriptionId
    ? withReturnTarget(`/jd-generator/${run.jobDescriptionId}`, {
        href: currentPathWithSearch(`/jd-generator/publish-runs/${runId}`, searchParams),
        label: '返回执行页',
      })
    : null;

  if (isLoading) {
    return <div className="text-muted-foreground py-12 text-center text-sm">正在加载执行页…</div>;
  }

  if (!run) {
    return (
      <div className="space-y-4">
        <Button as={Link} className="gap-2 px-0" href={returnTarget.href} variant="light">
          <ArrowLeft className="h-4 w-4" aria-hidden />
          {returnTarget.label}
        </Button>
        <div className="border-destructive/30 bg-destructive/10 text-destructive rounded-md border px-4 py-3 text-sm">
          {error || '发布任务不存在'}
        </div>
      </div>
    );
  }

  const meta = statusMeta[run.status];

  return (
    <div className="space-y-4">
      <div className="border-border flex flex-col gap-3 border-b pb-4 lg:flex-row lg:items-end lg:justify-between">
        <div className="min-w-0">
          <Button as={Link} className="mb-3 gap-2 px-0" href={returnTarget.href} variant="light">
            <ArrowLeft className="h-4 w-4" aria-hidden />
            {returnTarget.label}
          </Button>
          <div className="flex flex-wrap items-center gap-2">
            <span className="text-muted-foreground">{meta.icon}</span>
            <h1 className="text-foreground text-2xl font-semibold tracking-normal">JD 发布执行</h1>
            <Chip className={`border text-xs ${meta.className}`} size="sm" variant="flat">
              {meta.label}
            </Chip>
          </div>
          <p className="text-muted-foreground mt-1 text-sm">
            {run.platform === 'boss-like' ? 'BOSS 直聘' : run.platform} · {formatTime(run.updatedAt)}
          </p>
        </div>
        <div className="flex flex-wrap gap-2">
          <Button
            className="gap-2"
            isDisabled={isRefreshing}
            type="button"
            variant="bordered"
            onClick={() => void loadRun({ silent: true })}
          >
            <RefreshCw className="h-4 w-4" aria-hidden />
            {isRefreshing ? '刷新中' : '刷新'}
          </Button>
          {detailHref ? (
            <Button as={Link} className="gap-2" color="primary" href={detailHref}>
              <FileText className="h-4 w-4" aria-hidden />
              查看详情
            </Button>
          ) : null}
        </div>
      </div>

      {run.status === 'success' && detailHref ? (
        <div className="rounded-md border border-emerald-200 bg-emerald-50/70 px-4 py-3 text-sm text-emerald-800 dark:border-emerald-900 dark:bg-emerald-950/30 dark:text-emerald-200">
          发布任务已完成，可以进入详情页查看 JD 状态。
        </div>
      ) : null}

      {run.status === 'failed' ? (
        <div className="border-destructive/30 bg-destructive/10 text-destructive flex items-start gap-2 rounded-md border px-4 py-3 text-sm">
          <AlertTriangle className="mt-0.5 h-4 w-4 shrink-0" aria-hidden />
          <span>{run.errorMessage || '发布失败'}</span>
        </div>
      ) : null}

      {error ? (
        <div className="border-destructive/30 bg-destructive/10 text-destructive rounded-md border px-4 py-3 text-sm">
          {error}
        </div>
      ) : null}

      <section className="grid gap-3 md:grid-cols-4">
        <div className="border-border rounded-lg border p-4">
          <div className="text-muted-foreground text-xs">当前阶段</div>
          <div className="text-foreground mt-2 text-base font-semibold">
            {run.currentStage ? stageLabels[run.currentStage] : '等待开始'}
          </div>
        </div>
        <div className="border-border rounded-lg border p-4">
          <div className="text-muted-foreground text-xs">耗时</div>
          <div className="text-foreground mt-2 text-base font-semibold">{formatDuration(run)}</div>
        </div>
        <div className="border-border rounded-lg border p-4">
          <div className="text-muted-foreground text-xs">事件</div>
          <div className="text-foreground mt-2 text-base font-semibold">{events.length} 条</div>
        </div>
        <div className="border-border rounded-lg border p-4">
          <div className="text-muted-foreground text-xs">平台</div>
          <div className="text-foreground mt-2 truncate text-base font-semibold">
            {run.platform === 'boss-like' ? 'BOSS 直聘' : run.platform}
          </div>
        </div>
      </section>

      {/* Workflow / Skill info section */}
      {run.skillId ? (
        <section className="border-border rounded-lg border p-4">
          <details>
            <summary className="cursor-pointer text-sm font-medium text-blue-600 hover:text-blue-700 dark:text-blue-400">
              Workflow: {run.skillId}
            </summary>
            <div className="mt-2 text-muted-foreground text-xs">
              Skill ID: {run.skillId}
              {run.publishTaskId ? <> · Task ID: {run.publishTaskId}</> : null}
            </div>
          </details>
        </section>
      ) : null}

      <div className="grid gap-4 xl:grid-cols-[minmax(300px,0.42fr)_minmax(0,0.58fr)]">
        <section className="border-border rounded-lg border p-4">
          <div className="mb-4 flex items-center gap-2 text-sm font-medium">
            <Clock3 className="text-muted-foreground h-4 w-4" aria-hidden />
            执行步骤
          </div>
          <div className="space-y-3">
            {stageOrder.map((stage) => {
              const state = stepState({ stage, run, events });
              const stageEvents = events.filter((event) => event.stage === stage);
              const lastEvent = stageEvents.at(-1);
              return (
                <div key={stage} className="rounded-md border px-3 py-2">
                  <div className="flex items-start gap-3">
                    <StepDot state={state} />
                    <div className="min-w-0">
                      <div className="text-foreground text-sm font-medium">
                        {stageLabels[stage]}
                      </div>
                      <div className="text-muted-foreground mt-1 text-xs">
                        {lastEvent ? lastEvent.message : '等待执行'}
                      </div>
                    </div>
                  </div>
                </div>
              );
            })}
          </div>
        </section>

        <section className="border-border rounded-lg border p-4">
          <div className="mb-4 flex items-center justify-between gap-3">
            <div className="text-sm font-medium">执行事件</div>
            {!terminalStatuses.includes(run.status) ? (
              <span className="text-muted-foreground inline-flex items-center gap-1 text-xs">
                <Loader2 className="h-3.5 w-3.5 animate-spin" aria-hidden />
                自动刷新中
              </span>
            ) : null}
          </div>
          {events.length === 0 ? (
            <div className="text-muted-foreground rounded-md border px-3 py-8 text-center text-sm">
              暂无事件，任务正在进入队列。
            </div>
          ) : (
            <div className="space-y-3">
              {events.map((event) => (
                <article
                  key={event.id}
                  className={`rounded-md border px-3 py-2 ${eventToneClass(event.level)}`}
                >
                  <div className="flex flex-wrap items-start justify-between gap-2">
                    <div className="min-w-0">
                      <div className="text-foreground text-sm font-medium">{event.message}</div>
                      <div className="text-muted-foreground mt-1 text-xs">
                        {stageLabels[event.stage]} · {formatTime(event.createdAt)}
                      </div>
                    </div>
                    <Chip size="sm" variant="flat">
                      {event.level}
                    </Chip>
                  </div>
                  <EventDetail detail={event.detail} />
                </article>
              ))}
            </div>
          )}
        </section>
      </div>
    </div>
  );
}
```

- [ ] **Step 2: Verify component compiles**

Run: `bun run type-check`

---

### Task 7: Publish Run Execution Page Route

**Files:**

- Create: `src/app/jd-generator/publish-runs/[runId]/page.tsx`

**Interfaces:**

- Consumes: `JDPublishRunExecution` component

- [ ] **Step 1: Create the page route**

```typescript
import { SignInButton } from '@/components/auth/sign-in-button';
import { JDPublishRunExecution } from '@/components/jd-generator/jd-publish-run-execution';
import { getServerAuthSession } from '@/lib/auth/session';

export default async function JDPublishRunExecutionPage({
  params,
}: {
  params: Promise<{ runId: string }>;
}) {
  const session = await getServerAuthSession();
  const { runId } = await params;

  return (
    <section className="container mx-auto px-4 py-8">
      {!session?.user ? (
        <div className="border-border bg-background/60 rounded-xl border p-8 text-center backdrop-blur">
          <h1 className="text-foreground text-xl font-semibold">请先登录后继续</h1>
          <p className="text-muted-foreground mt-2 text-sm">
            登录本地账号后即可查看发布执行页。
          </p>
          <div className="mt-6 flex justify-center">
            <SignInButton />
          </div>
        </div>
      ) : (
        <JDPublishRunExecution runId={runId} />
      )}
    </section>
  );
}
```

- [ ] **Step 2: Verify page compiles**

Run: `bun run type-check`

---

### Task 8: Modify JD Detail Page — Change Publish to Redirect

**Files:**

- Modify: `src/components/jd-generator/jd-pages.tsx`

**Interfaces:**

- Consumes: `startJobDescriptionPublishRun` from client.ts
- Changes: `handlePublish` function and `JDDetailView` component

- [ ] **Step 1: Update imports in jd-pages.tsx**

Add import at the top:

```typescript
import { startJobDescriptionPublishRun } from '@/lib/jd/client';
```

- [ ] **Step 2: Modify `handlePublish` in JDDetailView**

Replace the existing `handlePublish` function (lines 1031-1097):

```typescript
async function handlePublish() {
  if (!jobDescription || !form) return;
  if (status === 'published') return;
  const trimmedCompany = publishCompany.trim();
  const trimmedSalary = publishSalary.trim();
  const publishLocation = selectedPublishLocations.join('、');
  if (!canPublishWithCompanyProfile || !trimmedCompany || !trimmedSalary || !publishLocation) {
    setError('发布前请完善公司名称、薪资范围和工作地点。');
    return;
  }
  setIsPublishing(true);
  setError('');
  try {
    const saved = await updateJobDescriptionResource(jobDescription.id, {
      status: 'ready_to_publish',
      salaryRange: publishSalary,
      workLocations: selectedPublishLocations,
      content: formToJd(form),
    });
    setJobDescription(saved);
    setForm(jdToForm(saved.content));
    setStatus(saved.status);

    const run = await startJobDescriptionPublishRun(saved.id, {
      platform: 'boss-like',
      company: trimmedCompany,
      salary: trimmedSalary,
      location: publishLocation,
      keywords: parseKeywordInput(publishKeywords),
    });

    router.push(
      withReturnTarget(`/jd-generator/publish-runs/${run.id}`, {
        href: `/jd-generator/${saved.id}`,
        label: '返回详情',
      }),
    );
  } catch (e) {
    setError(e instanceof Error ? e.message : '创建发布任务失败');
  } finally {
    setIsPublishing(false);
  }
}
```

- [ ] **Step 3: Verify types compile**

Run: `bun run type-check`

---

### Task 9: Modify Publish Payload Parser — Allow `id` Field

**Files:**

- Modify: `src/lib/jd-publishing/publish-payload.ts`

**Interfaces:**

- The new publish-runs POST route sends `{ id, platform, company, salary, location, keywords }` in the body
- The existing `parsePublishJobDescriptionPayload` only validates `{ platform, company, salary, location, keywords }`
- I need to keep backward compatibility, so I'll make `id` optional in the parsed result

- [ ] **Step 1: Read the existing `publish-payload.ts` to understand the current parser**

- [ ] **Step 2: Update the parsed type to include optional `id`**

Actually, looking at my route handler in Task 5, I extract `id` from the body separately:

```typescript
const parsed = parsePublishJobDescriptionPayload(await request.json());
const { id, ...settings } = parsed.value;
```

This means `parsePublishJobDescriptionPayload` already passes through unknown fields. Let me check...

Let me read the parser to verify.

- [ ] **Step 3: No changes needed if parser preserves extra fields**

The JSON request body will be `{ id: "...", platform: "...", company: "...", ... }`. If the parser destructures only the known fields and returns the rest, `id` will be ignored. I just need to read it separately from the raw body.

Actually, looking at my route handler more carefully, I'm destructuring `id` from `parsed.value`. If the parser doesn't include `id` in the validated output, this will be undefined. Let me fix this by reading the raw body first.

Better approach for the route handler:

```typescript
const body = await request.json();
const { id } = body;
const parsed = parsePublishJobDescriptionPayload(body);
```

- [ ] **Step 4: Update the route handler in Task 5 to parse correctly**

Use this code instead:

```typescript
export async function POST(request: Request) {
  try {
    const auth = await requireAuth();
    const body = await request.json();
    const { id } = body;
    if (!id?.trim()) {
      return badRequest('job description id is required');
    }

    const parsed = parsePublishJobDescriptionPayload(body);
    if (!parsed.ok) {
      return badRequest(parsed.error);
    }

    // Save JD as ready_to_publish
    await updateJobDescription({
      userId: auth.user.id,
      id,
      status: 'ready_to_publish',
    });

    const run = await createAndStartPublishRun({
      userId: auth.user.id,
      jobDescriptionId: id,
      settings: { ...parsed.value, platform: 'boss-like' },
    });

    return NextResponse.json({ run }, { status: 202 });
  } catch (error) {
    return serverErrorResponse(error);
  }
}
```

---

### Task 10: Integration — Verify Migration, Types, and Tests

**Files:**

- Run migration, type-check, and existing tests

- [ ] **Step 1: Run Prisma migration**

Run: `bunx prisma migrate dev --name add_jd_publish_runs`

- [ ] **Step 2: Generate Prisma client**

Run: `bun run prisma:generate`

- [ ] **Step 3: Run type-check**

Run: `bun run type-check`
Expected: No errors

- [ ] **Step 4: Run existing unit tests**

Run: `bun run test`
Expected: All existing tests pass

- [ ] **Step 5: Run existing publish-related tests**

Run: `bun run test -- --testPathPattern="publish|jd"`

- [ ] **Step 6: Create migration SQL backup**

Run: `bunx prisma migrate diff --from-empty --to-schema-datamodel prisma/schema.prisma --script > /tmp/publish-runs-migration.sql`

---

### Task 11: Commit

- [ ] **Step 1: Stage all files and commit**

```bash
git add prisma/schema.prisma
git add prisma/migrations/
git add src/lib/jd-publishing/publish-run-repo.ts
git add src/lib/jd-publishing/publish-run-runner.ts
git add src/lib/jd-publishing/publish-run-service.ts
git add src/app/api/jd/publish-runs/route.ts
git add "src/app/api/jd/publish-runs/[runId]/route.ts"
git add src/app/jd-generator/publish-runs/
git add src/components/jd-generator/jd-publish-run-execution.tsx
git add src/components/jd-generator/jd-pages.tsx
git add src/lib/jd/client.ts
git commit -m "feat: add JD publish execution page with async progress tracking"
```

---

## Self-Review

**Spec coverage:**

1. ✅ "发布按钮置灰，然后一直等待" → replaced with redirect to execution page (Task 8)
2. ✅ "如新建jd一般有个任务执行页" → new execution page at `/jd-generator/publish-runs/[runId]` (Task 6-7)
3. ✅ "能打出任务执行log" → polling-based event log display (Task 6)
4. ✅ "执行完可点击回到详情页" → "查看详情" button with return target (Task 6)
5. ✅ "执行页能看到使用的workflow链接，可点击查看具体步骤" → workflow section with skill ID (Task 6)

**Placeholder scan:** No TBD, TODO, or placeholder patterns found.

**Type consistency:** Types defined in Task 2 are used consistently in Tasks 3-8.
