# JD Workbench Status and Screening Implementation Plan

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** Make the JD workbench default to published JDs, show derived screening state, lock published JD editing, and default candidate result views to qualified resumes.

**Architecture:** Keep `JobDescription.status` as the publish lifecycle and add a derived screening summary from existing screening runs/results. The API attaches `screeningSummary` to JD DTOs, while UI components use that summary for filters, status chips, top actions, and qualified counts.

**Tech Stack:** Next.js App Router route handlers, React client components, TypeScript, Prisma, HeroUI, Jest, Testing Library, Bun.

---

## File Structure

- Modify `src/types/jd-agent.ts`
  - Add `JDScreeningStatus`, `JDScreeningSummary`, and optional `screeningSummary` on `JobDescriptionDto`.
- Modify `src/lib/candidate-screening/constants.ts`
  - Add `QUALIFIED_CANDIDATE_SCORE = 70`.
- Create `src/lib/jd/screening-summary.ts`
  - Aggregate runs/results and derive `not_started`, `running`, `screened`, or `failed`.
- Create `src/lib/jd/screening-summary.test.ts`
  - Unit-test summary defaults, running state, failed state, and 70-point qualified counts.
- Modify `src/app/api/jd/route.ts`
  - Attach summaries to list responses.
- Modify `src/app/api/jd/[id]/route.ts`
  - Attach summary to GET detail responses and reject PATCH for published JDs.
- Modify `src/app/api/jd/[id]/regenerate/route.ts`
  - Reject regeneration for published JDs.
- Modify `tests/unit/api/jd-routes.test.ts`
  - Cover list summary attachment and published immutability.
- Modify `src/lib/jd/client.ts`
  - Accept status filters in `fetchJobDescriptions`.
- Modify `src/components/jd-generator/jd-pages.tsx`
  - Add list status filter, screening chips, qualified counts, top detail actions, and published read-only behavior.
- Modify `tests/unit/pages/JDGeneratorPage.test.tsx`
  - Cover status filtering and published read-only detail behavior.
- Modify `tests/unit/components/CandidateScreening.test.tsx`
  - Cover summary rendering, top actions, and default qualified candidate filtering.
- Modify `src/lib/candidate-screening/repo.ts`
  - Add optional `minScore` to candidate result list queries.
- Modify `src/app/api/jd/[id]/candidates/route.ts`
  - Parse and pass `minScore`.
- Modify `src/lib/candidate-screening/client.ts`
  - Send `minScore` to the API instead of filtering only in memory.
- Modify `src/components/candidate-screening/candidate-list.tsx`
  - Default to qualified candidates with `minScore = 70`, while allowing `全部` to inspect low scores.
- Modify `tests/unit/api/candidate-screening-routes.test.ts`
  - Cover `minScore` route parsing.

## Task 1: Add Derived Screening Summary

**Files:**

- Modify: `src/types/jd-agent.ts`
- Modify: `src/lib/candidate-screening/constants.ts`
- Create: `src/lib/jd/screening-summary.ts`
- Create: `src/lib/jd/screening-summary.test.ts`

- [ ] **Step 1: Write the failing screening summary tests**

Add `src/lib/jd/screening-summary.test.ts`:

```ts
import { getDefaultJdScreeningSummary, listJdScreeningSummaries } from '@/lib/jd/screening-summary';

jest.mock('@/lib/prisma', () => ({
  prisma: {
    candidateScreeningRun: {
      findMany: jest.fn(),
    },
    candidateScreeningResult: {
      groupBy: jest.fn(),
    },
  },
}));

const { prisma: prismaMock } = jest.requireMock('@/lib/prisma') as {
  prisma: {
    candidateScreeningRun: {
      findMany: jest.Mock;
    };
    candidateScreeningResult: {
      groupBy: jest.Mock;
    };
  };
};

describe('JD screening summaries', () => {
  beforeEach(() => {
    prismaMock.candidateScreeningRun.findMany.mockReset();
    prismaMock.candidateScreeningResult.groupBy.mockReset();
  });

  it('returns not_started defaults for empty JD id input', async () => {
    await expect(
      listJdScreeningSummaries({ userId: 'u1', jobDescriptionIds: [] }),
    ).resolves.toEqual({});
    expect(prismaMock.candidateScreeningRun.findMany).not.toHaveBeenCalled();
    expect(prismaMock.candidateScreeningResult.groupBy).not.toHaveBeenCalled();
  });

  it('derives running when latest run is pending or running', async () => {
    prismaMock.candidateScreeningRun.findMany.mockResolvedValueOnce([
      {
        jobDescriptionId: 'jd-1',
        status: 'running',
        id: 'run-2',
        updatedAt: new Date('2026-07-06T03:00:00.000Z'),
      },
      {
        jobDescriptionId: 'jd-1',
        status: 'success',
        id: 'run-1',
        updatedAt: new Date('2026-07-06T02:00:00.000Z'),
      },
    ]);
    prismaMock.candidateScreeningResult.groupBy
      .mockResolvedValueOnce([{ jobDescriptionId: 'jd-1', _count: { _all: 3 } }])
      .mockResolvedValueOnce([{ jobDescriptionId: 'jd-1', _count: { _all: 2 } }]);

    const summaries = await listJdScreeningSummaries({
      userId: 'u1',
      jobDescriptionIds: ['jd-1'],
    });

    expect(summaries['jd-1']).toEqual({
      status: 'running',
      totalCandidateCount: 3,
      qualifiedCandidateCount: 2,
      latestRunId: 'run-2',
      latestRunStatus: 'running',
      latestRunUpdatedAt: '2026-07-06T03:00:00.000Z',
    });
  });

  it('counts only scores of 70 or above as qualified', async () => {
    prismaMock.candidateScreeningRun.findMany.mockResolvedValueOnce([
      {
        jobDescriptionId: 'jd-1',
        status: 'success',
        id: 'run-1',
        updatedAt: new Date('2026-07-06T03:00:00.000Z'),
      },
    ]);
    prismaMock.candidateScreeningResult.groupBy
      .mockResolvedValueOnce([{ jobDescriptionId: 'jd-1', _count: { _all: 4 } }])
      .mockResolvedValueOnce([{ jobDescriptionId: 'jd-1', _count: { _all: 2 } }]);

    await listJdScreeningSummaries({ userId: 'u1', jobDescriptionIds: ['jd-1'] });

    expect(prismaMock.candidateScreeningResult.groupBy).toHaveBeenNthCalledWith(
      2,
      expect.objectContaining({
        where: expect.objectContaining({
          finalScore: { gte: 70 },
        }),
      }),
    );
  });

  it('derives failed when latest run failed and no qualified candidates exist', async () => {
    prismaMock.candidateScreeningRun.findMany.mockResolvedValueOnce([
      {
        jobDescriptionId: 'jd-1',
        status: 'failed',
        id: 'run-1',
        updatedAt: new Date('2026-07-06T03:00:00.000Z'),
      },
    ]);
    prismaMock.candidateScreeningResult.groupBy
      .mockResolvedValueOnce([{ jobDescriptionId: 'jd-1', _count: { _all: 1 } }])
      .mockResolvedValueOnce([]);

    const summaries = await listJdScreeningSummaries({
      userId: 'u1',
      jobDescriptionIds: ['jd-1'],
    });

    expect(summaries['jd-1']?.status).toBe('failed');
    expect(summaries['jd-1']?.totalCandidateCount).toBe(1);
    expect(summaries['jd-1']?.qualifiedCandidateCount).toBe(0);
  });

  it('returns a reusable default summary object', () => {
    expect(getDefaultJdScreeningSummary()).toEqual({
      status: 'not_started',
      totalCandidateCount: 0,
      qualifiedCandidateCount: 0,
      latestRunId: null,
      latestRunStatus: null,
      latestRunUpdatedAt: null,
    });
  });
});
```

