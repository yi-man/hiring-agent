# 首页工作台 Implementation Plan

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** Replace the current marketing-style homepage with an authenticated recruiting operations dashboard that supports clickable status/platform drill-downs.

**Architecture:** Add a focused dashboard data layer under `src/lib/dashboard/`, expose it through `GET /api/dashboard`, and render it with small client components under `src/components/dashboard/`. Keep `/` as the homepage URL, use existing JD publishing and candidate screening tables, and avoid new Prisma models in this iteration.

**Tech Stack:** Next.js 16 App Router, React 18, TypeScript, Prisma PostgreSQL, Bun, Jest, Testing Library, Tailwind CSS, lucide-react.

---

## File Structure

- Create `src/lib/dashboard/types.ts`: DTOs, filter types, platform constants, and status labels.
- Create `src/lib/dashboard/overview.ts`: pure helpers plus Prisma-backed `getDashboardOverview`.
- Create `src/lib/dashboard/client.ts`: browser fetch wrapper for `/api/dashboard`.
- Create `src/app/api/dashboard/route.ts`: authenticated API route.
- Create `src/components/dashboard/dashboard-page.tsx`: client shell that reads query filters, fetches dashboard data, and composes subcomponents.
- Create `src/components/dashboard/summary-cards.tsx`: clickable top metrics.
- Create `src/components/dashboard/platform-filter.tsx`: platform/status filter rail.
- Create `src/components/dashboard/job-list.tsx`: JD drill-down list.
- Create `src/components/dashboard/action-queue.tsx`: right-side queue for publishing and candidate follow-up.
- Modify `src/app/page.tsx`: auth-aware homepage entrypoint.
- Modify `src/components/navbar.tsx`: remove standalone `首页` link from desktop and mobile nav.
- Modify `src/components/app-sidebar.tsx`: rename `首页` to `工作台` and use `LayoutDashboard`.
- Modify `src/app/layout.tsx`: rename footer `首页` link to `工作台`.
- Test `src/lib/dashboard/overview.test.ts`: helper and Prisma aggregation behavior.
- Test `src/app/api/dashboard/route.test.ts`: auth, validation, and API response.
- Modify `src/app/page.test.tsx` and `tests/unit/pages/Home.test.tsx`: homepage dashboard expectations.
- Modify `src/components/navbar.test.tsx` and `tests/unit/components/Navbar.test.tsx`: no standalone home nav.
- Modify `src/components/app-sidebar.test.tsx`: sidebar label and active state.

---

## Task 1: Dashboard Types And Pure Helpers

**Files:**
- Create: `src/lib/dashboard/types.ts`
- Create: `src/lib/dashboard/overview.ts`
- Test: `src/lib/dashboard/overview.test.ts`

- [ ] **Step 1: Write failing helper tests**

Create `src/lib/dashboard/overview.test.ts` with the pure helper cases first:

```ts
import {
  aggregateCandidateStats,
  inferDashboardPlatform,
  parseDashboardFilters,
} from './overview';
import type { DashboardPublishTaskSummary } from './types';

const prismaMock = {
  jobDescription: {
    findMany: jest.fn(),
    groupBy: jest.fn(),
  },
  jobPublishTask: {
    findMany: jest.fn(),
  },
  candidateScreeningResult: {
    findMany: jest.fn(),
  },
  $connect: jest.fn(),
};

jest.mock('@/lib/prisma', () => ({
  prisma: prismaMock,
}));

describe('dashboard overview helpers', () => {
  beforeEach(() => {
    prismaMock.jobDescription.findMany.mockReset();
    prismaMock.jobDescription.groupBy.mockReset();
    prismaMock.jobPublishTask.findMany.mockReset();
    prismaMock.candidateScreeningResult.findMany.mockReset();
    prismaMock.$connect.mockReset();
  });

  it('parses valid filters with bounded limits', () => {
    expect(
      parseDashboardFilters(new URL('http://localhost/api/dashboard?status=published&platform=boss-like&limit=250').searchParams),
    ).toEqual({
      status: 'published',
      platform: 'boss-like',
      limit: 100,
    });
  });

  it('rejects invalid JD status filters', () => {
    expect(() =>
      parseDashboardFilters(new URL('http://localhost/api/dashboard?status=paused').searchParams),
    ).toThrow('status is invalid');
  });

  it('infers the latest successful publish platform for a JD', () => {
    const tasks: DashboardPublishTaskSummary[] = [
      {
        id: 'task-failed',
        jobDescriptionId: 'jd-1',
        platform: 'boss-like',
        status: 'failed',
        errorMessage: 'form changed',
        createdAt: '2026-07-06T09:00:00.000Z',
        updatedAt: '2026-07-06T09:01:00.000Z',
      },
      {
        id: 'task-success',
        jobDescriptionId: 'jd-1',
        platform: 'boss-like',
        status: 'success',
        errorMessage: null,
        createdAt: '2026-07-06T10:00:00.000Z',
        updatedAt: '2026-07-06T10:02:00.000Z',
      },
    ];

    expect(inferDashboardPlatform('published', tasks)).toEqual({
      platform: 'boss-like',
      label: 'BOSS-like',
    });
  });

  it('marks published jobs without successful tasks as untracked platform', () => {
    expect(inferDashboardPlatform('published', [])).toEqual({
      platform: 'untracked',
      label: '未记录平台',
    });
  });

  it('aggregates active and interviewing candidates by JD', () => {
    const stats = aggregateCandidateStats([
      {
        jobDescriptionId: 'jd-1',
        decisionAction: 'chat',
        decisionPriority: 'high',
        interviewStage: 'to_contact',
      },
      {
        jobDescriptionId: 'jd-1',
        decisionAction: 'collect',
        decisionPriority: 'medium',
        interviewStage: 'interviewing',
      },
      {
        jobDescriptionId: 'jd-1',
        decisionAction: 'skip',
        decisionPriority: 'low',
        interviewStage: 'rejected',
      },
    ]);

    expect(stats.get('jd-1')).toEqual({
      totalCandidates: 3,
      activeCandidates: 2,
      interviewingCandidates: 1,
      highPriorityCandidates: 1,
      followUpCandidates: 2,
    });
  });
});
```

- [ ] **Step 2: Run helper tests to verify they fail**

Run:

```bash
bunx jest src/lib/dashboard/overview.test.ts --runInBand --coverage=false
```

Expected: FAIL because `src/lib/dashboard/overview.ts` does not exist.

- [ ] **Step 3: Add dashboard DTOs and constants**

Create `src/lib/dashboard/types.ts`:

```ts
import type { JDStatus, JobDescriptionDto } from '@/types';
import type {
  CandidateDecisionAction,
  CandidateDecisionPriority,
  CandidateInterviewStage,
} from '@/lib/candidate-screening/types';
import type { PublishPlatform, PublishTaskStatus } from '@/lib/jd-publishing/types';

export const DASHBOARD_PLATFORM_ALL = 'all';
export const DASHBOARD_PLATFORM_UNTRACKED = 'untracked';

export type DashboardPlatformFilter =
  | typeof DASHBOARD_PLATFORM_ALL
  | PublishPlatform
  | typeof DASHBOARD_PLATFORM_UNTRACKED;

export type DashboardFilters = {
  status?: JDStatus;
  platform?: DashboardPlatformFilter;
  limit: number;
};

export type DashboardCandidateSignal = {
  jobDescriptionId: string;
  decisionAction: CandidateDecisionAction;
  decisionPriority: CandidateDecisionPriority;
  interviewStage: CandidateInterviewStage;
};

export type DashboardCandidateStats = {
  totalCandidates: number;
  activeCandidates: number;
  interviewingCandidates: number;
  highPriorityCandidates: number;
  followUpCandidates: number;
};

export type DashboardPublishTaskSummary = {
  id: string;
  jobDescriptionId: string;
  platform: DashboardPlatformFilter;
  status: PublishTaskStatus;
  errorMessage: string | null;
  createdAt: string;
  updatedAt: string;
};

export type DashboardPlatformSummary = {
  platform: DashboardPlatformFilter;
  label: string;
  recruitingJobs: number;
  failedJobs: number;
};

export type DashboardStatusSummary = {
  status: JDStatus;
  label: string;
  count: number;
};

export type DashboardJobDto = {
  id: string;
  department: string;
  position: string;
  title: string;
  status: JDStatus;
  salaryRange: string | null;
  workLocations: string[];
  updatedAt: string;
  platform: DashboardPlatformSummary;
  candidateStats: DashboardCandidateStats;
  latestTask: DashboardPublishTaskSummary | null;
};

export type DashboardOverviewDto = {
  summary: {
    recruitingJobs: number;
    readyToPublishJobs: number;
    publishingJobs: number;
    publishFailedJobs: number;
    activeCandidates: number;
  };
  statusCounts: DashboardStatusSummary[];
  platforms: DashboardPlatformSummary[];
  jobs: DashboardJobDto[];
  recentTasks: DashboardPublishTaskSummary[];
  filters: DashboardFilters;
};

export type DashboardJobSource = Pick<
  JobDescriptionDto,
  'id' | 'department' | 'position' | 'status' | 'salaryRange' | 'workLocations' | 'updatedAt' | 'content'
>;
```

- [ ] **Step 4: Implement pure helpers and exported API stub**

Create `src/lib/dashboard/overview.ts` with pure helpers and a temporary `getDashboardOverview` stub:

```ts
import { prisma } from '@/lib/prisma';
import { JD_STATUSES, type JDStatus } from '@/types';
import type {
  DashboardCandidateSignal,
  DashboardCandidateStats,
  DashboardFilters,
  DashboardJobSource,
  DashboardOverviewDto,
  DashboardPlatformFilter,
  DashboardPlatformSummary,
  DashboardPublishTaskSummary,
} from './types';
import {
  DASHBOARD_PLATFORM_ALL,
  DASHBOARD_PLATFORM_UNTRACKED,
} from './types';

const MAX_LIMIT = 100;
const DEFAULT_LIMIT = 25;

const statusLabels: Record<JDStatus, string> = {
  created: '已创建',
  ready_to_publish: '待发布',
  publishing: '发布中',
  published: '招聘中',
  publish_failed: '发布异常',
  offline: '已下线',
  archived: '已归档',
};

const platformLabels: Record<string, string> = {
  [DASHBOARD_PLATFORM_ALL]: '全部平台',
  'boss-like': 'BOSS-like',
  [DASHBOARD_PLATFORM_UNTRACKED]: '未记录平台',
};

function parseLimit(value: string | null): number {
  if (!value) return DEFAULT_LIMIT;
  const parsed = Number(value);
  if (!Number.isFinite(parsed)) return DEFAULT_LIMIT;
  return Math.max(1, Math.min(MAX_LIMIT, Math.trunc(parsed)));
}

export function labelForStatus(status: JDStatus): string {
  return statusLabels[status] ?? status;
}

export function labelForPlatform(platform: DashboardPlatformFilter): string {
  return platformLabels[platform] ?? platform;
}

export function parseDashboardFilters(searchParams: URLSearchParams): DashboardFilters {
  const statusParam = searchParams.get('status');
  if (statusParam && !JD_STATUSES.includes(statusParam as JDStatus)) {
    throw new Error('status is invalid');
  }

  const platformParam = searchParams.get('platform') as DashboardPlatformFilter | null;
  const platform = platformParam || undefined;

  return {
    status: statusParam ? (statusParam as JDStatus) : undefined,
    platform,
    limit: parseLimit(searchParams.get('limit')),
  };
}

export function isActiveDashboardCandidate(signal: DashboardCandidateSignal): boolean {
  return (
    signal.decisionAction !== 'skip' &&
    signal.interviewStage !== 'rejected' &&
    signal.interviewStage !== 'withdrawn'
  );
}

export function isInterviewingDashboardCandidate(signal: DashboardCandidateSignal): boolean {
  return (
    signal.interviewStage === 'phone_screen' ||
    signal.interviewStage === 'interviewing' ||
    signal.interviewStage === 'offer'
  );
}

function emptyCandidateStats(): DashboardCandidateStats {
  return {
    totalCandidates: 0,
    activeCandidates: 0,
    interviewingCandidates: 0,
    highPriorityCandidates: 0,
    followUpCandidates: 0,
  };
}

export function aggregateCandidateStats(
  signals: DashboardCandidateSignal[],
): Map<string, DashboardCandidateStats> {
  const statsByJob = new Map<string, DashboardCandidateStats>();

  for (const signal of signals) {
    const current = statsByJob.get(signal.jobDescriptionId) ?? emptyCandidateStats();
    const isActive = isActiveDashboardCandidate(signal);
    statsByJob.set(signal.jobDescriptionId, {
      totalCandidates: current.totalCandidates + 1,
      activeCandidates: current.activeCandidates + (isActive ? 1 : 0),
      interviewingCandidates:
        current.interviewingCandidates + (isInterviewingDashboardCandidate(signal) ? 1 : 0),
      highPriorityCandidates:
        current.highPriorityCandidates + (signal.decisionPriority === 'high' ? 1 : 0),
      followUpCandidates:
        current.followUpCandidates +
        (isActive && (signal.decisionAction === 'chat' || signal.decisionAction === 'collect')
          ? 1
          : 0),
    });
  }

  return statsByJob;
}

export function inferDashboardPlatform(
  jobStatus: JDStatus,
  tasks: DashboardPublishTaskSummary[],
): DashboardPlatformSummary {
  const successfulTask = tasks.find((task) => task.status === 'success');
  if (successfulTask) {
    return {
      platform: successfulTask.platform,
      label: labelForPlatform(successfulTask.platform),
      recruitingJobs: jobStatus === 'published' ? 1 : 0,
      failedJobs: tasks.some((task) => task.status === 'failed') ? 1 : 0,
    };
  }

  const failedTask = tasks.find((task) => task.status === 'failed');
  if (failedTask) {
    return {
      platform: failedTask.platform,
      label: labelForPlatform(failedTask.platform),
      recruitingJobs: 0,
      failedJobs: 1,
    };
  }

  return {
    platform: DASHBOARD_PLATFORM_UNTRACKED,
    label: labelForPlatform(DASHBOARD_PLATFORM_UNTRACKED),
    recruitingJobs: jobStatus === 'published' ? 1 : 0,
    failedJobs: 0,
  };
}

export function readDashboardJobTitle(job: DashboardJobSource): string {
  return job.content.title?.trim() || job.position;
}

export async function getDashboardOverview(params: {
  userId: string;
  filters: DashboardFilters;
}): Promise<DashboardOverviewDto> {
  await prisma.$connect().catch(() => undefined);
  return {
    summary: {
      recruitingJobs: 0,
      readyToPublishJobs: 0,
      publishingJobs: 0,
      publishFailedJobs: 0,
      activeCandidates: 0,
    },
    statusCounts: [],
    platforms: [],
    jobs: [],
    recentTasks: [],
    filters: params.filters,
  };
}
```