- [ ] **Step 2: Run the test to verify it fails**

Run:

```bash
bunx jest src/lib/jd/screening-summary.test.ts --runInBand --coverage=false
```

Expected: FAIL because `@/lib/jd/screening-summary` does not exist.

- [ ] **Step 3: Add types and constants**

In `src/lib/candidate-screening/constants.ts`, add near the existing defaults:

```ts
export const QUALIFIED_CANDIDATE_SCORE = 70;
```

In `src/types/jd-agent.ts`, add after `JDStatus`:

```ts
export type JDScreeningRunStatus = 'pending' | 'running' | 'success' | 'failed' | 'cancelled';

export type JDScreeningStatus = 'not_started' | 'running' | 'screened' | 'failed';

export type JDScreeningSummary = {
  status: JDScreeningStatus;
  totalCandidateCount: number;
  qualifiedCandidateCount: number;
  latestRunId: string | null;
  latestRunStatus: JDScreeningRunStatus | null;
  latestRunUpdatedAt: string | null;
};
```

Then add `screeningSummary?: JDScreeningSummary;` to `JobDescriptionDto`:

```ts
export type JobDescriptionDto = {
  id: string;
  userId: string;
  department: string;
  position: string;
  positionDescription: string;
  salaryRange: string | null;
  workLocations: string[];
  tone: JDTone;
  status: JDStatus;
  content: JD;
  evaluation: EvaluationResult | null;
  generationMeta: JDAgentResponse['meta'] | null;
  screeningSummary?: JDScreeningSummary;
  createdAt: string;
  updatedAt: string;
};
```

- [ ] **Step 4: Implement `screening-summary.ts`**

Create `src/lib/jd/screening-summary.ts`:

```ts
import { prisma } from '@/lib/prisma';
import { QUALIFIED_CANDIDATE_SCORE } from '@/lib/candidate-screening/constants';
import type { JDScreeningRunStatus, JDScreeningSummary, JDScreeningStatus } from '@/types';

type RunRow = {
  id: string;
  jobDescriptionId: string;
  status: string;
  updatedAt: Date;
};

type CountRow = {
  jobDescriptionId: string;
  _count: {
    _all: number;
  };
};

export function getDefaultJdScreeningSummary(): JDScreeningSummary {
  return {
    status: 'not_started',
    totalCandidateCount: 0,
    qualifiedCandidateCount: 0,
    latestRunId: null,
    latestRunStatus: null,
    latestRunUpdatedAt: null,
  };
}

function toCountMap(rows: CountRow[]): Map<string, number> {
  return new Map(rows.map((row) => [row.jobDescriptionId, row._count._all]));
}

function toIso(value: Date | null): string | null {
  return value ? value.toISOString() : null;
}

function deriveStatus(params: {
  latestRunStatus: JDScreeningRunStatus | null;
  totalCandidateCount: number;
  qualifiedCandidateCount: number;
}): JDScreeningStatus {
  if (params.latestRunStatus === 'pending' || params.latestRunStatus === 'running') {
    return 'running';
  }

  if (params.latestRunStatus === 'failed' && params.qualifiedCandidateCount === 0) {
    return 'failed';
  }

  if (params.totalCandidateCount > 0 || params.latestRunStatus === 'success') {
    return 'screened';
  }

  return 'not_started';
}

function latestRunsByJd(rows: RunRow[]): Map<string, RunRow> {
  const latestByJd = new Map<string, RunRow>();
  for (const row of rows) {
    const current = latestByJd.get(row.jobDescriptionId);
    if (!current || row.updatedAt > current.updatedAt) {
      latestByJd.set(row.jobDescriptionId, row);
    }
  }
  return latestByJd;
}

export async function listJdScreeningSummaries(params: {
  userId: string;
  jobDescriptionIds: string[];
}): Promise<Record<string, JDScreeningSummary>> {
  const jobDescriptionIds = Array.from(new Set(params.jobDescriptionIds.filter(Boolean)));
  if (jobDescriptionIds.length === 0) {
    return {};
  }

  const [runs, totalRows, qualifiedRows] = await Promise.all([
    prisma.candidateScreeningRun.findMany({
      where: {
        userId: params.userId,
        jobDescriptionId: { in: jobDescriptionIds },
      },
      select: {
        id: true,
        jobDescriptionId: true,
        status: true,
        updatedAt: true,
      },
      orderBy: { updatedAt: 'desc' },
    }),
    prisma.candidateScreeningResult.groupBy({
      by: ['jobDescriptionId'],
      where: {
        userId: params.userId,
        jobDescriptionId: { in: jobDescriptionIds },
      },
      _count: { _all: true },
    }),
    prisma.candidateScreeningResult.groupBy({
      by: ['jobDescriptionId'],
      where: {
        userId: params.userId,
        jobDescriptionId: { in: jobDescriptionIds },
        finalScore: { gte: QUALIFIED_CANDIDATE_SCORE },
      },
      _count: { _all: true },
    }),
  ]);

  const latestRunByJd = latestRunsByJd(runs as RunRow[]);
  const totalByJd = toCountMap(totalRows as CountRow[]);
  const qualifiedByJd = toCountMap(qualifiedRows as CountRow[]);

  return Object.fromEntries(
    jobDescriptionIds.map((jobDescriptionId) => {
      const latestRun = latestRunByJd.get(jobDescriptionId);
      const totalCandidateCount = totalByJd.get(jobDescriptionId) ?? 0;
      const qualifiedCandidateCount = qualifiedByJd.get(jobDescriptionId) ?? 0;
      const latestRunStatus = latestRun ? (latestRun.status as JDScreeningRunStatus) : null;

      return [
        jobDescriptionId,
        {
          status: deriveStatus({
            latestRunStatus,
            totalCandidateCount,
            qualifiedCandidateCount,
          }),
          totalCandidateCount,
          qualifiedCandidateCount,
          latestRunId: latestRun?.id ?? null,
          latestRunStatus,
          latestRunUpdatedAt: toIso(latestRun?.updatedAt ?? null),
        },
      ];
    }),
  );
}
```