- [ ] **Step 5: Run helper tests to verify they pass**

Run:

```bash
bunx jest src/lib/dashboard/overview.test.ts --runInBand --coverage=false
```

Expected: PASS for the pure helper tests.

- [ ] **Step 6: Commit Task 1**

```bash
git add src/lib/dashboard/types.ts src/lib/dashboard/overview.ts src/lib/dashboard/overview.test.ts
git commit -m "test: add dashboard overview helpers"
```

---

## Task 2: Prisma Aggregation And Dashboard API

**Files:**
- Modify: `src/lib/dashboard/overview.ts`
- Create: `src/app/api/dashboard/route.ts`
- Create: `src/app/api/dashboard/route.test.ts`
- Modify: `src/lib/dashboard/overview.test.ts`

- [ ] **Step 1: Extend overview tests for Prisma aggregation**

Append to `src/lib/dashboard/overview.test.ts`:

```ts
describe('getDashboardOverview', () => {
  beforeEach(() => {
    prismaMock.jobDescription.findMany.mockReset();
    prismaMock.jobDescription.groupBy.mockReset();
    prismaMock.jobPublishTask.findMany.mockReset();
    prismaMock.candidateScreeningResult.findMany.mockReset();
    prismaMock.$connect.mockReset();
  });

  it('returns status summaries, platform summaries, jobs and recent tasks', async () => {
    const { getDashboardOverview } = await import('./overview');
    prismaMock.jobDescription.groupBy.mockResolvedValueOnce([
      { status: 'published', _count: { _all: 2 } },
      { status: 'ready_to_publish', _count: { _all: 1 } },
      { status: 'publishing', _count: { _all: 1 } },
      { status: 'publish_failed', _count: { _all: 1 } },
    ]);
    prismaMock.jobDescription.findMany.mockResolvedValueOnce([
      {
        id: 'jd-1',
        userId: 'u1',
        department: '技术部',
        position: 'AI 应用工程师',
        positionDescription: 'Build AI hiring tools',
        salaryRange: '30-50K',
        workLocations: ['上海'],
        tone: 'tech',
        status: 'published',
        content: {
          title: 'AI 应用工程师',
          summary: '负责 AI 招聘产品',
          responsibilities: [],
          requirements: [],
          bonus: [],
          highlights: [],
        },
        evaluation: null,
        generationMeta: null,
        createdAt: new Date('2026-07-06T08:00:00.000Z'),
        updatedAt: new Date('2026-07-06T10:00:00.000Z'),
      },
    ]);
    prismaMock.jobPublishTask.findMany.mockResolvedValueOnce([
      {
        id: 'task-1',
        userId: 'u1',
        jobDescriptionId: 'jd-1',
        skillId: 'skill-1',
        platform: 'boss-like',
        input: {},
        currentStep: null,
        status: 'success',
        errorMessage: null,
        trace: null,
        createdAt: new Date('2026-07-06T09:00:00.000Z'),
        updatedAt: new Date('2026-07-06T09:01:00.000Z'),
      },
    ]);
    prismaMock.candidateScreeningResult.findMany.mockResolvedValueOnce([
      {
        jobDescriptionId: 'jd-1',
        decisionAction: 'chat',
        decisionPriority: 'high',
        interviewStage: 'to_contact',
      },
    ]);

    const overview = await getDashboardOverview({
      userId: 'u1',
      filters: { status: 'published', limit: 25 },
    });

    expect(overview.summary).toEqual({
      recruitingJobs: 2,
      readyToPublishJobs: 1,
      publishingJobs: 1,
      publishFailedJobs: 1,
      activeCandidates: 1,
    });
    expect(overview.jobs[0]).toEqual(
      expect.objectContaining({
        id: 'jd-1',
        platform: expect.objectContaining({ platform: 'boss-like', label: 'BOSS-like' }),
        candidateStats: expect.objectContaining({ totalCandidates: 1, activeCandidates: 1 }),
      }),
    );
    expect(overview.recentTasks[0]).toEqual(
      expect.objectContaining({
        id: 'task-1',
        platform: 'boss-like',
        status: 'success',
      }),
    );
  });
});
```

- [ ] **Step 2: Run overview tests to verify aggregation fails**

Run:

```bash
bunx jest src/lib/dashboard/overview.test.ts --runInBand --coverage=false
```

Expected: FAIL because `getDashboardOverview` returns stubbed empty data.

- [ ] **Step 3: Implement Prisma-backed aggregation**

Replace the stubbed `getDashboardOverview` in `src/lib/dashboard/overview.ts` with:

```ts
type DashboardJobRow = DashboardJobSource & {
  userId: string;
  positionDescription: string;
  tone: string;
  evaluation: unknown | null;
  generationMeta: unknown | null;
  createdAt: Date | string;
  updatedAt: Date | string;
};

type DashboardTaskRow = {
  id: string;
  jobDescriptionId: string;
  platform: string;
  status: string;
  errorMessage: string | null;
  createdAt: Date | string;
  updatedAt: Date | string;
};

type DashboardCandidateRow = DashboardCandidateSignal;

function iso(value: Date | string): string {
  return value instanceof Date ? value.toISOString() : value;
}

function mapTask(row: DashboardTaskRow): DashboardPublishTaskSummary {
  return {
    id: row.id,
    jobDescriptionId: row.jobDescriptionId,
    platform: row.platform as DashboardPlatformFilter,
    status: row.status as DashboardPublishTaskSummary['status'],
    errorMessage: row.errorMessage,
    createdAt: iso(row.createdAt),
    updatedAt: iso(row.updatedAt),
  };
}

function emptyStats(): DashboardCandidateStats {
  return {
    totalCandidates: 0,
    activeCandidates: 0,
    interviewingCandidates: 0,
    highPriorityCandidates: 0,
    followUpCandidates: 0,
  };
}

function countForStatus(
  rows: Array<{ status: string; _count: { _all: number } }>,
  status: JDStatus,
): number {
  return rows.find((row) => row.status === status)?._count._all ?? 0;
}

function groupTasksByJob(tasks: DashboardPublishTaskSummary[]): Map<string, DashboardPublishTaskSummary[]> {
  const grouped = new Map<string, DashboardPublishTaskSummary[]>();
  for (const task of tasks) {
    grouped.set(task.jobDescriptionId, [...(grouped.get(task.jobDescriptionId) ?? []), task]);
  }
  return grouped;
}

function applyPlatformFilter(
  jobs: DashboardJobDto[],
  platform: DashboardPlatformFilter | undefined,
): DashboardJobDto[] {
  if (!platform || platform === DASHBOARD_PLATFORM_ALL) {
    return jobs;
  }
  return jobs.filter((job) => job.platform.platform === platform);
}

function aggregatePlatformSummaries(jobs: DashboardJobDto[]): DashboardPlatformSummary[] {
  const summaries = new Map<string, DashboardPlatformSummary>();
  summaries.set(DASHBOARD_PLATFORM_ALL, {
    platform: DASHBOARD_PLATFORM_ALL,
    label: labelForPlatform(DASHBOARD_PLATFORM_ALL),
    recruitingJobs: jobs.filter((job) => job.status === 'published').length,
    failedJobs: jobs.filter((job) => job.status === 'publish_failed').length,
  });

  for (const job of jobs) {
    const current = summaries.get(job.platform.platform) ?? {
      platform: job.platform.platform,
      label: job.platform.label,
      recruitingJobs: 0,
      failedJobs: 0,
    };
    summaries.set(job.platform.platform, {
      ...current,
      recruitingJobs: current.recruitingJobs + (job.status === 'published' ? 1 : 0),
      failedJobs: current.failedJobs + (job.status === 'publish_failed' ? 1 : 0),
    });
  }

  return [...summaries.values()];
}

export async function getDashboardOverview(params: {
  userId: string;
  filters: DashboardFilters;
}): Promise<DashboardOverviewDto> {
  const where = {
    userId: params.userId,
    ...(params.filters.status ? { status: params.filters.status } : {}),
  };

  const [statusRows, jobRows, taskRows, candidateRows] = await Promise.all([
    prisma.jobDescription.groupBy({
      by: ['status'],
      where: { userId: params.userId },
      _count: { _all: true },
    }),
    prisma.jobDescription.findMany({
      where,
      orderBy: { updatedAt: 'desc' },
      take: params.filters.limit,
    }),
    prisma.jobPublishTask.findMany({
      where: { userId: params.userId },
      orderBy: { createdAt: 'desc' },
      take: 200,
    }),
    prisma.candidateScreeningResult.findMany({
      where: { userId: params.userId },
      select: {
        jobDescriptionId: true,
        decisionAction: true,
        decisionPriority: true,
        interviewStage: true,
      },
      take: 1000,
    }),
  ]);

  const tasks = (taskRows as DashboardTaskRow[]).map(mapTask);
  const tasksByJob = groupTasksByJob(tasks);
  const candidateStats = aggregateCandidateStats(candidateRows as DashboardCandidateRow[]);

  const allJobs = (jobRows as DashboardJobRow[]).map((job): DashboardJobDto => {
    const jobTasks = tasksByJob.get(job.id) ?? [];
    return {
      id: job.id,
      department: job.department,
      position: job.position,
      title: readDashboardJobTitle(job),
      status: job.status,
      salaryRange: job.salaryRange,
      workLocations: job.workLocations,
      updatedAt: iso(job.updatedAt),
      platform: inferDashboardPlatform(job.status, jobTasks),
      candidateStats: candidateStats.get(job.id) ?? emptyStats(),
      latestTask: jobTasks[0] ?? null,
    };
  });

  const jobs = applyPlatformFilter(allJobs, params.filters.platform);
  const typedStatusRows = statusRows as Array<{ status: string; _count: { _all: number } }>;

  return {
    summary: {
      recruitingJobs: countForStatus(typedStatusRows, 'published'),
      readyToPublishJobs: countForStatus(typedStatusRows, 'ready_to_publish'),
      publishingJobs: countForStatus(typedStatusRows, 'publishing'),
      publishFailedJobs: countForStatus(typedStatusRows, 'publish_failed'),
      activeCandidates: [...candidateStats.values()].reduce(
        (sum, item) => sum + item.activeCandidates,
        0,
      ),
    },
    statusCounts: typedStatusRows.map((row) => ({
      status: row.status as JDStatus,
      label: labelForStatus(row.status as JDStatus),
      count: row._count._all,
    })),
    platforms: aggregatePlatformSummaries(allJobs),
    jobs,
    recentTasks: tasks.slice(0, 8),
    filters: params.filters,
  };
}
```

- [ ] **Step 4: Run overview tests to verify they pass**

Run:

```bash
bunx jest src/lib/dashboard/overview.test.ts --runInBand --coverage=false
```

Expected: PASS.

- [ ] **Step 5: Write failing dashboard API tests**

Create `src/app/api/dashboard/route.test.ts`:

```ts
/**
 * @jest-environment node
 */
import { GET } from './route';
import { getDashboardOverview, parseDashboardFilters } from '@/lib/dashboard/overview';

const requireAuthMock = jest.fn();

jest.mock('next/server', () => ({
  NextResponse: {
    json: (body: unknown, init?: { status?: number }) => ({
      status: init?.status ?? 200,
      json: async () => body,
    }),
  },
}));

jest.mock('@/lib/auth/session', () => ({
  requireAuth: (...args: unknown[]) => requireAuthMock(...args),
  UnauthorizedError: class UnauthorizedError extends Error {
    status = 401;
    constructor(message = 'Unauthorized') {
      super(message);
      this.name = 'UnauthorizedError';
    }
  },
}));

jest.mock('@/lib/dashboard/overview', () => ({
  getDashboardOverview: jest.fn(),
  parseDashboardFilters: jest.fn(),
}));

const getDashboardOverviewMock = getDashboardOverview as jest.MockedFunction<
  typeof getDashboardOverview
>;
const parseDashboardFiltersMock = parseDashboardFilters as jest.MockedFunction<
  typeof parseDashboardFilters
>;

describe('GET /api/dashboard', () => {
  beforeEach(() => {
    requireAuthMock.mockReset();
    getDashboardOverviewMock.mockReset();
    parseDashboardFiltersMock.mockReset();
    requireAuthMock.mockResolvedValue({ user: { id: 'u1' } });
    parseDashboardFiltersMock.mockReturnValue({
      status: 'published',
      platform: 'boss-like',
      limit: 25,
    });
    getDashboardOverviewMock.mockResolvedValue({
      summary: {
        recruitingJobs: 1,
        readyToPublishJobs: 0,
        publishingJobs: 0,
        publishFailedJobs: 0,
        activeCandidates: 2,
      },
      statusCounts: [],
      platforms: [],
      jobs: [],
      recentTasks: [],
      filters: { status: 'published', platform: 'boss-like', limit: 25 },
    });
  });

  it('returns dashboard overview for authenticated users', async () => {
    const response = await GET(
      new Request('http://localhost/api/dashboard?status=published&platform=boss-like'),
    );
    const body = await response.json();

    expect(response.status).toBe(200);
    expect(body.summary.recruitingJobs).toBe(1);
    expect(getDashboardOverviewMock).toHaveBeenCalledWith({
      userId: 'u1',
      filters: { status: 'published', platform: 'boss-like', limit: 25 },
    });
  });

  it('returns 400 for invalid filters', async () => {
    parseDashboardFiltersMock.mockImplementationOnce(() => {
      throw new Error('status is invalid');
    });

    const response = await GET(new Request('http://localhost/api/dashboard?status=paused'));
    const body = await response.json();

    expect(response.status).toBe(400);
    expect(body.error).toBe('status is invalid');
  });

  it('returns 401 when auth is missing', async () => {
    requireAuthMock.mockRejectedValueOnce(Object.assign(new Error('Unauthorized'), { status: 401 }));

    const response = await GET(new Request('http://localhost/api/dashboard'));
    const body = await response.json();

    expect(response.status).toBe(401);
    expect(body.error).toBe('Unauthorized');
  });
});
```