- [ ] **Step 5: Run the summary tests to verify they pass**

Run:

```bash
bunx jest src/lib/jd/screening-summary.test.ts --runInBand --coverage=false
```

Expected: PASS.

- [ ] **Step 6: Commit Task 1**

```bash
git add src/types/jd-agent.ts src/lib/candidate-screening/constants.ts src/lib/jd/screening-summary.ts src/lib/jd/screening-summary.test.ts
git commit -m "feat: derive jd screening summaries"
```

## Task 2: Attach Screening Summaries to JD API and Client

**Files:**

- Modify: `src/app/api/jd/route.ts`
- Modify: `src/app/api/jd/[id]/route.ts`
- Modify: `src/lib/jd/client.ts`
- Modify: `tests/unit/api/jd-routes.test.ts`

- [ ] **Step 1: Write failing API tests**

In `tests/unit/api/jd-routes.test.ts`, add a mock for the summary helper:

```ts
const listJdScreeningSummariesMock = jest.fn();

jest.mock('@/lib/jd/screening-summary', () => ({
  listJdScreeningSummaries: (...args: unknown[]) => listJdScreeningSummariesMock(...args),
  getDefaultJdScreeningSummary: () => ({
    status: 'not_started',
    totalCandidateCount: 0,
    qualifiedCandidateCount: 0,
    latestRunId: null,
    latestRunStatus: null,
    latestRunUpdatedAt: null,
  }),
}));
```

Reset and default it in the existing `beforeEach`:

```ts
listJdScreeningSummariesMock.mockReset();
listJdScreeningSummariesMock.mockResolvedValue({});
```

Add this test near the existing list test:

```ts
it('lists published job descriptions with screening summaries', async () => {
  listJobDescriptionsPaginatedMock.mockResolvedValueOnce([{ id: 'jd-1', position: '前端工程师' }]);
  countJobDescriptionsMock.mockResolvedValueOnce(1);
  listJdScreeningSummariesMock.mockResolvedValueOnce({
    'jd-1': {
      status: 'screened',
      totalCandidateCount: 3,
      qualifiedCandidateCount: 2,
      latestRunId: 'run-1',
      latestRunStatus: 'success',
      latestRunUpdatedAt: '2026-07-06T03:00:00.000Z',
    },
  });

  const response = await listJds({
    url: 'http://localhost/api/jd?page=1&limit=10&status=published',
  } as Request);
  const body = await response.json();

  expect(response.status).toBe(200);
  expect(body.jobDescriptions[0].screeningSummary).toEqual({
    status: 'screened',
    totalCandidateCount: 3,
    qualifiedCandidateCount: 2,
    latestRunId: 'run-1',
    latestRunStatus: 'success',
    latestRunUpdatedAt: '2026-07-06T03:00:00.000Z',
  });
  expect(listJobDescriptionsPaginatedMock).toHaveBeenCalledWith({
    userId: 'u1',
    limit: 10,
    offset: 0,
    status: 'published',
  });
  expect(listJdScreeningSummariesMock).toHaveBeenCalledWith({
    userId: 'u1',
    jobDescriptionIds: ['jd-1'],
  });
});
```

Add this detail test:

```ts
it('returns one JD with a screening summary', async () => {
  getJobDescriptionByIdMock.mockResolvedValueOnce({ id: 'jd-1', content: sampleJd });
  listJdScreeningSummariesMock.mockResolvedValueOnce({
    'jd-1': {
      status: 'running',
      totalCandidateCount: 1,
      qualifiedCandidateCount: 1,
      latestRunId: 'run-2',
      latestRunStatus: 'running',
      latestRunUpdatedAt: '2026-07-06T03:30:00.000Z',
    },
  });

  const response = await getJd({} as Request, { params: Promise.resolve({ id: 'jd-1' }) });
  const body = await response.json();

  expect(response.status).toBe(200);
  expect(body.jobDescription.screeningSummary.status).toBe('running');
  expect(listJdScreeningSummariesMock).toHaveBeenCalledWith({
    userId: 'u1',
    jobDescriptionIds: ['jd-1'],
  });
});
```

- [ ] **Step 2: Run API tests to verify they fail**

Run:

```bash
bunx jest tests/unit/api/jd-routes.test.ts --runInBand --coverage=false
```

Expected: FAIL because the route does not attach `screeningSummary`.

- [ ] **Step 3: Attach summaries in `GET /api/jd`**

In `src/app/api/jd/route.ts`, import:

```ts
import { getDefaultJdScreeningSummary, listJdScreeningSummaries } from '@/lib/jd/screening-summary';
```