- [ ] **Step 6: Run API tests to verify they fail**

Run:

```bash
bunx jest src/app/api/dashboard/route.test.ts --runInBand --coverage=false
```

Expected: FAIL because `src/app/api/dashboard/route.ts` does not exist.

- [ ] **Step 7: Implement dashboard API route**

Create `src/app/api/dashboard/route.ts`:

```ts
import { NextResponse } from 'next/server';
import { requireAuth, UnauthorizedError } from '@/lib/auth/session';
import { getDashboardOverview, parseDashboardFilters } from '@/lib/dashboard/overview';

function errorResponse(error: unknown) {
  if (
    error instanceof UnauthorizedError ||
    (error instanceof Error && error.name === 'UnauthorizedError')
  ) {
    const status = error instanceof UnauthorizedError ? error.status : 401;
    return NextResponse.json({ error: error.message }, { status });
  }

  const message = error instanceof Error ? error.message : 'Unknown server error';
  if (message === 'status is invalid') {
    return NextResponse.json({ error: message }, { status: 400 });
  }

  return NextResponse.json({ error: message }, { status: 500 });
}

export async function GET(request: Request) {
  try {
    const auth = await requireAuth();
    const { searchParams } = new URL(request.url);
    const filters = parseDashboardFilters(searchParams);
    const overview = await getDashboardOverview({
      userId: auth.user.id,
      filters,
    });

    return NextResponse.json(overview);
  } catch (error) {
    return errorResponse(error);
  }
}
```

- [ ] **Step 8: Run overview and API tests**

Run:

```bash
bunx jest src/lib/dashboard/overview.test.ts src/app/api/dashboard/route.test.ts --runInBand --coverage=false
```

Expected: PASS.

- [ ] **Step 9: Commit Task 2**

```bash
git add src/lib/dashboard src/app/api/dashboard
git commit -m "feat: add dashboard overview api"
```

---

## Task 3: Dashboard Client UI And Homepage Entry

**Files:**
- Create: `src/lib/dashboard/client.ts`
- Create: `src/components/dashboard/dashboard-page.tsx`
- Create: `src/components/dashboard/summary-cards.tsx`
- Create: `src/components/dashboard/platform-filter.tsx`
- Create: `src/components/dashboard/job-list.tsx`
- Create: `src/components/dashboard/action-queue.tsx`
- Modify: `src/app/page.tsx`
- Modify: `src/app/page.test.tsx`
- Modify: `tests/unit/pages/Home.test.tsx`

- [ ] **Step 1: Write failing homepage tests**

Replace `src/app/page.test.tsx` with:

```ts
import { render, screen } from '@testing-library/react';
import Home from './page';
import { getServerAuthSession } from '@/lib/auth/session';

jest.mock('@/lib/auth/session', () => ({
  getServerAuthSession: jest.fn(),
}));

jest.mock('@/components/auth/sign-in-button', () => ({
  SignInButton: () => <a href="/auth/signin">登录</a>,
}));

jest.mock('@/components/dashboard/dashboard-page', () => ({
  DashboardPage: () => <section aria-label="招聘岗位运营台">工作台内容</section>,
}));

const getServerAuthSessionMock = getServerAuthSession as jest.MockedFunction<
  typeof getServerAuthSession
>;

describe('Home page', () => {
  beforeEach(() => {
    getServerAuthSessionMock.mockReset();
  });

  it('renders sign-in guidance when unauthenticated', async () => {
    getServerAuthSessionMock.mockResolvedValueOnce(null);

    render(await Home());

    expect(screen.getByRole('heading', { name: /请先登录后继续/i })).toBeInTheDocument();
    expect(screen.getByRole('link', { name: /登录/i })).toHaveAttribute('href', '/auth/signin');
    expect(screen.queryByText(/招聘全流程/)).not.toBeInTheDocument();
  });

  it('renders dashboard when authenticated', async () => {
    getServerAuthSessionMock.mockResolvedValueOnce({
      user: { id: 'u1', username: 'alice', name: 'Alice', email: null, image: null },
    });

    render(await Home());

    expect(screen.getByRole('region', { name: /招聘岗位运营台/i })).toBeInTheDocument();
  });
});
```

Replace `tests/unit/pages/Home.test.tsx` with the same two tests, importing `Home` from `@/app/page`.

- [ ] **Step 2: Run homepage tests to verify they fail**

Run:

```bash
bunx jest src/app/page.test.tsx tests/unit/pages/Home.test.tsx --runInBand --coverage=false
```

Expected: FAIL because the current homepage renders marketing content and `DashboardPage` does not exist.

- [ ] **Step 3: Add dashboard client fetch wrapper**

Create `src/lib/dashboard/client.ts`:

```ts
import type { DashboardOverviewDto } from './types';

async function readJson<T>(response: Response): Promise<T & { error?: string }> {
  return (await response.json().catch(() => ({}))) as T & { error?: string };
}

export async function fetchDashboardOverview(query: string): Promise<DashboardOverviewDto> {
  const response = await fetch(`/api/dashboard${query ? `?${query}` : ''}`);
  const data = await readJson<Partial<DashboardOverviewDto>>(response);

  if (
    !response.ok ||
    !data.summary ||
    !Array.isArray(data.statusCounts) ||
    !Array.isArray(data.platforms) ||
    !Array.isArray(data.jobs) ||
    !Array.isArray(data.recentTasks) ||
    !data.filters
  ) {
    throw new Error(data.error || '加载工作台失败');
  }

  return data as DashboardOverviewDto;
}
```

- [ ] **Step 4: Add summary cards component**

Create `src/components/dashboard/summary-cards.tsx`:

```tsx
import Link from 'next/link';
import { AlertTriangle, BriefcaseBusiness, Clock3, Send, UsersRound } from 'lucide-react';
import type { DashboardOverviewDto } from '@/lib/dashboard/types';

type SummaryCard = {
  label: string;
  value: number;
  href: string;
  tone: string;
  Icon: typeof BriefcaseBusiness;
};

export function SummaryCards({ summary }: { summary: DashboardOverviewDto['summary'] }) {
  const cards: SummaryCard[] = [
    {
      label: '招聘中',
      value: summary.recruitingJobs,
      href: '/?status=published',
      tone: 'text-emerald-700 bg-emerald-50 border-emerald-200 dark:bg-emerald-950/35 dark:border-emerald-900 dark:text-emerald-200',
      Icon: BriefcaseBusiness,
    },
    {
      label: '待发布',
      value: summary.readyToPublishJobs,
      href: '/?status=ready_to_publish',
      tone: 'text-sky-700 bg-sky-50 border-sky-200 dark:bg-sky-950/35 dark:border-sky-900 dark:text-sky-200',
      Icon: Send,
    },
    {
      label: '发布中',
      value: summary.publishingJobs,
      href: '/?status=publishing',
      tone: 'text-amber-700 bg-amber-50 border-amber-200 dark:bg-amber-950/35 dark:border-amber-900 dark:text-amber-200',
      Icon: Clock3,
    },
    {
      label: '发布异常',
      value: summary.publishFailedJobs,
      href: '/?status=publish_failed',
      tone: 'text-rose-700 bg-rose-50 border-rose-200 dark:bg-rose-950/35 dark:border-rose-900 dark:text-rose-200',
      Icon: AlertTriangle,
    },
    {
      label: '待跟进候选人',
      value: summary.activeCandidates,
      href: '/jd-generator/candidates',
      tone: 'text-violet-700 bg-violet-50 border-violet-200 dark:bg-violet-950/35 dark:border-violet-900 dark:text-violet-200',
      Icon: UsersRound,
    },
  ];

  return (
    <section aria-label="工作台指标" className="grid gap-3 sm:grid-cols-2 xl:grid-cols-5">
      {cards.map(({ Icon, ...card }) => (
        <Link
          key={card.label}
          href={card.href}
          className={`rounded-lg border p-4 transition-colors hover:border-primary/45 ${card.tone}`}
        >
          <div className="flex items-center justify-between gap-3">
            <span className="text-sm font-medium">{card.label}</span>
            <Icon className="h-4 w-4" aria-hidden />
          </div>
          <div className="mt-3 text-3xl font-semibold tracking-normal">{card.value}</div>
        </Link>
      ))}
    </section>
  );
}
```

- [ ] **Step 5: Add platform filter component**

Create `src/components/dashboard/platform-filter.tsx`:

```tsx
import Link from 'next/link';
import { LayoutDashboard } from 'lucide-react';
import type { DashboardOverviewDto, DashboardPlatformFilter } from '@/lib/dashboard/types';
import { DASHBOARD_PLATFORM_ALL } from '@/lib/dashboard/types';
import type { JDStatus } from '@/types';

function buildHref(params: { status?: JDStatus; platform?: DashboardPlatformFilter }) {
  const search = new URLSearchParams();
  if (params.status) search.set('status', params.status);
  if (params.platform && params.platform !== DASHBOARD_PLATFORM_ALL) {
    search.set('platform', params.platform);
  }
  const query = search.toString();
  return query ? `/?${query}` : '/';
}

export function PlatformFilter({
  overview,
}: {
  overview: Pick<DashboardOverviewDto, 'platforms' | 'statusCounts' | 'filters'>;
}) {
  return (
    <aside className="border-border rounded-lg border p-4">
      <div className="mb-3 flex items-center gap-2 text-sm font-medium">
        <LayoutDashboard className="text-muted-foreground h-4 w-4" aria-hidden />
        平台与状态
      </div>
      <div className="space-y-2">
        {overview.platforms.map((platform) => (
          <Link
            key={platform.platform}
            href={buildHref({ status: overview.filters.status, platform: platform.platform })}
            className="border-border hover:border-primary/35 hover:bg-primary/5 flex items-center justify-between rounded-md border px-3 py-2 text-sm"
          >
            <span>{platform.label}</span>
            <span className="text-muted-foreground">{platform.recruitingJobs}</span>
          </Link>
        ))}
      </div>
      <div className="border-border mt-4 border-t pt-4">
        <div className="text-muted-foreground mb-2 text-xs font-semibold tracking-normal uppercase">
          状态
        </div>
        <div className="space-y-2">
          {overview.statusCounts.map((status) => (
            <Link
              key={status.status}
              href={buildHref({ status: status.status, platform: overview.filters.platform })}
              className="border-border hover:border-primary/35 hover:bg-primary/5 flex items-center justify-between rounded-md border px-3 py-2 text-sm"
            >
              <span>{status.label}</span>
              <span className="text-muted-foreground">{status.count}</span>
            </Link>
          ))}
        </div>
      </div>
    </aside>
  );
}
```

- [ ] **Step 6: Add job list component**

Create `src/components/dashboard/job-list.tsx`:

```tsx
import Link from 'next/link';
import { AlertTriangle, Eye, UsersRound } from 'lucide-react';
import { Button, Chip } from '@/components/ui';
import type { DashboardJobDto, DashboardOverviewDto } from '@/lib/dashboard/types';

function formatUpdatedAt(value: string) {
  const date = new Date(value);
  if (Number.isNaN(date.getTime())) return '更新时间未知';
  return new Intl.DateTimeFormat('zh-CN', {
    dateStyle: 'medium',
    timeStyle: 'short',
  }).format(date);
}

function statusTone(status: DashboardJobDto['status']) {
  if (status === 'published') return 'border-emerald-200 bg-emerald-50 text-emerald-700';
  if (status === 'publish_failed') return 'border-rose-200 bg-rose-50 text-rose-700';
  if (status === 'publishing') return 'border-amber-200 bg-amber-50 text-amber-700';
  return 'border-sky-200 bg-sky-50 text-sky-700';
}

export function DashboardJobList({ overview }: { overview: DashboardOverviewDto }) {
  return (
    <section className="border-border overflow-hidden rounded-lg border">
      <div className="border-border flex items-center justify-between border-b px-4 py-3">
        <div>
          <h2 className="text-foreground text-sm font-semibold">JD 列表</h2>
          <p className="text-muted-foreground mt-1 text-xs">
            当前筛选：{overview.filters.status ?? '全部状态'} · {overview.filters.platform ?? '全部平台'}
          </p>
        </div>
        <div className="text-muted-foreground text-xs">{overview.jobs.length} 条</div>
      </div>

      {overview.jobs.length === 0 ? (
        <div className="px-4 py-12 text-center">
          <div className="text-foreground text-sm font-medium">当前筛选下没有 JD</div>
          <p className="text-muted-foreground mt-1 text-sm">可以切换状态，或新建一条 JD。</p>
          <Button as={Link} className="mt-4" color="primary" href="/jd-generator/new">
            新建 JD
          </Button>
        </div>
      ) : (
        <div className="divide-border divide-y">
          {overview.jobs.map((job) => (
            <article
              key={job.id}
              className="grid gap-3 px-4 py-4 xl:grid-cols-[minmax(0,1fr)_150px_150px_120px] xl:items-center"
            >
              <div className="min-w-0">
                <div className="flex min-w-0 flex-wrap items-center gap-2">
                  <Link
                    href={`/jd-generator/${job.id}`}
                    className="text-foreground hover:text-primary min-w-0 truncate text-sm font-semibold"
                  >
                    {job.position}
                  </Link>
                  {job.status === 'publish_failed' ? (
                    <AlertTriangle className="h-4 w-4 text-rose-600" aria-label="发布异常" />
                  ) : null}
                </div>
                <div className="text-muted-foreground mt-1 flex min-w-0 flex-wrap gap-x-3 gap-y-1 text-xs">
                  <span>{job.department}</span>
                  <span>{job.title}</span>
                  <span>{job.platform.label}</span>
                  {job.salaryRange ? <span>{job.salaryRange}</span> : null}
                </div>
              </div>

              <Chip className={`border text-xs ${statusTone(job.status)}`} size="sm" variant="flat">
                {job.status}
              </Chip>

              <Link
                href={`/jd-generator/${job.id}/candidates`}
                className="text-foreground hover:text-primary inline-flex items-center gap-2 text-sm"
              >
                <UsersRound className="h-4 w-4" aria-hidden />
                {job.candidateStats.totalCandidates} 人
              </Link>

              <div className="flex items-center justify-between gap-3 xl:justify-end">
                <span className="text-muted-foreground text-xs">{formatUpdatedAt(job.updatedAt)}</span>
                <Button
                  as={Link}
                  className="gap-2"
                  href={`/jd-generator/${job.id}`}
                  size="sm"
                  variant="light"
                >
                  <Eye className="h-4 w-4" aria-hidden />
                  查看
                </Button>
              </div>
            </article>
          ))}
        </div>
      )}
    </section>
  );
}
```