Replace the list response block with:

```ts
const summaries = await listJdScreeningSummaries({
  userId: auth.user.id,
  jobDescriptionIds: jobDescriptions.map((item) => item.id),
});

return NextResponse.json({
  jobDescriptions: jobDescriptions.map((item) => ({
    ...item,
    screeningSummary: summaries[item.id] ?? getDefaultJdScreeningSummary(),
  })),
  total,
  page,
  limit,
  hasMore: offset + jobDescriptions.length < total,
});
```

- [ ] **Step 4: Attach summary in `GET /api/jd/[id]`**

In `src/app/api/jd/[id]/route.ts`, import:

```ts
import { getDefaultJdScreeningSummary, listJdScreeningSummaries } from '@/lib/jd/screening-summary';
```

Replace:

```ts
return NextResponse.json({ jobDescription });
```

inside GET with:

```ts
const summaries = await listJdScreeningSummaries({
  userId: auth.user.id,
  jobDescriptionIds: [jobDescription.id],
});

return NextResponse.json({
  jobDescription: {
    ...jobDescription,
    screeningSummary: summaries[jobDescription.id] ?? getDefaultJdScreeningSummary(),
  },
});
```

- [ ] **Step 5: Update the JD client for status filters**

In `src/lib/jd/client.ts`, import `JDStatus`:

```ts
import type {
  CreateJobDescriptionRequest,
  JDStatus,
  JobDescriptionDto,
  RegenerateJobDescriptionRequest,
  UpdateJobDescriptionRequest,
} from '@/types';
```

Replace `fetchJobDescriptions` with:

```ts
export async function fetchJobDescriptions(
  status: JDStatus | 'all' = 'all',
): Promise<JobDescriptionDto[]> {
  const params = new URLSearchParams();
  if (status !== 'all') {
    params.set('status', status);
  }
  const query = params.toString();
  const response = await fetch(`/api/jd${query ? `?${query}` : ''}`);
  const data = await readJson<{ jobDescriptions?: JobDescriptionDto[] }>(response);
  if (!response.ok || !Array.isArray(data.jobDescriptions)) {
    throw new Error(data.error || '加载 JD 列表失败');
  }
  return data.jobDescriptions;
}
```

- [ ] **Step 6: Run API tests to verify they pass**

Run:

```bash
bunx jest tests/unit/api/jd-routes.test.ts --runInBand --coverage=false
```

Expected: PASS.

- [ ] **Step 7: Commit Task 2**

```bash
git add src/app/api/jd/route.ts src/app/api/jd/[id]/route.ts src/lib/jd/client.ts tests/unit/api/jd-routes.test.ts
git commit -m "feat: expose jd screening summaries"
```

## Task 3: Enforce Published JD Immutability in API Routes

**Files:**

- Modify: `src/app/api/jd/[id]/route.ts`
- Modify: `src/app/api/jd/[id]/regenerate/route.ts`
- Modify: `tests/unit/api/jd-routes.test.ts`

- [ ] **Step 1: Write failing API guard tests**

Add these tests to `tests/unit/api/jd-routes.test.ts`:

```ts
it('rejects PATCH updates for published JDs', async () => {
  getJobDescriptionByIdMock.mockResolvedValueOnce({
    id: 'jd-1',
    status: 'published',
    content: sampleJd,
  });
  const request = new Request('http://localhost/api/jd/jd-1', {
    method: 'PATCH',
    headers: { 'Content-Type': 'application/json' },
    body: JSON.stringify({
      content: { ...sampleJd, summary: '不应允许修改' },
    }),
  });

  const response = await patchJd(request, { params: Promise.resolve({ id: 'jd-1' }) });
  const body = await response.json();

  expect(response.status).toBe(409);
  expect(body.error).toBe('published job descriptions cannot be modified');
  expect(updateJobDescriptionMock).not.toHaveBeenCalled();
});

it('rejects regeneration for published JDs', async () => {
  getJobDescriptionByIdMock.mockResolvedValueOnce({
    id: 'jd-1',
    status: 'published',
    content: sampleJd,
    tone: 'tech',
  });
  const request = new Request('http://localhost/api/jd/jd-1/regenerate', {
    method: 'POST',
    headers: { 'Content-Type': 'application/json' },
    body: JSON.stringify({ extraInstruction: '改成更热情' }),
  });

  const response = await regenerateJd(request, { params: Promise.resolve({ id: 'jd-1' }) });
  const body = await response.json();

  expect(response.status).toBe(409);
  expect(body.error).toBe('published job descriptions cannot be modified');
  expect(runJDAgentMock).not.toHaveBeenCalled();
  expect(updateJobDescriptionMock).not.toHaveBeenCalled();
});
```

- [ ] **Step 2: Run the API tests to verify they fail**

Run:

```bash
bunx jest tests/unit/api/jd-routes.test.ts --runInBand --coverage=false
```

Expected: FAIL because published updates and regeneration still succeed.

- [ ] **Step 3: Add conflict helper and PATCH guard**

In `src/app/api/jd/[id]/route.ts`, add:

```ts
function conflict(message: string) {
  return NextResponse.json({ error: message }, { status: 409 });
}

function isPublished(status: string): boolean {
  return status === 'published';
}
```

In PATCH, after validating `id` and before parsing the request body, add:

```ts
const current = await getJobDescriptionById(auth.user.id, id);
if (!current) {
  return NextResponse.json({ error: 'job description not found' }, { status: 404 });
}
if (isPublished(current.status)) {
  return conflict('published job descriptions cannot be modified');
}
```

Remove the later 404 branch that depended on `updateJobDescription` returning null only if it duplicates the same missing-JD check. Keep the final null check for defensive safety:

```ts
if (!jobDescription) {
  return NextResponse.json({ error: 'job description not found' }, { status: 404 });
}
```

- [ ] **Step 4: Add regenerate guard**

In `src/app/api/jd/[id]/regenerate/route.ts`, add:

```ts
function conflict(message: string) {
  return NextResponse.json({ error: message }, { status: 409 });
}
```

After the existing `current` not-found check, add:

```ts
if (current.status === 'published') {
  return conflict('published job descriptions cannot be modified');
}
```

- [ ] **Step 5: Run API tests to verify they pass**

Run:

```bash
bunx jest tests/unit/api/jd-routes.test.ts --runInBand --coverage=false
```

Expected: PASS.

- [ ] **Step 6: Commit Task 3**

```bash
git add src/app/api/jd/[id]/route.ts src/app/api/jd/[id]/regenerate/route.ts tests/unit/api/jd-routes.test.ts
git commit -m "fix: lock published jd mutations"
```

## Task 4: Add JD List Status Filter and Screening Summary UI

**Files:**

- Modify: `src/components/jd-generator/jd-pages.tsx`
- Modify: `tests/unit/pages/JDGeneratorPage.test.tsx`
- Modify: `tests/unit/components/CandidateScreening.test.tsx`

- [ ] **Step 1: Write failing list UI tests**

In `tests/unit/pages/JDGeneratorPage.test.tsx`, change the list test mock assertion to expect the published filter:

```ts
await waitFor(() => {
  expect(global.fetch).toHaveBeenCalledWith('/api/jd?status=published');
});
```

Add a screening summary to `sampleJobDescription`:

```ts
screeningSummary: {
  status: 'screened',
  totalCandidateCount: 3,
  qualifiedCandidateCount: 2,
  latestRunId: 'run-1',
  latestRunStatus: 'success',
  latestRunUpdatedAt: '2026-07-06T03:00:00.000Z',
},
```

Then assert the UI:

```ts
expect(screen.getByText('已筛选')).toBeInTheDocument();
expect(screen.getByText('合格 2 / 全部 3')).toBeInTheDocument();
```

Add this test:

```ts
it('filters the JD list by selected status', async () => {
  (global.fetch as jest.Mock)
    .mockResolvedValueOnce({
      ok: true,
      json: async () => ({ jobDescriptions: [], total: 0 }),
    })
    .mockResolvedValueOnce({
      ok: true,
      json: async () => ({
        jobDescriptions: [{ ...sampleJobDescription, status: 'created' }],
        total: 1,
      }),
    });

  render(<JDListView />);

  fireEvent.change(await screen.findByLabelText('JD 状态筛选'), {
    target: { value: 'created' },
  });

  await waitFor(() => {
    expect(global.fetch).toHaveBeenLastCalledWith('/api/jd?status=created');
  });
});
```

- [ ] **Step 2: Run list UI tests to verify they fail**

Run:

```bash
bunx jest tests/unit/pages/JDGeneratorPage.test.tsx --runInBand --coverage=false
```

Expected: FAIL because the list does not pass `status=published` and does not render screening summary.

- [ ] **Step 3: Add summary helpers and list filter UI**

In `src/components/jd-generator/jd-pages.tsx`, add `JDScreeningSummary` to the type import:

```ts
import type { JD, JDScreeningSummary, JDStatus, JDTone, JobDescriptionDto } from '@/types';
```

Add status filter options near `statusMeta`:

```ts
const statusFilterOptions: Array<{ value: JDStatus | 'all'; label: string }> = [
  { value: 'published', label: 'published' },
  { value: 'created', label: 'created' },
  { value: 'ready_to_publish', label: 'ready_to_publish' },
  { value: 'publish_failed', label: 'publish_failed' },
  { value: 'publishing', label: 'publishing' },
  { value: 'offline', label: 'offline' },
  { value: 'archived', label: 'archived' },
  { value: 'all', label: 'all' },
];

const screeningStatusMeta: Record<
  JDScreeningSummary['status'],
  { label: string; className: string }
> = {
  not_started: {
    label: '未筛选',
    className: 'border-zinc-200 bg-zinc-50 text-zinc-700 dark:border-zinc-800 dark:bg-zinc-900/60',
  },
  running: {
    label: '筛选中',
    className:
      'border-amber-200 bg-amber-50 text-amber-700 dark:border-amber-900 dark:bg-amber-950/40',
  },
  screened: {
    label: '已筛选',
    className:
      'border-emerald-200 bg-emerald-50 text-emerald-700 dark:border-emerald-900 dark:bg-emerald-950/40',
  },
  failed: {
    label: '筛选失败',
    className: 'border-rose-200 bg-rose-50 text-rose-700 dark:border-rose-900 dark:bg-rose-950/40',
  },
};

const emptyScreeningSummary: JDScreeningSummary = {
  status: 'not_started',
  totalCandidateCount: 0,
  qualifiedCandidateCount: 0,
  latestRunId: null,
  latestRunStatus: null,
  latestRunUpdatedAt: null,
};
```

Add helper components:

```tsx
function getScreeningSummary(item: JobDescriptionDto): JDScreeningSummary {
  return item.screeningSummary ?? emptyScreeningSummary;
}

function ScreeningStatusChip({ summary }: { summary: JDScreeningSummary }) {
  const meta = screeningStatusMeta[summary.status];
  return (
    <Chip className={`border text-xs ${meta.className}`} size="sm" variant="flat">
      {meta.label}
    </Chip>
  );
}

function getListActionLabel(item: JobDescriptionDto): string {
  if (item.status !== 'published') {
    return '查看';
  }
  return getScreeningSummary(item).status === 'not_started' ? '筛选并执行' : '继续筛选';
}
```

In `JDListView`, add state:

```ts
const [statusFilter, setStatusFilter] = useState<JDStatus | 'all'>('published');
```

Change the load call:

```ts
setItems(await fetchJobDescriptions(statusFilter));
```

Change the effect dependency:

```ts
useEffect(() => {
  void loadJds();
  // eslint-disable-next-line react-hooks/exhaustive-deps
}, [statusFilter]);
```

Add the select in the list header before the count:

```tsx
<label className="flex items-center gap-2 text-xs">
  <span className="text-muted-foreground">状态</span>
  <select
    aria-label="JD 状态筛选"
    className="border-input bg-background text-foreground h-9 rounded-md border px-2 text-xs"
    value={statusFilter}
    onChange={(event) => setStatusFilter(event.target.value as JDStatus | 'all')}
  >
    {statusFilterOptions.map((option) => (
      <option key={option.value} value={option.value}>
        {option.label}
      </option>
    ))}
  </select>
</label>
```

Change each row grid columns:

```tsx
className =
  'grid gap-3 px-4 py-4 md:grid-cols-[minmax(0,1fr)_130px_130px_140px_170px_110px] md:items-center';
```

Inside the row map, add:

```tsx
<ScreeningStatusChip summary={getScreeningSummary(item)} />
<div className="text-muted-foreground text-xs">
  合格 {getScreeningSummary(item).qualifiedCandidateCount} / 全部{' '}
  {getScreeningSummary(item).totalCandidateCount}
</div>
```

Change the button text:

```tsx
{
  getListActionLabel(item);
}
```

- [ ] **Step 4: Run list UI tests to verify they pass**

Run:

```bash
bunx jest tests/unit/pages/JDGeneratorPage.test.tsx --runInBand --coverage=false
```

Expected: PASS.

- [ ] **Step 5: Run candidate screening UI tests for existing import mocks**

Run:

```bash
bunx jest tests/unit/components/CandidateScreening.test.tsx --runInBand --coverage=false
```

Expected: PASS or a focused failure from text changes. If the failure is from contextual list action text, update the assertion to accept `筛选并执行` or `继续筛选` based on the fixture summary.

- [ ] **Step 6: Commit Task 4**

```bash
git add src/components/jd-generator/jd-pages.tsx tests/unit/pages/JDGeneratorPage.test.tsx tests/unit/components/CandidateScreening.test.tsx
git commit -m "feat: filter jd list by status"
```

## Task 5: Move Detail Actions to the Top and Make Published Details Read-Only

**Files:**

- Modify: `src/components/jd-generator/jd-pages.tsx`
- Modify: `tests/unit/pages/JDGeneratorPage.test.tsx`
- Modify: `tests/unit/components/CandidateScreening.test.tsx`

- [ ] **Step 1: Write failing detail UI tests**

Add this test to `tests/unit/pages/JDGeneratorPage.test.tsx`:

```ts
it('renders published JD detail as read-only without edit actions', async () => {
  (global.fetch as jest.Mock)
    .mockResolvedValueOnce({
      ok: true,
      json: async () => ({ jobDescription: { ...sampleJobDescription, status: 'published' } }),
    })
    .mockResolvedValueOnce({
      ok: true,
      json: async () => ({ tasks: [] }),
    })
    .mockResolvedValueOnce({
      ok: true,
      json: async () => ({ profile: sampleCompanyProfile }),
    });

  render(<JDDetailView jobDescriptionId="jd-1" />);

  expect(await screen.findByLabelText('JD 标题')).toHaveAttribute('readonly');
  expect(screen.queryByRole('button', { name: '保存修改' })).not.toBeInTheDocument();
  expect(screen.queryByRole('button', { name: '重新生成' })).not.toBeInTheDocument();
  expect(screen.queryByRole('button', { name: '发布到 Boss-like' })).not.toBeInTheDocument();
  expect(screen.getByRole('button', { name: '筛选并执行' })).toBeInTheDocument();
  expect(screen.getByRole('button', { name: /已筛选候选人/ })).toBeInTheDocument();
});
```

Add this test to `tests/unit/components/CandidateScreening.test.tsx`:

```ts
it('puts published JD screening actions in the detail header', async () => {
  render(<JDDetailView jobDescriptionId="jd-1" />);

  const header = await screen.findByLabelText('JD 详情主操作');

  expect(within(header).getByRole('button', { name: '筛选并执行' })).toBeInTheDocument();
  expect(within(header).getByRole('button', { name: /已筛选候选人/ })).toBeInTheDocument();
  expect(within(header).getByRole('button', { name: '启动沟通' })).toBeInTheDocument();
});
```

- [ ] **Step 2: Run detail UI tests to verify they fail**

Run:

```bash
bunx jest tests/unit/pages/JDGeneratorPage.test.tsx tests/unit/components/CandidateScreening.test.tsx --runInBand --coverage=false
```

Expected: FAIL because published details still show edit controls and actions are not grouped in the header.

- [ ] **Step 3: Add editability helpers to `JDDetailView`**

Inside `JDDetailView`, after `canPublishWithCompanyProfile`, add:

```ts
const isPublished = status === 'published';
const canEditJobDescription =
  status === 'created' || status === 'ready_to_publish' || status === 'publish_failed';
const detailScreeningSummary = jobDescription
  ? getScreeningSummary(jobDescription)
  : emptyScreeningSummary;
const screeningActionLabel =
  detailScreeningSummary.status === 'not_started' ? '筛选并执行' : '继续筛选';
```

Add guards at the top of handlers:

```ts
async function handleSave() {
  if (!jobDescription || !form || !canEditJobDescription) return;
  ...
}

async function handleRegenerate() {
  if (!jobDescription || !form || !canEditJobDescription) return;
  ...
}

async function handlePublish() {
  if (!jobDescription || !form || !canEditJobDescription) return;
  ...
}
```

- [ ] **Step 4: Replace the header action block**

Replace the current header action `<div className="flex flex-wrap gap-2">...</div>` with:

```tsx
<div className="flex flex-wrap gap-2" aria-label="JD 详情主操作">
  {canEditJobDescription ? (
    <>
      <Button
        className="gap-2"
        disableRipple
        isDisabled={isSaving}
        type="button"
        variant="bordered"
        onClick={() => void handleSave()}
      >
        <Save className="h-4 w-4" aria-hidden />
        {isSaving ? '保存中' : '保存修改'}
      </Button>
      <Button
        className="gap-2"
        color="primary"
        disableRipple
        isDisabled={
          isPublishing ||
          !canPublishWithCompanyProfile ||
          !publishCompany.trim() ||
          !publishSalary.trim() ||
          selectedPublishLocations.length === 0
        }
        type="button"
        onClick={() => void handlePublish()}
      >
        <Rocket className="h-4 w-4" aria-hidden />
        {isPublishing ? '发布中' : '发布到 Boss-like'}
      </Button>
      <Button
        className="gap-2"
        color="primary"
        disableRipple
        isDisabled={isRegenerating}
        type="button"
        variant="bordered"
        onClick={() => void handleRegenerate()}
      >
        <Sparkles className="h-4 w-4" aria-hidden />
        {isRegenerating ? '生成中' : '重新生成'}
      </Button>
    </>
  ) : null}
  {isPublished ? (
    <>
      <Button
        className="gap-2"
        color="primary"
        disableRipple
        isDisabled={isScreening}
        type="button"
        onClick={() => void handleStartScreening()}
      >
        <ListFilter className="h-4 w-4" aria-hidden />
        {isScreening ? '启动中' : screeningActionLabel}
      </Button>
      <Button
        as={Link}
        className="gap-2"
        disableRipple
        href={`/jd-generator/${jobDescription.id}/candidates`}
        variant="bordered"
      >
        <ListFilter className="h-4 w-4" aria-hidden />
        已筛选候选人
      </Button>
      <Button
        className="gap-2"
        disableRipple
        isDisabled={isSyncingCommunication}
        type="button"
        variant="bordered"
        onClick={() => void handleSyncCommunication()}
      >
        <MessageCircle className="h-4 w-4" aria-hidden />
        {isSyncingCommunication ? '启动中' : '启动沟通'}
      </Button>
    </>
  ) : null}
</div>
```

- [ ] **Step 5: Make published content and settings read-only**

For JD content inputs/textareas, add `readOnly={isPublished}`:

```tsx
<input
  aria-label="JD 标题"
  className="border-input bg-background text-foreground h-10 w-full rounded-md border px-3 text-sm"
  readOnly={isPublished}
  value={form.title}
  onChange={(event) => setForm({ ...form, title: event.target.value })}
/>
```

Apply the same `readOnly={isPublished}` to:

- `岗位摘要`
- `岗位职责`
- `任职要求`
- `加分项`
- `岗位亮点`
- `追加要求`
- `发布技能标签`

For publish setting selects and checkboxes, add `disabled={isPublished}`:

```tsx
<select
  aria-label="发布薪资范围"
  className="border-input bg-background text-foreground h-10 w-full rounded-md border px-3 text-sm"
  disabled={isPublished}
  value={publishSalary}
  onChange={(event) => setPublishSalary(event.target.value)}
>
```

Add `disabled={isPublished}` to publish location checkboxes.

- [ ] **Step 6: Hide duplicate lower action buttons**

Remove the lower `发布到 Boss-like`, `筛选并执行`, `已筛选候选人`, `启动沟通`, and `重新生成` buttons from the sidebar sections. Keep their configuration fields, trace, latest run card, communication result panel, and context display.

The sidebar publish section should still show publish settings and recent publish records for editable JDs. The candidate screening section should still show `latestScreeningRun` and `communicationSyncResult` after top actions run.

- [ ] **Step 7: Run detail UI tests to verify they pass**

Run:

```bash
bunx jest tests/unit/pages/JDGeneratorPage.test.tsx tests/unit/components/CandidateScreening.test.tsx --runInBand --coverage=false
```

Expected: PASS.

- [ ] **Step 8: Commit Task 5**

```bash
git add src/components/jd-generator/jd-pages.tsx tests/unit/pages/JDGeneratorPage.test.tsx tests/unit/components/CandidateScreening.test.tsx
git commit -m "feat: clarify jd detail actions"
```

## Task 6: Default Candidate Results to Qualified Scores

**Files:**

- Modify: `src/lib/candidate-screening/repo.ts`
- Modify: `src/app/api/jd/[id]/candidates/route.ts`
- Modify: `src/lib/candidate-screening/client.ts`
- Modify: `src/components/candidate-screening/candidate-list.tsx`
- Modify: `tests/unit/api/candidate-screening-routes.test.ts`
- Modify: `tests/unit/components/CandidateScreening.test.tsx`

- [ ] **Step 1: Write failing route and UI tests**

In `tests/unit/api/candidate-screening-routes.test.ts`, update the candidate list test request URL:

```ts
url: 'http://localhost/api/jd/jd-1/candidates?interviewStage=to_contact&limit=25&offset=5&minScore=70',
```

Update the expected repo call:

```ts
expect(listCandidateScreeningResultsMock).toHaveBeenCalledWith({
  userId: 'u1',
  jobDescriptionId: 'jd-1',
  limit: 25,
  offset: 5,
  interviewStage: 'to_contact',
  minScore: 70,
});
```

Add this invalid filter test:

```ts
it('rejects invalid candidate minScore filters', async () => {
  const response = await listJdCandidates(
    {
      url: 'http://localhost/api/jd/jd-1/candidates?minScore=high',
    } as Request,
    { params: params({ id: 'jd-1' }) },
  );
  const body = await response.json();

  expect(response.status).toBe(400);
  expect(body.error).toBe('minScore is invalid');
  expect(listCandidateScreeningResultsMock).not.toHaveBeenCalled();
});
```

In `tests/unit/components/CandidateScreening.test.tsx`, add:

```ts
it('candidate list defaults to qualified candidates and can switch to all scores', async () => {
  render(<CandidateList jobDescriptionId="jd-1" />);

  await waitFor(() =>
    expect(fetchJdCandidatesMock).toHaveBeenCalledWith(
      'jd-1',
      expect.objectContaining({ minScore: 70 }),
    ),
  );

  fireEvent.change(screen.getByLabelText('分数范围'), { target: { value: 'all' } });

  await waitFor(() =>
    expect(fetchJdCandidatesMock).toHaveBeenLastCalledWith(
      'jd-1',
      expect.not.objectContaining({ minScore: 70 }),
    ),
  );
});
```

- [ ] **Step 2: Run tests to verify they fail**

Run:

```bash
bunx jest tests/unit/api/candidate-screening-routes.test.ts tests/unit/components/CandidateScreening.test.tsx --runInBand --coverage=false
```

Expected: FAIL because `minScore` is not parsed server-side and the candidate list defaults to all scores.

- [ ] **Step 3: Add `minScore` to repo params and query**

In `src/lib/candidate-screening/repo.ts`, change `ListCandidateResultsParams` to:

```ts
export type ListCandidateResultsParams = {
  userId: string;
  jobDescriptionId: string;
  runId?: string;
  plannedActions?: CandidateDecisionAction[];
  limit: number;
  offset?: number;
  interviewStage?: CandidateInterviewStage;
  minScore?: number;
};
```

In `listCandidateScreeningResults`, add this where clause entry:

```ts
...(params.minScore !== undefined ? { finalScore: { gte: params.minScore } } : {}),
```

The full `where` object should contain:

```ts
where: {
  userId: params.userId,
  jobDescriptionId: params.jobDescriptionId,
  ...(params.interviewStage ? { interviewStage: params.interviewStage } : {}),
  ...(params.minScore !== undefined ? { finalScore: { gte: params.minScore } } : {}),
  ...(params.runId
    ? {
        actionLogs: {
          some: {
            userId: params.userId,
            runId: params.runId,
            status: 'planned',
            ...(params.plannedActions && params.plannedActions.length > 0
              ? { action: { in: params.plannedActions } }
              : {}),
          },
        },
      }
    : {}),
},
```

- [ ] **Step 4: Parse `minScore` in the JD candidates route**

In `src/app/api/jd/[id]/candidates/route.ts`, add:

```ts
function parseMinScore(value: string | null): number | undefined | 'invalid' {
  if (value === null || value.trim() === '') {
    return undefined;
  }
  const parsed = Number(value);
  if (!Number.isFinite(parsed)) {
    return 'invalid';
  }
  return Math.max(0, Math.min(100, Math.trunc(parsed)));
}
```

Inside GET after parsing offset:

```ts
const minScore = parseMinScore(searchParams.get('minScore'));
if (minScore === 'invalid') {
  return badRequest('minScore is invalid');
}
```

Pass it to the repo:

```ts
const candidates = await listCandidateScreeningResults({
  userId: auth.user.id,
  jobDescriptionId: id,
  limit: parseLimit(searchParams.get('limit')),
  offset: parseOffset(searchParams.get('offset')),
  interviewStage,
  minScore,
});
```

- [ ] **Step 5: Send `minScore` in the client**

In `src/lib/candidate-screening/client.ts`, add:

```ts
appendSearchParam(params, 'minScore', filters.minScore);
```

inside `fetchJdCandidates` before building the query.

Remove the in-memory min-score check:

```ts
if (filters.minScore !== undefined && candidate.finalScore < filters.minScore) return false;
```

Keep the in-memory `decisionAction` and `source` filters until those are moved server-side in a separate change.

- [ ] **Step 6: Change candidate list score filter UI**

In `src/components/candidate-screening/candidate-list.tsx`, import the constant:

```ts
import { QUALIFIED_CANDIDATE_SCORE } from '@/lib/candidate-screening/constants';
```

Replace the `minScore` state:

```ts
const [scoreRange, setScoreRange] = useState<'qualified' | 'all'>('qualified');
```

Replace the filter value:

```ts
minScore: scoreRange === 'qualified' ? QUALIFIED_CANDIDATE_SCORE : undefined,
```

Replace the `Input` for minimum score with:

```tsx
<label className="space-y-2">
  <span className="text-muted-foreground text-xs">分数范围</span>
  <select
    aria-label="分数范围"
    className="border-input bg-background text-foreground h-10 w-full rounded-md border px-3 text-sm"
    value={scoreRange}
    onChange={(event) => setScoreRange(event.target.value as 'qualified' | 'all')}
  >
    <option value="qualified">合格（70 分及以上）</option>
    <option value="all">全部分数</option>
  </select>
</label>
```

Remove the now-unused `Input` import and `toMinScore` helper.

- [ ] **Step 7: Run route and UI tests to verify they pass**

Run:

```bash
bunx jest tests/unit/api/candidate-screening-routes.test.ts tests/unit/components/CandidateScreening.test.tsx --runInBand --coverage=false
```

Expected: PASS.

- [ ] **Step 8: Commit Task 6**

```bash
git add src/lib/candidate-screening/repo.ts src/app/api/jd/[id]/candidates/route.ts src/lib/candidate-screening/client.ts src/components/candidate-screening/candidate-list.tsx tests/unit/api/candidate-screening-routes.test.ts tests/unit/components/CandidateScreening.test.tsx
git commit -m "feat: default candidates to qualified scores"
```

## Task 7: Final Verification

**Files:**

- Verify all modified files from Tasks 1-6.

- [ ] **Step 1: Run focused unit tests**

Run:

```bash
bunx jest src/lib/jd/screening-summary.test.ts tests/unit/api/jd-routes.test.ts tests/unit/api/candidate-screening-routes.test.ts tests/unit/pages/JDGeneratorPage.test.tsx tests/unit/components/CandidateScreening.test.tsx --runInBand --coverage=false
```

Expected: PASS.

- [ ] **Step 2: Run type check**

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

- [ ] **Step 4: Run broader unit test suite**

Run:

```bash
bun run test:ci
```

Expected: PASS. If this is slow, keep the output and duration in the final handoff.

- [ ] **Step 5: Inspect git state**

Run:

```bash
git status --short
```

Expected: clean worktree after all task commits.

- [ ] **Step 6: Keep verification commits tied to their task**

If verification exposes a bug, return to the task that introduced that bug, add a failing test beside that task's tests, fix it, rerun Task 7, and amend the task commit. Do not create a separate verification-only commit unless the user explicitly asks for one.

## Self-Review Notes

- Spec coverage:
  - Default published filter: Task 4.
  - Status filter: Task 4.
  - Separate screening status from JD status: Tasks 1-2 and Task 4.
  - Published detail read-only: Tasks 3 and 5.
  - Top detail actions: Task 5.
  - Continue screening with dedupe: Existing repository behavior is preserved; Task 5 keeps screening available for published JDs.
  - Qualified threshold at 70: Tasks 1 and 6.
  - Low-score inspection: Task 6 keeps `全部分数`.
- Specificity scan:
  - Every task names exact files, exact commands, and concrete code snippets.
- Type consistency:
  - `JDScreeningSummary` is optional on `JobDescriptionDto`.
  - API summary helper returns `Record<string, JDScreeningSummary>`.
  - Candidate list and JD list both use the same 70-point constant for qualified behavior.