- [ ] **Step 7: Add action queue component**

Create `src/components/dashboard/action-queue.tsx`:

```tsx
import Link from 'next/link';
import { AlertTriangle, Clock3, Send } from 'lucide-react';
import type { DashboardOverviewDto } from '@/lib/dashboard/types';

export function ActionQueue({ overview }: { overview: DashboardOverviewDto }) {
  const failedJobs = overview.jobs.filter((job) => job.status === 'publish_failed');
  const readyJobs = overview.jobs.filter((job) => job.status === 'ready_to_publish');
  const publishingTasks = overview.recentTasks.filter((task) => task.status === 'running');

  return (
    <aside className="border-border rounded-lg border p-4">
      <div className="mb-3 text-sm font-semibold">待处理</div>
      <div className="space-y-2">
        <Link
          href="/?status=publish_failed"
          className="flex items-center justify-between rounded-md border border-rose-200 bg-rose-50 px-3 py-2 text-sm text-rose-700 dark:border-rose-900 dark:bg-rose-950/35 dark:text-rose-200"
        >
          <span className="inline-flex items-center gap-2">
            <AlertTriangle className="h-4 w-4" aria-hidden />
            发布失败
          </span>
          <span>{failedJobs.length}</span>
        </Link>
        <Link
          href="/?status=ready_to_publish"
          className="flex items-center justify-between rounded-md border border-sky-200 bg-sky-50 px-3 py-2 text-sm text-sky-700 dark:border-sky-900 dark:bg-sky-950/35 dark:text-sky-200"
        >
          <span className="inline-flex items-center gap-2">
            <Send className="h-4 w-4" aria-hidden />
            待发布
          </span>
          <span>{readyJobs.length}</span>
        </Link>
        <div className="flex items-center justify-between rounded-md border border-amber-200 bg-amber-50 px-3 py-2 text-sm text-amber-700 dark:border-amber-900 dark:bg-amber-950/35 dark:text-amber-200">
          <span className="inline-flex items-center gap-2">
            <Clock3 className="h-4 w-4" aria-hidden />
            发布中任务
          </span>
          <span>{publishingTasks.length}</span>
        </div>
      </div>

      <div className="border-border mt-4 border-t pt-4">
        <div className="text-muted-foreground mb-2 text-xs font-semibold tracking-normal uppercase">
          最近发布任务
        </div>
        {overview.recentTasks.length === 0 ? (
          <p className="text-muted-foreground text-sm">暂无发布任务。</p>
        ) : (
          <div className="space-y-2">
            {overview.recentTasks.slice(0, 5).map((task) => (
              <Link
                key={task.id}
                href={`/jd-generator/${task.jobDescriptionId}`}
                className="border-border hover:border-primary/35 block rounded-md border px-3 py-2 text-sm"
              >
                <div className="flex items-center justify-between gap-2">
                  <span>{task.platform}</span>
                  <span className="text-muted-foreground">{task.status}</span>
                </div>
                {task.errorMessage ? (
                  <div className="mt-1 truncate text-xs text-rose-600">{task.errorMessage}</div>
                ) : null}
              </Link>
            ))}
          </div>
        )}
      </div>
    </aside>
  );
}
```

- [ ] **Step 8: Add dashboard page client shell**

Create `src/components/dashboard/dashboard-page.tsx`:

```tsx
'use client';

import { useEffect, useMemo, useState } from 'react';
import Link from 'next/link';
import { useSearchParams } from 'next/navigation';
import { ListFilter, MessageCircle, Plus, RefreshCw } from 'lucide-react';
import { Button } from '@/components/ui';
import { fetchDashboardOverview } from '@/lib/dashboard/client';
import type { DashboardOverviewDto } from '@/lib/dashboard/types';
import { ActionQueue } from './action-queue';
import { DashboardJobList } from './job-list';
import { PlatformFilter } from './platform-filter';
import { SummaryCards } from './summary-cards';

function ErrorBanner({ message }: { message: string }) {
  return (
    <div
      className="rounded-md border border-rose-200 bg-rose-50 px-4 py-3 text-sm text-rose-700 dark:border-rose-900 dark:bg-rose-950/40 dark:text-rose-200"
      role="alert"
    >
      {message}
    </div>
  );
}

export function DashboardPage() {
  const searchParams = useSearchParams();
  const query = useMemo(() => searchParams.toString(), [searchParams]);
  const [overview, setOverview] = useState<DashboardOverviewDto | null>(null);
  const [isLoading, setIsLoading] = useState(true);
  const [isRefreshing, setIsRefreshing] = useState(false);
  const [error, setError] = useState('');

  async function loadDashboard(options?: { silent?: boolean }) {
    if (options?.silent) {
      setIsRefreshing(true);
    } else {
      setIsLoading(true);
    }
    setError('');
    try {
      setOverview(await fetchDashboardOverview(query));
    } catch (e) {
      setError(e instanceof Error ? e.message : '加载工作台失败');
    } finally {
      setIsLoading(false);
      setIsRefreshing(false);
    }
  }

  useEffect(() => {
    void loadDashboard();
  }, [query]);

  return (
    <section className="container mx-auto px-4 py-8">
      <div className="space-y-4">
        <div className="border-border flex flex-col gap-3 border-b pb-4 lg:flex-row lg:items-end lg:justify-between">
          <div className="min-w-0">
            <div className="text-muted-foreground mb-1 text-xs font-semibold tracking-normal uppercase">
              Dashboard
            </div>
            <h1 className="text-foreground text-2xl font-semibold tracking-normal">
              招聘岗位运营台
            </h1>
            <p className="text-muted-foreground mt-1 text-sm">
              按平台查看招聘中的 JD，并处理发布、筛选、沟通的下一步。
            </p>
          </div>
          <div className="flex flex-wrap gap-2">
            <Button
              className="gap-2"
              isDisabled={isLoading || isRefreshing}
              type="button"
              variant="bordered"
              onClick={() => void loadDashboard({ silent: true })}
            >
              <RefreshCw className="h-4 w-4" aria-hidden />
              刷新
            </Button>
            <Button as={Link} className="gap-2" href="/jd-generator/candidates" variant="bordered">
              <ListFilter className="h-4 w-4" aria-hidden />
              候选人跟踪
            </Button>
            <Button as={Link} className="gap-2" href="/jd-generator/candidates" variant="bordered">
              <MessageCircle className="h-4 w-4" aria-hidden />
              同步沟通
            </Button>
            <Button as={Link} className="gap-2" color="primary" href="/jd-generator/new">
              <Plus className="h-4 w-4" aria-hidden />
              新建 JD
            </Button>
          </div>
        </div>

        {error ? <ErrorBanner message={error} /> : null}

        {isLoading && !overview ? (
          <div className="text-muted-foreground border-border rounded-lg border px-4 py-12 text-center text-sm">
            正在加载工作台…
          </div>
        ) : overview ? (
          <>
            <SummaryCards summary={overview.summary} />
            <div className="grid gap-4 xl:grid-cols-[240px_minmax(0,1fr)_280px]">
              <PlatformFilter overview={overview} />
              <DashboardJobList overview={overview} />
              <ActionQueue overview={overview} />
            </div>
          </>
        ) : null}
      </div>
    </section>
  );
}
```

- [ ] **Step 9: Replace homepage with auth-aware dashboard entry**

Replace `src/app/page.tsx` with:

```tsx
import { SignInButton } from '@/components/auth/sign-in-button';
import { DashboardPage } from '@/components/dashboard/dashboard-page';
import { getServerAuthSession } from '@/lib/auth/session';

export default async function Home() {
  const session = await getServerAuthSession();

  if (!session?.user) {
    return (
      <section className="container mx-auto px-4 py-12">
        <div className="border-border bg-background/60 mx-auto max-w-xl rounded-lg border p-8 text-center backdrop-blur">
          <h1 className="text-foreground text-xl font-semibold">请先登录后继续</h1>
          <p className="text-muted-foreground mt-2 text-sm">
            登录本地账号后即可查看 JD、发布任务和候选人跟进数据。
          </p>
          <div className="mt-6 flex justify-center">
            <SignInButton />
          </div>
        </div>
      </section>
    );
  }

  return <DashboardPage />;
}
```

- [ ] **Step 10: Run homepage tests**

Run:

```bash
bunx jest src/app/page.test.tsx tests/unit/pages/Home.test.tsx --runInBand --coverage=false
```

Expected: PASS.

- [ ] **Step 11: Commit Task 3**

```bash
git add src/app/page.tsx src/app/page.test.tsx tests/unit/pages/Home.test.tsx src/components/dashboard src/lib/dashboard/client.ts
git commit -m "feat: replace homepage with recruiting dashboard"
```

---

## Task 4: Navigation Labels And Tests

**Files:**
- Modify: `src/components/navbar.tsx`
- Modify: `src/components/app-sidebar.tsx`
- Modify: `src/app/layout.tsx`
- Modify: `src/components/navbar.test.tsx`
- Modify: `tests/unit/components/Navbar.test.tsx`
- Modify: `src/components/app-sidebar.test.tsx`

- [ ] **Step 1: Update Navbar tests to expect no standalone home link**

In both `src/components/navbar.test.tsx` and `tests/unit/components/Navbar.test.tsx`, replace assertions that expect `首页` links with:

```ts
expect(screen.getByText('招聘助手')).toBeInTheDocument();
expect(screen.queryByRole('link', { name: '首页' })).not.toBeInTheDocument();
```

For the mobile menu test, replace the home link count assertion with:

```ts
expect(screen.queryByRole('link', { name: '首页' })).not.toBeInTheDocument();
expect(await screen.findAllByRole('link', { name: /log in/i })).toHaveLength(2);
```

- [ ] **Step 2: Update sidebar test expectations**

In `src/components/app-sidebar.test.tsx`, replace:

```ts
expect(screen.getByRole('link', { name: /首页/i })).toHaveAttribute('href', '/');
```

with:

```ts
expect(screen.getByRole('link', { name: /工作台/i })).toHaveAttribute('href', '/');
```

Add an active route assertion for `/`:

```ts
(usePathname as jest.Mock).mockReturnValue('/');
render(<AppSidebar />);
expect(screen.getByRole('link', { name: /工作台/i })).toHaveClass('bg-primary/10');
```

- [ ] **Step 3: Run navigation tests to verify they fail**

Run:

```bash
bunx jest src/components/navbar.test.tsx tests/unit/components/Navbar.test.tsx src/components/app-sidebar.test.tsx --runInBand --coverage=false
```

Expected: FAIL because the implementation still renders standalone `首页` and sidebar still says `首页`.

- [ ] **Step 4: Remove standalone Navbar home links**

In `src/components/navbar.tsx`, remove:

```ts
const navigation = [{ name: '首页', href: '/' }];
```

Remove both desktop and mobile `{navigation.map(...)}` blocks. Keep the brand `Link href="/"`, auth area, theme toggle, and mobile auth menu.

- [ ] **Step 5: Rename sidebar home entry**

In `src/components/app-sidebar.tsx`, update imports:

```ts
import {
  BrainCircuit,
  Building2,
  Eye,
  FileCode,
  FileText,
  LayoutDashboard,
  MessageCircle,
} from 'lucide-react';
```

Change the first `appMenuItems` item to:

```ts
{
  label: '工作台',
  description: '招聘运营总览',
  href: '/',
  Icon: LayoutDashboard,
},
```

Remove the unused `Circle` import.

- [ ] **Step 6: Rename footer link**

In `src/app/layout.tsx`, change:

```ts
{ name: '首页', href: '/' },
```

to:

```ts
{ name: '工作台', href: '/' },
```

- [ ] **Step 7: Run navigation tests**

Run:

```bash
bunx jest src/components/navbar.test.tsx tests/unit/components/Navbar.test.tsx src/components/app-sidebar.test.tsx --runInBand --coverage=false
```

Expected: PASS.

- [ ] **Step 8: Commit Task 4**

```bash
git add src/components/navbar.tsx src/components/app-sidebar.tsx src/app/layout.tsx src/components/navbar.test.tsx tests/unit/components/Navbar.test.tsx src/components/app-sidebar.test.tsx
git commit -m "fix: align navigation with dashboard homepage"
```

---

## Task 5: Final Verification And Browser Smoke Test

**Files:**
- Verify all files touched in Tasks 1-4.

- [ ] **Step 1: Run focused Jest tests**

Run:

```bash
bunx jest src/lib/dashboard/overview.test.ts src/app/api/dashboard/route.test.ts src/app/page.test.tsx tests/unit/pages/Home.test.tsx src/components/navbar.test.tsx tests/unit/components/Navbar.test.tsx src/components/app-sidebar.test.tsx --runInBand --coverage=false
```

Expected: PASS.

- [ ] **Step 2: Run type-check**

Run:

```bash
bun run type-check
```

Expected: PASS with no TypeScript errors.

- [ ] **Step 3: Run lint**

Run:

```bash
bun run lint
```

Expected: PASS with no ESLint errors.

- [ ] **Step 4: Start dev server for smoke testing**

Run:

```bash
bun run dev
```

Expected: server starts on `http://localhost:3000`.

- [ ] **Step 5: Browser smoke check**

Open `http://localhost:3000`:

- Logged-out state shows “请先登录后继续”.
- Top Navbar does not show standalone “首页”.
- Sidebar shows “工作台”.

After logging in with an existing local account:

- `/` shows “招聘岗位运营台”.
- Top metrics are clickable.
- Platform/status filters are clickable.
- JD rows link to `/jd-generator/[id]`.
- Candidate counts link to `/jd-generator/[id]/candidates`.

- [ ] **Step 6: Stop dev server**

Stop the `bun run dev` session after smoke testing.

- [ ] **Step 7: Inspect final diff**

Run:

```bash
git status --short
git diff --stat HEAD
```

Expected: only the dashboard, homepage, navigation, and related tests changed after the final task commit.
