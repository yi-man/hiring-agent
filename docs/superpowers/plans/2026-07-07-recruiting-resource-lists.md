# 招聘资源列表 Implementation Plan

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** 新增顶层 `候选人列表`、`简历列表`、`面试记录`，把现有候选人筛选、简历和面试反馈数据整理成跨 JD 招聘资源视图。

**Architecture:** 复用现有 `Candidate`、`CandidateResume`、`CandidateScreeningResult`、`CandidateInterviewFeedback`、`JobDescription` 模型，不做 Prisma 迁移。新增 repository 查询和 API，再由客户端列表组件渲染筛选、链接和空状态；`/candidates` 复用并增强现有候选人跟踪组件。

**Tech Stack:** Next.js App Router、React、TypeScript、Prisma、HeroUI、lucide-react、Jest、Testing Library、Bun。

---

## 文件结构

- Modify: `src/lib/candidate-screening/repo.ts`
  - 新增简历库 DTO、面试记录 DTO、`listCandidateResumeLibrary`、`listCandidateInterviewRecords`。
  - 保持现有候选人筛选 repository API 不变。
- Modify: `src/lib/candidate-screening/repo.test.ts`
  - 为新 repository 查询补 TDD 覆盖，并扩展 Prisma mock。
- Create: `src/app/api/resumes/route.ts`
  - 登录后返回 `{ resumes }`。
- Create: `src/app/api/interviews/route.ts`
  - 登录后返回 `{ interviews }`。
- Modify: `tests/unit/api/candidate-screening-routes.test.ts`
  - 引入两个新 route，验证鉴权、limit 解析、返回体。
- Modify: `src/lib/candidate-screening/client.ts`
  - 新增 `fetchCandidateResumeLibrary` 和 `fetchCandidateInterviewRecords`。
- Create: `src/components/candidate-screening/resume-library.tsx`
  - 渲染简历列表、JD 挂载关系、原站链接。
- Create: `src/components/candidate-screening/interview-record-list.tsx`
  - 渲染跨 JD 面试记录列表和筛选。
- Modify: `src/components/candidate-screening/tracking-dashboard.tsx`
  - 把现有 `active/all` 范围改成 `active/ended/all`，显示 `录取/Offer` 和 `淘汰`。
- Modify: `tests/unit/components/CandidateScreening.test.tsx`
  - Mock 新 client 函数，测试简历列表、面试记录、候选人已结束范围。
- Create: `src/app/resumes/page.tsx`
  - 服务端鉴权后渲染 `ResumeLibrary`。
- Create: `src/app/interviews/page.tsx`
  - 服务端鉴权后渲染 `InterviewRecordList`。
- Create: `src/app/candidates/page.tsx`
  - 服务端鉴权后渲染增强后的 `CandidateTrackingDashboard`。
- Modify: `src/app/jd-generator/candidates/page.tsx`
  - 保持兼容入口，继续渲染同一组件。
- Modify: `src/components/app-sidebar.tsx`
  - 新增三个菜单项，调整图标导入。
- Create: `tests/unit/components/AppSidebar.test.tsx`
  - 验证菜单项和 active 状态。
- Modify: `src/components/dashboard/dashboard-page.tsx`
  - 把候选人跟踪和同步沟通入口指向 `/candidates`。

---

### Task 1: Repository DTO 与简历/面试查询

**Files:**
- Modify: `src/lib/candidate-screening/repo.test.ts`
- Modify: `src/lib/candidate-screening/repo.ts`

- [ ] **Step 1: 写简历库失败测试**

在 `src/lib/candidate-screening/repo.test.ts` 的 import 中加入 `listCandidateResumeLibrary`，扩展 `PrismaMock`：

```ts
type PrismaMock = {
  candidate: {
    findFirst: jest.Mock;
    upsert: jest.Mock;
  };
  candidateResume: {
    create: jest.Mock;
    findFirst: jest.Mock;
    findMany: jest.Mock;
    upsert: jest.Mock;
  };
  candidateInterviewFeedback: {
    findMany: jest.Mock;
  };
  candidateResumeChunk: {
    deleteMany: jest.Mock;
  };
  candidateScreeningRun: {
    create: jest.Mock;
    findFirst: jest.Mock;
    findMany: jest.Mock;
    updateMany: jest.Mock;
  };
  candidateScreeningResult: {
    create: jest.Mock;
    findFirst: jest.Mock;
    findMany: jest.Mock;
    upsert: jest.Mock;
    updateMany: jest.Mock;
  };
  candidateActionLog: {
    findFirst: jest.Mock;
    upsert: jest.Mock;
    updateMany: jest.Mock;
  };
  $executeRaw: jest.Mock;
  $queryRaw: jest.Mock;
  $transaction: jest.Mock;
};
```

在 `jest.mock('@/lib/prisma')` 中给 `candidateResume` 加 `findMany: jest.fn()`，并新增：

```ts
candidateInterviewFeedback: {
  findMany: jest.fn(),
},
```

在 `beforeEach` 中新增：

```ts
prismaMock.candidateResume.findMany.mockReset();
prismaMock.candidateInterviewFeedback.findMany.mockReset();
```

新增测试：

```ts
it('lists latest candidate resumes with mounted JD summaries', async () => {
  prismaMock.candidateResume.findMany.mockResolvedValueOnce([
    {
      id: 'resume-1',
      userId: 'u1',
      candidateId: 'candidate-1',
      sourcePlatform: 'boss-like',
      profileUrl: 'https://example.test/ada',
      rawText: 'TypeScript React product engineering leadership',
      structuredSummary: { skills: ['TypeScript', 'React'] },
      resumeHash: 'hash-new',
      fetchedAt: updatedAt,
      createdAt,
      candidate: {
        id: 'candidate-1',
        userId: 'u1',
        displayName: 'Ada',
        currentTitle: 'Frontend Lead',
        currentCompany: 'Analytical Engines',
        location: 'Remote',
        experienceYears: 8,
        sourcePlatform: 'boss-like',
        platformCandidateId: 'p-1',
        profileUrl: 'https://example.test/ada',
        identityKey: 'Ada|Analytical Engines',
        identityHash: 'hash-1',
        lastActiveAt: null,
        contacted: true,
        replied: true,
        lastContactAt: updatedAt,
        createdAt,
        updatedAt,
      },
    },
    {
      id: 'resume-old',
      userId: 'u1',
      candidateId: 'candidate-1',
      sourcePlatform: 'boss-like',
      profileUrl: null,
      rawText: 'Old resume',
      structuredSummary: null,
      resumeHash: 'hash-old',
      fetchedAt: createdAt,
      createdAt,
      candidate: {
        id: 'candidate-1',
        userId: 'u1',
        displayName: 'Ada',
        currentTitle: 'Frontend Lead',
        currentCompany: 'Analytical Engines',
        location: 'Remote',
        experienceYears: 8,
        sourcePlatform: 'boss-like',
        platformCandidateId: 'p-1',
        profileUrl: 'https://example.test/ada',
        identityKey: 'Ada|Analytical Engines',
        identityHash: 'hash-1',
        lastActiveAt: null,
        contacted: true,
        replied: true,
        lastContactAt: updatedAt,
        createdAt,
        updatedAt,
      },
    },
  ]);
  prismaMock.candidateScreeningResult.findMany.mockResolvedValueOnce([
    {
      id: 'result-1',
      userId: 'u1',
      runId: 'run-1',
      jobDescriptionId: 'jd-1',
      candidateId: 'candidate-1',
      resumeId: 'resume-1',
      source: 'both',
      tags: { skills: [], domainKnowledge: [], generalAbility: [], risk: [], activity: [], custom: [] },
      scoreDetail: { skill: 90, domain: 80, ability: 88, risk: 95, llmBonus: 0, total: 89 },
      finalScore: 89,
      rank: 1,
      decisionAction: 'chat',
      decisionPriority: 'high',
      decisionReason: 'Strong fit',
      actionPlan: null,
      actionStatus: 'planned',
      interviewStage: 'interviewing',
      notes: '下周一面',
      createdAt,
      updatedAt,
      jobDescription: {
        id: 'jd-1',
        userId: 'u1',
        department: '技术部',
        position: '高级前端工程师',
        positionDescription: 'Build UI',
        tone: 'tech',
        status: 'published',
        salaryRange: null,
        workLocations: null,
        content: { title: '高级前端工程师' },
        evaluation: null,
        generationMeta: null,
        createdAt,
        updatedAt,
      },
    },
  ]);

  const resumes = await listCandidateResumeLibrary({ userId: 'u1', limit: 20 });

  expect(prismaMock.candidateResume.findMany).toHaveBeenCalledWith({
    where: { userId: 'u1' },
    include: { candidate: true },
    orderBy: [{ fetchedAt: 'desc' }, { createdAt: 'desc' }],
    take: 60,
  });
  expect(prismaMock.candidateScreeningResult.findMany).toHaveBeenCalledWith({
    where: { userId: 'u1', candidateId: { in: ['candidate-1'] } },
    include: { jobDescription: true },
    orderBy: [{ updatedAt: 'desc' }, { finalScore: 'desc' }],
  });
  expect(resumes).toHaveLength(1);
  expect(resumes[0]).toMatchObject({
    resume: { id: 'resume-1', candidateId: 'candidate-1' },
    candidate: { displayName: 'Ada' },
    mountedJobs: [
      {
        screeningResultId: 'result-1',
        candidateId: 'candidate-1',
        resumeId: 'resume-1',
        finalScore: 89,
        interviewStage: 'interviewing',
        decisionAction: 'chat',
        jobDescription: {
          id: 'jd-1',
          position: '高级前端工程师',
        },
      },
    ],
  });
});
```

- [ ] **Step 2: 运行测试确认失败**

Run:

```bash
bun run test -- src/lib/candidate-screening/repo.test.ts -t "lists latest candidate resumes with mounted JD summaries"
```

Expected: FAIL，错误包含 `listCandidateResumeLibrary is not a function` 或导出不存在。

- [ ] **Step 3: 实现简历库 DTO 与查询**

在 `src/lib/candidate-screening/repo.ts` 的 DTO 区域新增：

```ts
type CandidateResumeLibraryRecord = CandidateResumeRecord & {
  candidate: CandidateRecord;
};

type ResumeMountedScreeningRecord = CandidateScreeningResultRecord & {
  jobDescription: TrackingJobDescriptionRecord;
};

export type CandidateResumeMountedJobDto = {
  screeningResultId: string;
  candidateId: string;
  resumeId: string | null;
  finalScore: number;
  interviewStage: CandidateInterviewStage;
  decisionAction: CandidateDecisionAction;
  updatedAt: string;
  jobDescription: CandidateTrackingJobDescriptionDto;
};

export type CandidateResumeLibraryItemDto = {
  resume: CandidateResumeDto;
  candidate: CandidateDto;
  mountedJobs: CandidateResumeMountedJobDto[];
};
```

在 helper 区域新增：

```ts
function mapResumeMountedJob(row: ResumeMountedScreeningRecord): CandidateResumeMountedJobDto {
  return {
    screeningResultId: row.id,
    candidateId: row.candidateId,
    resumeId: row.resumeId,
    finalScore: row.finalScore,
    interviewStage: row.interviewStage as CandidateInterviewStage,
    decisionAction: row.decisionAction as CandidateDecisionAction,
    updatedAt: iso(row.updatedAt),
    jobDescription: mapTrackingJobDescription(row.jobDescription),
  };
}
```

在 repository 导出区域新增：

```ts
export async function listCandidateResumeLibrary(params: {
  userId: string;
  limit?: number;
}): Promise<CandidateResumeLibraryItemDto[]> {
  const limit = Math.max(1, Math.min(500, Math.trunc(params.limit ?? 200)));
  const rows = (await prisma.candidateResume.findMany({
    where: { userId: params.userId },
    include: { candidate: true },
    orderBy: [{ fetchedAt: 'desc' }, { createdAt: 'desc' }],
    take: limit * 3,
  })) as CandidateResumeLibraryRecord[];

  const latestByCandidate = new Map<string, CandidateResumeLibraryRecord>();
  for (const row of rows) {
    if (!latestByCandidate.has(row.candidateId)) {
      latestByCandidate.set(row.candidateId, row);
    }
    if (latestByCandidate.size >= limit) {
      break;
    }
  }

  const latestRows = [...latestByCandidate.values()];
  const candidateIds = latestRows.map((row) => row.candidateId);
  const mountedRows =
    candidateIds.length === 0
      ? []
      : ((await prisma.candidateScreeningResult.findMany({
          where: { userId: params.userId, candidateId: { in: candidateIds } },
          include: { jobDescription: true },
          orderBy: [{ updatedAt: 'desc' }, { finalScore: 'desc' }],
        })) as ResumeMountedScreeningRecord[]);

  const mountedByCandidate = new Map<string, ResumeMountedScreeningRecord[]>();
  for (const mounted of mountedRows) {
    const current = mountedByCandidate.get(mounted.candidateId) ?? [];
    current.push(mounted);
    mountedByCandidate.set(mounted.candidateId, current);
  }

  return latestRows.map((row) => ({
    resume: mapResume(row),
    candidate: mapCandidate(row.candidate),
    mountedJobs: (mountedByCandidate.get(row.candidateId) ?? [])
      .sort((left, right) => {
        const leftExact = left.resumeId === row.id ? 0 : 1;
        const rightExact = right.resumeId === row.id ? 0 : 1;
        if (leftExact !== rightExact) return leftExact - rightExact;
        return right.updatedAt.getTime() - left.updatedAt.getTime();
      })
      .map(mapResumeMountedJob),
  }));
}
```

- [ ] **Step 4: 运行简历库测试确认通过**

Run:

```bash
bun run test -- src/lib/candidate-screening/repo.test.ts -t "lists latest candidate resumes with mounted JD summaries"
```

Expected: PASS。

- [ ] **Step 5: 写未挂载简历失败测试**

在同一 describe 中新增：

```ts
it('lists resumes without mounted JDs', async () => {
  prismaMock.candidateResume.findMany.mockResolvedValueOnce([
    {
      id: 'resume-2',
      userId: 'u1',
      candidateId: 'candidate-2',
      sourcePlatform: 'boss-like',
      profileUrl: null,
      rawText: 'Backend Go PostgreSQL',
      structuredSummary: null,
      resumeHash: 'hash-2',
      fetchedAt: updatedAt,
      createdAt,
      candidate: {
        id: 'candidate-2',
        userId: 'u1',
        displayName: 'Grace',
        currentTitle: 'Backend Engineer',
        currentCompany: null,
        location: null,
        experienceYears: null,
        sourcePlatform: 'boss-like',
        platformCandidateId: null,
        profileUrl: null,
        identityKey: 'Grace',
        identityHash: 'hash-2',
        lastActiveAt: null,
        contacted: false,
        replied: false,
        lastContactAt: null,
        createdAt,
        updatedAt,
      },
    },
  ]);
  prismaMock.candidateScreeningResult.findMany.mockResolvedValueOnce([]);

  const resumes = await listCandidateResumeLibrary({ userId: 'u1', limit: 20 });

  expect(resumes[0]?.mountedJobs).toEqual([]);
});
```

- [ ] **Step 6: 运行未挂载简历测试**

Run:

```bash
bun run test -- src/lib/candidate-screening/repo.test.ts -t "lists resumes without mounted JDs"
```

Expected: PASS。

- [ ] **Step 7: 写面试记录失败测试**

在 import 中加入 `listCandidateInterviewRecords`，新增测试：

```ts
it('lists interview records with candidate and JD context', async () => {
  prismaMock.candidateInterviewFeedback.findMany.mockResolvedValueOnce([
    {
      id: 'feedback-1',
      userId: 'u1',
      jobDescriptionId: 'jd-1',
      candidateId: 'candidate-1',
      stage: 'first_interview',
      interviewer: 'Grace Hopper',
      rating: 4,
      pros: ['TypeScript 扎实'],
      cons: ['系统设计需要追问'],
      decision: 'pass',
      notes: '建议二面',
      createdAt,
      updatedAt,
      candidate: {
        id: 'candidate-1',
        userId: 'u1',
        displayName: 'Ada',
        currentTitle: 'Frontend Lead',
        currentCompany: 'Analytical Engines',
        location: 'Remote',
        experienceYears: 8,
        sourcePlatform: 'boss-like',
        platformCandidateId: 'p-1',
        profileUrl: 'https://example.test/ada',
        identityKey: 'Ada|Analytical Engines',
        identityHash: 'hash-1',
        lastActiveAt: null,
        contacted: true,
        replied: true,
        lastContactAt: updatedAt,
        createdAt,
        updatedAt,
      },
      jobDescription: {
        id: 'jd-1',
        userId: 'u1',
        department: '技术部',
        position: '高级前端工程师',
        positionDescription: 'Build UI',
        tone: 'tech',
        status: 'published',
        salaryRange: null,
        workLocations: null,
        content: { title: '高级前端工程师' },
        evaluation: null,
        generationMeta: null,
        createdAt,
        updatedAt,
      },
    },
  ]);

  const records = await listCandidateInterviewRecords({ userId: 'u1', limit: 20 });

  expect(prismaMock.candidateInterviewFeedback.findMany).toHaveBeenCalledWith({
    where: { userId: 'u1' },
    include: { candidate: true, jobDescription: true },
    orderBy: [{ updatedAt: 'desc' }, { createdAt: 'desc' }],
    take: 20,
  });
  expect(records[0]).toMatchObject({
    id: 'feedback-1',
    candidate: { id: 'candidate-1', displayName: 'Ada' },
    jobDescription: { id: 'jd-1', position: '高级前端工程师' },
    stage: 'first_interview',
    decision: 'pass',
  });
});
```

- [ ] **Step 8: 运行面试记录测试确认失败**

Run:

```bash
bun run test -- src/lib/candidate-screening/repo.test.ts -t "lists interview records with candidate and JD context"
```

Expected: FAIL，错误包含 `listCandidateInterviewRecords is not a function` 或导出不存在。

- [ ] **Step 9: 实现面试记录 DTO 与查询**

在 `src/lib/candidate-screening/repo.ts` 新增：

```ts
type CandidateInterviewRecordRow = CandidateInterviewFeedbackRecord & {
  candidate: CandidateRecord;
  jobDescription: TrackingJobDescriptionRecord;
};

export type CandidateInterviewRecordDto = CandidateInterviewFeedbackDto & {
  candidate: CandidateDto;
  jobDescription: CandidateTrackingJobDescriptionDto;
};

function mapInterviewRecord(row: CandidateInterviewRecordRow): CandidateInterviewRecordDto {
  return {
    ...mapInterviewFeedback(row),
    candidate: mapCandidate(row.candidate),
    jobDescription: mapTrackingJobDescription(row.jobDescription),
  };
}

export async function listCandidateInterviewRecords(params: {
  userId: string;
  limit?: number;
}): Promise<CandidateInterviewRecordDto[]> {
  const limit = Math.max(1, Math.min(500, Math.trunc(params.limit ?? 200)));
  const rows = await prisma.candidateInterviewFeedback.findMany({
    where: { userId: params.userId },
    include: { candidate: true, jobDescription: true },
    orderBy: [{ updatedAt: 'desc' }, { createdAt: 'desc' }],
    take: limit,
  });
  return (rows as CandidateInterviewRecordRow[]).map(mapInterviewRecord);
}
```

- [ ] **Step 10: 运行 repository 全文件测试**

Run:

```bash
bun run test -- src/lib/candidate-screening/repo.test.ts
```

Expected: PASS。

- [ ] **Step 11: 提交 repository 变更**

```bash
git add src/lib/candidate-screening/repo.ts src/lib/candidate-screening/repo.test.ts
git commit -m "feat: add recruiting resource repository queries"
```

---

### Task 2: 顶层简历和面试 API

**Files:**
- Create: `src/app/api/resumes/route.ts`
- Create: `src/app/api/interviews/route.ts`
- Modify: `tests/unit/api/candidate-screening-routes.test.ts`

- [ ] **Step 1: 写 API 失败测试**

在 `tests/unit/api/candidate-screening-routes.test.ts` 顶部新增 import：

```ts
import { GET as listResumeLibraryRoute } from '@/app/api/resumes/route';
import { GET as listInterviewRecordsRoute } from '@/app/api/interviews/route';
```

新增 mocks：

```ts
const listCandidateResumeLibraryMock = jest.fn();
const listCandidateInterviewRecordsMock = jest.fn();
```

在 `jest.mock('@/lib/candidate-screening/repo', () => ({ ... }))` 中加入：

```ts
listCandidateResumeLibrary: (...args: unknown[]) => listCandidateResumeLibraryMock(...args),
listCandidateInterviewRecords: (...args: unknown[]) => listCandidateInterviewRecordsMock(...args),
```

在 `beforeEach` 中加入：

```ts
listCandidateResumeLibraryMock.mockReset();
listCandidateInterviewRecordsMock.mockReset();
```

新增测试：

```ts
it('lists resume library records for the current user', async () => {
  listCandidateResumeLibraryMock.mockResolvedValueOnce([
    {
      resume: sampleResume,
      candidate: sampleCandidate,
      mountedJobs: [
        {
          screeningResultId: 'result-1',
          candidateId: 'cand-1',
          resumeId: 'resume-1',
          finalScore: 89,
          interviewStage: 'to_contact',
          decisionAction: 'chat',
          updatedAt: now,
          jobDescription: {
            id: 'jd-1',
            department: 'Engineering',
            position: 'Frontend Engineer',
            status: 'published',
            title: 'Frontend Engineer',
            updatedAt: now,
          },
        },
      ],
    },
  ]);

  const response = await listResumeLibraryRoute(
    new Request('http://localhost/api/resumes?limit=9999'),
  );
  const body = await response.json();

  expect(response.status).toBe(200);
  expect(body.resumes).toHaveLength(1);
  expect(listCandidateResumeLibraryMock).toHaveBeenCalledWith({ userId: 'u1', limit: 500 });
});

it('lists interview records for the current user', async () => {
  listCandidateInterviewRecordsMock.mockResolvedValueOnce([
    {
      ...sampleFeedback,
      candidate: sampleCandidate,
      jobDescription: {
        id: 'jd-1',
        department: 'Engineering',
        position: 'Frontend Engineer',
        status: 'published',
        title: 'Frontend Engineer',
        updatedAt: now,
      },
    },
  ]);

  const response = await listInterviewRecordsRoute(
    new Request('http://localhost/api/interviews?limit=abc'),
  );
  const body = await response.json();

  expect(response.status).toBe(200);
  expect(body.interviews).toHaveLength(1);
  expect(listCandidateInterviewRecordsMock).toHaveBeenCalledWith({ userId: 'u1', limit: 200 });
});
```

- [ ] **Step 2: 运行 API 测试确认失败**

Run:

```bash
bun run test -- tests/unit/api/candidate-screening-routes.test.ts -t "lists resume library records|lists interview records"
```

Expected: FAIL，错误包含无法解析 `@/app/api/resumes/route` 或 `@/app/api/interviews/route`。

- [ ] **Step 3: 创建简历 API route**

Create `src/app/api/resumes/route.ts`:

```ts
import { NextResponse } from 'next/server';
import { requireAuth, UnauthorizedError } from '@/lib/auth/session';
import { listCandidateResumeLibrary } from '@/lib/candidate-screening/repo';

const DEFAULT_LIMIT = 200;
const MAX_LIMIT = 500;

function parseLimit(value: string | null): number {
  if (value === null) return DEFAULT_LIMIT;
  const parsed = Number(value);
  if (!Number.isFinite(parsed)) return DEFAULT_LIMIT;
  return Math.max(1, Math.min(MAX_LIMIT, Math.trunc(parsed)));
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

export async function GET(request: Request) {
  try {
    const auth = await requireAuth();
    const { searchParams } = new URL(request.url);
    const resumes = await listCandidateResumeLibrary({
      userId: auth.user.id,
      limit: parseLimit(searchParams.get('limit')),
    });
    return NextResponse.json({ resumes });
  } catch (error) {
    return serverErrorResponse(error);
  }
}
```

- [ ] **Step 4: 创建面试 API route**

Create `src/app/api/interviews/route.ts`:

```ts
import { NextResponse } from 'next/server';
import { requireAuth, UnauthorizedError } from '@/lib/auth/session';
import { listCandidateInterviewRecords } from '@/lib/candidate-screening/repo';

const DEFAULT_LIMIT = 200;
const MAX_LIMIT = 500;

function parseLimit(value: string | null): number {
  if (value === null) return DEFAULT_LIMIT;
  const parsed = Number(value);
  if (!Number.isFinite(parsed)) return DEFAULT_LIMIT;
  return Math.max(1, Math.min(MAX_LIMIT, Math.trunc(parsed)));
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

export async function GET(request: Request) {
  try {
    const auth = await requireAuth();
    const { searchParams } = new URL(request.url);
    const interviews = await listCandidateInterviewRecords({
      userId: auth.user.id,
      limit: parseLimit(searchParams.get('limit')),
    });
    return NextResponse.json({ interviews });
  } catch (error) {
    return serverErrorResponse(error);
  }
}
```

- [ ] **Step 5: 运行 API 测试确认通过**

Run:

```bash
bun run test -- tests/unit/api/candidate-screening-routes.test.ts -t "lists resume library records|lists interview records"
```

Expected: PASS。

- [ ] **Step 6: 提交 API 变更**

```bash
git add src/app/api/resumes/route.ts src/app/api/interviews/route.ts tests/unit/api/candidate-screening-routes.test.ts
git commit -m "feat: add recruiting resource API routes"
```

---

### Task 3: Client fetch 函数

**Files:**
- Modify: `src/lib/candidate-screening/client.ts`

- [ ] **Step 1: 写组件测试前置 mock 签名**

在 `tests/unit/components/CandidateScreening.test.tsx` 顶部新增 mock 函数：

```ts
const fetchCandidateResumeLibraryMock = jest.fn();
const fetchCandidateInterviewRecordsMock = jest.fn();
```

在 `jest.mock('@/lib/candidate-screening/client', () => ({ ... }))` 中加入：

```ts
fetchCandidateResumeLibrary: (...args: unknown[]) => fetchCandidateResumeLibraryMock(...args),
fetchCandidateInterviewRecords: (...args: unknown[]) => fetchCandidateInterviewRecordsMock(...args),
```

在 `beforeEach` 中加入：

```ts
fetchCandidateResumeLibraryMock.mockReset();
fetchCandidateInterviewRecordsMock.mockReset();
```

本步暂不运行测试；下一任务会创建组件并使用这些 mock。

- [ ] **Step 2: 实现 client fetch 函数**

在 `src/lib/candidate-screening/client.ts` import 中加入：

```ts
  CandidateInterviewRecordDto,
  CandidateResumeLibraryItemDto,
```

新增函数：

```ts
export async function fetchCandidateResumeLibrary(
  limit = 200,
): Promise<CandidateResumeLibraryItemDto[]> {
  const params = new URLSearchParams();
  appendSearchParam(params, 'limit', limit);
  const response = await fetch(`/api/resumes?${params.toString()}`);
  const data = await readJson<{ resumes?: CandidateResumeLibraryItemDto[] }>(response);
  if (!response.ok || !Array.isArray(data.resumes)) {
    throw new Error(data.error || '加载简历列表失败');
  }
  return data.resumes;
}

export async function fetchCandidateInterviewRecords(
  limit = 200,
): Promise<CandidateInterviewRecordDto[]> {
  const params = new URLSearchParams();
  appendSearchParam(params, 'limit', limit);
  const response = await fetch(`/api/interviews?${params.toString()}`);
  const data = await readJson<{ interviews?: CandidateInterviewRecordDto[] }>(response);
  if (!response.ok || !Array.isArray(data.interviews)) {
    throw new Error(data.error || '加载面试记录失败');
  }
  return data.interviews;
}
```

- [ ] **Step 3: 运行 type-check 捕捉导入错误**

Run:

```bash
bun run type-check
```

Expected: PASS。

- [ ] **Step 4: 提交 client 变更**

```bash
git add src/lib/candidate-screening/client.ts tests/unit/components/CandidateScreening.test.tsx
git commit -m "feat: add recruiting resource client fetchers"
```

---

### Task 4: 简历列表与面试记录组件

**Files:**
- Create: `src/components/candidate-screening/resume-library.tsx`
- Create: `src/components/candidate-screening/interview-record-list.tsx`
- Modify: `tests/unit/components/CandidateScreening.test.tsx`

- [ ] **Step 1: 写简历列表失败测试**

在 `tests/unit/components/CandidateScreening.test.tsx` import 中加入：

```ts
import { ResumeLibrary } from '@/components/candidate-screening/resume-library';
```

在样例数据区域新增：

```ts
const sampleResumeLibraryItem = {
  resume: sampleResume,
  candidate: sampleCandidate,
  mountedJobs: [
    {
      screeningResultId: 'result-1',
      candidateId: 'cand-1',
      resumeId: 'resume-1',
      finalScore: 89,
      interviewStage: 'to_contact',
      decisionAction: 'chat',
      updatedAt: now,
      jobDescription: {
        id: 'jd-1',
        department: 'Engineering',
        position: 'Frontend Engineer',
        status: 'published',
        title: 'Frontend Engineer',
        updatedAt: now,
      },
    },
  ],
};
```

在 `beforeEach` 中加入：

```ts
fetchCandidateResumeLibraryMock.mockResolvedValue([sampleResumeLibraryItem]);
```

新增测试：

```ts
it('renders resume library with mounted JD links and source profile action', async () => {
  render(<ResumeLibrary />);

  expect(await screen.findByText('简历列表')).toBeInTheDocument();
  expect(screen.getByRole('link', { name: /Ada Lovelace/ })).toHaveAttribute(
    'href',
    '/jd-generator/jd-1/candidates/cand-1',
  );
  expect(screen.getByRole('link', { name: /Frontend Engineer/ })).toHaveAttribute(
    'href',
    '/jd-generator/jd-1',
  );
  expect(screen.getByRole('button', { name: '查看原站' })).toHaveAttribute(
    'href',
    '/api/jd/jd-1/candidates/cand-1/original-profile',
  );
  expect(screen.getByText(/TypeScript, React, product engineering/)).toBeInTheDocument();
});
```

- [ ] **Step 2: 运行简历组件测试确认失败**

Run:

```bash
bun run test -- tests/unit/components/CandidateScreening.test.tsx -t "renders resume library"
```

Expected: FAIL，错误包含无法解析 `resume-library`。

- [ ] **Step 3: 创建简历列表组件**

Create `src/components/candidate-screening/resume-library.tsx`:

```tsx
'use client';

import { useEffect, useMemo, useState } from 'react';
import Link from 'next/link';
import { ExternalLink, FileText, ListFilter, RefreshCw } from 'lucide-react';
import { Button } from '@/components/ui';
import { fetchCandidateResumeLibrary } from '@/lib/candidate-screening/client';
import type { CandidateResumeLibraryItemDto } from '@/lib/candidate-screening/repo';

function formatDateTime(value: string | null) {
  if (!value) return '暂无时间';
  const date = new Date(value);
  if (Number.isNaN(date.getTime())) return '暂无时间';
  return new Intl.DateTimeFormat('zh-CN', { dateStyle: 'medium', timeStyle: 'short' }).format(date);
}

function candidateSubtitle(item: CandidateResumeLibraryItemDto) {
  return [item.candidate.currentTitle, item.candidate.currentCompany, item.candidate.location]
    .filter(Boolean)
    .join(' · ');
}

function resumePreview(rawText: string) {
  const compact = rawText.replace(/\s+/g, ' ').trim();
  return compact.length > 120 ? `${compact.slice(0, 120)}...` : compact;
}

export function ResumeLibrary() {
  const [items, setItems] = useState<CandidateResumeLibraryItemDto[]>([]);
  const [isLoading, setIsLoading] = useState(true);
  const [error, setError] = useState('');

  async function loadResumes(options?: { silent?: boolean }) {
    if (!options?.silent) setIsLoading(true);
    setError('');
    try {
      setItems(await fetchCandidateResumeLibrary(200));
    } catch (e) {
      setError(e instanceof Error ? e.message : '加载简历列表失败');
    } finally {
      setIsLoading(false);
    }
  }

  useEffect(() => {
    void loadResumes();
  }, []);

  const totalMounted = useMemo(
    () => items.reduce((total, item) => total + item.mountedJobs.length, 0),
    [items],
  );

  return (
    <div className="space-y-4">
      <div className="border-border flex flex-col gap-3 border-b pb-4 lg:flex-row lg:items-end lg:justify-between">
        <div className="min-w-0">
          <div className="flex items-center gap-2">
            <FileText className="text-muted-foreground h-5 w-5" aria-hidden />
            <h1 className="text-foreground text-2xl font-semibold tracking-normal">简历列表</h1>
          </div>
          <p className="text-muted-foreground mt-1 text-sm">
            集中查看候选人最新简历，以及每份简历当前挂载到哪些 JD。
          </p>
        </div>
        <Button
          className="gap-2 self-start lg:self-auto"
          isDisabled={isLoading}
          type="button"
          variant="bordered"
          onClick={() => void loadResumes({ silent: true })}
        >
          <RefreshCw className="h-4 w-4" aria-hidden />
          刷新
        </Button>
      </div>

      {error ? (
        <div className="border-destructive/30 bg-destructive/10 text-destructive rounded-md border px-4 py-3 text-sm">
          {error}
        </div>
      ) : null}

      <section className="border-border overflow-hidden rounded-lg border">
        <div className="border-border flex items-center justify-between border-b px-4 py-3">
          <div className="flex items-center gap-2 text-sm font-medium">
            <ListFilter className="text-muted-foreground h-4 w-4" aria-hidden />
            最新简历
          </div>
          <div className="text-muted-foreground text-xs">
            {isLoading ? '加载中' : `${items.length} 份 · ${totalMounted} 个 JD 挂载`}
          </div>
        </div>
        {isLoading ? (
          <div className="text-muted-foreground px-4 py-10 text-center text-sm">
            正在加载简历…
          </div>
        ) : items.length === 0 ? (
          <div className="text-muted-foreground px-4 py-10 text-center text-sm">
            暂无简历记录
          </div>
        ) : (
          <div className="divide-border divide-y">
            {items.map((item) => {
              const primaryMount = item.mountedJobs[0];
              const candidateHref = primaryMount
                ? `/jd-generator/${primaryMount.jobDescription.id}/candidates/${item.candidate.id}`
                : '#';
              const sourceHref = primaryMount
                ? `/api/jd/${primaryMount.jobDescription.id}/candidates/${item.candidate.id}/original-profile`
                : (item.candidate.profileUrl ?? item.resume.profileUrl);

              return (
                <article
                  key={item.resume.id}
                  className="grid gap-3 px-4 py-4 xl:grid-cols-[minmax(0,1.2fr)_minmax(0,1fr)_minmax(0,1.2fr)_132px] xl:items-center"
                >
                  <div className="min-w-0">
                    {primaryMount ? (
                      <Link
                        className="text-foreground block truncate text-sm font-medium hover:underline"
                        href={candidateHref}
                      >
                        {item.candidate.displayName}
                      </Link>
                    ) : (
                      <span className="text-foreground block truncate text-sm font-medium">
                        {item.candidate.displayName}
                      </span>
                    )}
                    <div className="text-muted-foreground mt-1 truncate text-xs">
                      {candidateSubtitle(item) || '候选人信息待补充'}
                    </div>
                    <div className="text-muted-foreground mt-1 text-xs">
                      {item.resume.sourcePlatform} · {formatDateTime(item.resume.fetchedAt)}
                    </div>
                  </div>
                  <div className="text-muted-foreground min-w-0 text-xs leading-5">
                    {resumePreview(item.resume.rawText) || '暂无简历内容'}
                  </div>
                  <div className="min-w-0">
                    {item.mountedJobs.length === 0 ? (
                      <span className="text-muted-foreground text-xs">未挂载 JD</span>
                    ) : (
                      <div className="flex flex-wrap gap-2">
                        {item.mountedJobs.slice(0, 3).map((mount) => (
                          <Link
                            key={mount.screeningResultId}
                            className="border-border hover:border-primary/40 rounded-md border px-2 py-1 text-xs hover:underline"
                            href={`/jd-generator/${mount.jobDescription.id}`}
                          >
                            {mount.jobDescription.position}
                          </Link>
                        ))}
                        {item.mountedJobs.length > 3 ? (
                          <span className="text-muted-foreground text-xs">
                            +{item.mountedJobs.length - 3} 个
                          </span>
                        ) : null}
                      </div>
                    )}
                  </div>
                  <div className="flex flex-wrap gap-2 xl:justify-end">
                    {sourceHref ? (
                      <Button
                        as={Link}
                        className="gap-1"
                        href={sourceHref}
                        prefetch={false}
                        rel="noreferrer"
                        size="sm"
                        target="_blank"
                        variant="bordered"
                      >
                        <ExternalLink className="h-3.5 w-3.5" aria-hidden />
                        查看原站
                      </Button>
                    ) : null}
                  </div>
                </article>
              );
            })}
          </div>
        )}
      </section>
    </div>
  );
}
```

- [ ] **Step 4: 写面试记录失败测试**

在 import 中加入：

```ts
import { InterviewRecordList } from '@/components/candidate-screening/interview-record-list';
```

在 `beforeEach` 中加入：

```ts
fetchCandidateInterviewRecordsMock.mockResolvedValue([
  {
    ...sampleFeedback,
    candidate: sampleCandidate,
    jobDescription: {
      id: 'jd-1',
      department: 'Engineering',
      position: 'Frontend Engineer',
      status: 'published',
      title: 'Frontend Engineer',
      updatedAt: now,
    },
  },
]);
```

新增测试：

```ts
it('renders interview records with candidate and JD links', async () => {
  render(<InterviewRecordList />);

  expect(await screen.findByText('面试记录')).toBeInTheDocument();
  expect(screen.getByRole('link', { name: /Ada Lovelace/ })).toHaveAttribute(
    'href',
    '/jd-generator/jd-1/candidates/cand-1',
  );
  expect(screen.getByRole('link', { name: /Frontend Engineer/ })).toHaveAttribute(
    'href',
    '/jd-generator/jd-1',
  );
  expect(screen.getByText('Grace Hopper')).toBeInTheDocument();
  expect(screen.getByText('pass')).toBeInTheDocument();
  expect(screen.getByText(/TypeScript 扎实/)).toBeInTheDocument();
});
```

- [ ] **Step 5: 运行面试组件测试确认失败**

Run:

```bash
bun run test -- tests/unit/components/CandidateScreening.test.tsx -t "renders interview records"
```

Expected: FAIL，错误包含无法解析 `interview-record-list`。

- [ ] **Step 6: 创建面试记录组件**

Create `src/components/candidate-screening/interview-record-list.tsx`:

```tsx
'use client';

import { useEffect, useMemo, useState } from 'react';
import Link from 'next/link';
import { ClipboardList, ListFilter, RefreshCw } from 'lucide-react';
import { Button, Chip } from '@/components/ui';
import { fetchCandidateInterviewRecords } from '@/lib/candidate-screening/client';
import type { CandidateInterviewRecordDto } from '@/lib/candidate-screening/repo';
import type {
  CandidateInterviewFeedbackDecision,
  CandidateInterviewFeedbackStage,
} from '@/lib/candidate-screening/types';

function formatDateTime(value: string) {
  const date = new Date(value);
  if (Number.isNaN(date.getTime())) return '暂无时间';
  return new Intl.DateTimeFormat('zh-CN', { dateStyle: 'medium', timeStyle: 'short' }).format(date);
}

function candidateSubtitle(item: CandidateInterviewRecordDto) {
  return [item.candidate.currentTitle, item.candidate.currentCompany, item.candidate.location]
    .filter(Boolean)
    .join(' · ');
}

const stageOptions: Array<{ value: '' | CandidateInterviewFeedbackStage; label: string }> = [
  { value: '', label: '全部阶段' },
  { value: 'first_interview', label: 'first_interview' },
  { value: 'second_interview', label: 'second_interview' },
  { value: 'final_interview', label: 'final_interview' },
];

const decisionOptions: Array<{ value: '' | CandidateInterviewFeedbackDecision; label: string }> = [
  { value: '', label: '全部结论' },
  { value: 'pass', label: 'pass' },
  { value: 'reject', label: 'reject' },
  { value: 'hold', label: 'hold' },
];

export function InterviewRecordList() {
  const [items, setItems] = useState<CandidateInterviewRecordDto[]>([]);
  const [stage, setStage] = useState<'' | CandidateInterviewFeedbackStage>('');
  const [decision, setDecision] = useState<'' | CandidateInterviewFeedbackDecision>('');
  const [jobDescriptionId, setJobDescriptionId] = useState('');
  const [isLoading, setIsLoading] = useState(true);
  const [error, setError] = useState('');

  async function loadRecords(options?: { silent?: boolean }) {
    if (!options?.silent) setIsLoading(true);
    setError('');
    try {
      setItems(await fetchCandidateInterviewRecords(200));
    } catch (e) {
      setError(e instanceof Error ? e.message : '加载面试记录失败');
    } finally {
      setIsLoading(false);
    }
  }

  useEffect(() => {
    void loadRecords();
  }, []);

  const jobs = useMemo(() => {
    const byId = new Map<string, CandidateInterviewRecordDto['jobDescription']>();
    for (const item of items) byId.set(item.jobDescription.id, item.jobDescription);
    return [...byId.values()];
  }, [items]);

  const filteredItems = useMemo(
    () =>
      items.filter((item) => {
        if (jobDescriptionId && item.jobDescription.id !== jobDescriptionId) return false;
        if (stage && item.stage !== stage) return false;
        if (decision && item.decision !== decision) return false;
        return true;
      }),
    [decision, items, jobDescriptionId, stage],
  );

  return (
    <div className="space-y-4">
      <div className="border-border flex flex-col gap-3 border-b pb-4 lg:flex-row lg:items-end lg:justify-between">
        <div className="min-w-0">
          <div className="flex items-center gap-2">
            <ClipboardList className="text-muted-foreground h-5 w-5" aria-hidden />
            <h1 className="text-foreground text-2xl font-semibold tracking-normal">面试记录</h1>
          </div>
          <p className="text-muted-foreground mt-1 text-sm">
            跨 JD 查看面试反馈，快速回到候选人和岗位上下文。
          </p>
        </div>
        <Button
          className="gap-2 self-start lg:self-auto"
          isDisabled={isLoading}
          type="button"
          variant="bordered"
          onClick={() => void loadRecords({ silent: true })}
        >
          <RefreshCw className="h-4 w-4" aria-hidden />
          刷新
        </Button>
      </div>

      <section className="border-border rounded-lg border p-4">
        <div className="mb-3 flex items-center gap-2 text-sm font-medium">
          <ListFilter className="text-muted-foreground h-4 w-4" aria-hidden />
          筛选
        </div>
        <div className="grid gap-3 md:grid-cols-3">
          <label className="space-y-2">
            <span className="text-muted-foreground text-xs">JD</span>
            <select
              aria-label="JD 筛选"
              className="border-input bg-background text-foreground h-10 w-full rounded-md border px-3 text-sm"
              value={jobDescriptionId}
              onChange={(event) => setJobDescriptionId(event.target.value)}
            >
              <option value="">全部 JD</option>
              {jobs.map((job) => (
                <option key={job.id} value={job.id}>
                  {job.position}
                </option>
              ))}
            </select>
          </label>
          <label className="space-y-2">
            <span className="text-muted-foreground text-xs">阶段</span>
            <select
              aria-label="面试阶段筛选"
              className="border-input bg-background text-foreground h-10 w-full rounded-md border px-3 text-sm"
              value={stage}
              onChange={(event) => setStage(event.target.value as '' | CandidateInterviewFeedbackStage)}
            >
              {stageOptions.map((option) => (
                <option key={option.label} value={option.value}>
                  {option.label}
                </option>
              ))}
            </select>
          </label>
          <label className="space-y-2">
            <span className="text-muted-foreground text-xs">结论</span>
            <select
              aria-label="面试结论"
              className="border-input bg-background text-foreground h-10 w-full rounded-md border px-3 text-sm"
              value={decision}
              onChange={(event) =>
                setDecision(event.target.value as '' | CandidateInterviewFeedbackDecision)
              }
            >
              {decisionOptions.map((option) => (
                <option key={option.label} value={option.value}>
                  {option.label}
                </option>
              ))}
            </select>
          </label>
        </div>
      </section>

      {error ? (
        <div className="border-destructive/30 bg-destructive/10 text-destructive rounded-md border px-4 py-3 text-sm">
          {error}
        </div>
      ) : null}

      <section className="border-border overflow-hidden rounded-lg border">
        <div className="border-border flex items-center justify-between border-b px-4 py-3">
          <div className="text-sm font-medium">记录</div>
          <div className="text-muted-foreground text-xs">
            {isLoading ? '加载中' : `${filteredItems.length} 条`}
          </div>
        </div>
        {isLoading ? (
          <div className="text-muted-foreground px-4 py-10 text-center text-sm">
            正在加载面试记录…
          </div>
        ) : filteredItems.length === 0 ? (
          <div className="text-muted-foreground px-4 py-10 text-center text-sm">
            暂无面试记录
          </div>
        ) : (
          <div className="divide-border divide-y">
            {filteredItems.map((item) => (
              <article
                key={item.id}
                className="grid gap-3 px-4 py-4 xl:grid-cols-[minmax(0,1fr)_minmax(0,1fr)_100px_80px_90px_minmax(0,1fr)] xl:items-center"
              >
                <div className="min-w-0">
                  <Link
                    className="text-foreground block truncate text-sm font-medium hover:underline"
                    href={`/jd-generator/${item.jobDescription.id}/candidates/${item.candidate.id}`}
                  >
                    {item.candidate.displayName}
                  </Link>
                  <div className="text-muted-foreground mt-1 truncate text-xs">
                    {candidateSubtitle(item) || '候选人信息待补充'}
                  </div>
                </div>
                <Link
                  className="text-muted-foreground block min-w-0 truncate text-xs hover:underline"
                  href={`/jd-generator/${item.jobDescription.id}`}
                >
                  {item.jobDescription.position}
                </Link>
                <Chip size="sm" variant="flat">
                  {item.stage}
                </Chip>
                <span className="font-mono text-sm">{item.rating}</span>
                <span className="text-sm">{item.decision}</span>
                <div className="text-muted-foreground min-w-0 text-xs leading-5">
                  <div className="truncate">面试官：{item.interviewer}</div>
                  <div className="truncate">优势：{item.pros.join('、') || '暂无'}</div>
                  <div className="truncate">风险：{item.cons.join('、') || '暂无'}</div>
                  {item.notes ? <div className="text-foreground truncate">{item.notes}</div> : null}
                  <div>{formatDateTime(item.updatedAt)}</div>
                </div>
              </article>
            ))}
          </div>
        )}
      </section>
    </div>
  );
}
```

- [ ] **Step 7: 运行组件测试确认通过**

Run:

```bash
bun run test -- tests/unit/components/CandidateScreening.test.tsx -t "renders resume library|renders interview records"
```

Expected: PASS。

- [ ] **Step 8: 提交组件变更**

```bash
git add src/components/candidate-screening/resume-library.tsx src/components/candidate-screening/interview-record-list.tsx tests/unit/components/CandidateScreening.test.tsx
git commit -m "feat: add resume and interview resource lists"
```

---

### Task 5: 候选人列表路由与结束状态映射

**Files:**
- Modify: `src/components/candidate-screening/tracking-dashboard.tsx`
- Modify: `tests/unit/components/CandidateScreening.test.tsx`
- Create: `src/app/candidates/page.tsx`
- Modify: `src/app/jd-generator/candidates/page.tsx`

- [ ] **Step 1: 写候选人已结束范围失败测试**

在 `sampleTrackingOverview.candidates` 中保留现有 active 候选人，并在测试内覆盖 mock：

```ts
it('candidate tracking dashboard separates active and ended candidates', async () => {
  fetchCandidateTrackingOverviewMock.mockResolvedValueOnce({
    jobs: sampleTrackingOverview.jobs,
    candidates: [
      sampleTrackingOverview.candidates[0],
      {
        ...sampleTrackingOverview.candidates[0],
        id: 'result-ended',
        candidateId: 'cand-ended',
        candidate: {
          ...sampleCandidate,
          id: 'cand-ended',
          displayName: 'Ended Candidate',
        },
        interviewStage: 'rejected',
        decisionAction: 'skip',
      },
      {
        ...sampleTrackingOverview.candidates[0],
        id: 'result-offer',
        candidateId: 'cand-offer',
        candidate: {
          ...sampleCandidate,
          id: 'cand-offer',
          displayName: 'Offer Candidate',
        },
        interviewStage: 'offer',
      },
    ],
  });

  render(<CandidateTrackingDashboard />);

  expect(await screen.findByRole('link', { name: /Ada Lovelace/ })).toBeInTheDocument();
  expect(screen.queryByRole('link', { name: /Ended Candidate/ })).not.toBeInTheDocument();

  fireEvent.change(screen.getByLabelText('跟踪范围'), { target: { value: 'ended' } });

  expect(await screen.findByRole('link', { name: /Ended Candidate/ })).toBeInTheDocument();
  expect(screen.getByRole('link', { name: /Offer Candidate/ })).toBeInTheDocument();
  expect(screen.queryByRole('link', { name: /Ada Lovelace/ })).not.toBeInTheDocument();
  expect(screen.getByText('淘汰')).toBeInTheDocument();
  expect(screen.getByText('录取/Offer')).toBeInTheDocument();
});
```

- [ ] **Step 2: 运行测试确认失败**

Run:

```bash
bun run test -- tests/unit/components/CandidateScreening.test.tsx -t "separates active and ended candidates"
```

Expected: FAIL，`跟踪范围` 下拉没有 `ended` 行为或没有 `淘汰`/`录取/Offer` 文案。

- [ ] **Step 3: 实现状态映射**

在 `src/components/candidate-screening/tracking-dashboard.tsx` 中替换 active 判断并新增函数：

```ts
type CandidateScope = 'active' | 'ended' | 'all';

function getCandidateProgressLabel(item: CandidateTrackingCandidateDto) {
  if (item.interviewStage === 'offer') return '录取/Offer';
  if (
    item.interviewStage === 'rejected' ||
    item.interviewStage === 'withdrawn' ||
    item.decisionAction === 'skip'
  ) {
    return '淘汰';
  }
  return '正在推进';
}

function isEndedCandidate(item: CandidateTrackingCandidateDto) {
  return getCandidateProgressLabel(item) !== '正在推进';
}

function isActiveCandidate(item: CandidateTrackingCandidateDto) {
  return !isEndedCandidate(item);
}
```

把 state 改成：

```ts
const [scope, setScope] = useState<CandidateScope>('active');
```

把过滤逻辑改成：

```ts
if (scope === 'active' && !isActiveCandidate(candidate)) return false;
if (scope === 'ended' && !isEndedCandidate(candidate)) return false;
```

把范围 select 改成：

```tsx
<select
  aria-label="跟踪范围"
  className="border-input bg-background text-foreground h-10 w-full rounded-md border px-3 text-sm"
  value={scope}
  onChange={(event) => setScope(event.target.value as CandidateScope)}
>
  <option value="active">正在推进</option>
  <option value="ended">已结束</option>
  <option value="all">全部候选人</option>
</select>
```

在候选人行中 `interviewStage` 附近增加：

```tsx
<span className="text-muted-foreground text-xs">{getCandidateProgressLabel(item)}</span>
```

如果 grid 列数不够，把候选人行布局改为：

```tsx
className="grid gap-3 px-4 py-4 xl:grid-cols-[minmax(0,1.2fr)_minmax(0,1fr)_72px_96px_100px_100px_140px] xl:items-center"
```

- [ ] **Step 4: 创建 `/candidates` 页面**

Create `src/app/candidates/page.tsx`:

```tsx
import { SignInButton } from '@/components/auth/sign-in-button';
import { CandidateTrackingDashboard } from '@/components/candidate-screening/tracking-dashboard';
import { getServerAuthSession } from '@/lib/auth/session';

export default async function CandidatesPage() {
  const session = await getServerAuthSession();

  return (
    <section className="container mx-auto px-4 py-8">
      {!session?.user ? (
        <div className="border-border bg-background/60 rounded-xl border p-8 text-center backdrop-blur">
          <h1 className="text-foreground text-xl font-semibold">请先登录后继续</h1>
          <p className="text-muted-foreground mt-2 text-sm">
            登录本地账号后即可查看跨 JD 的候选人列表。
          </p>
          <div className="mt-6 flex justify-center">
            <SignInButton />
          </div>
        </div>
      ) : (
        <CandidateTrackingDashboard />
      )}
    </section>
  );
}
```

- [ ] **Step 5: 保持旧入口可用**

Modify `src/app/jd-generator/candidates/page.tsx` 仅调整文案为兼容入口，不改变组件：

```tsx
import { SignInButton } from '@/components/auth/sign-in-button';
import { CandidateTrackingDashboard } from '@/components/candidate-screening/tracking-dashboard';
import { getServerAuthSession } from '@/lib/auth/session';

export default async function CandidateTrackingPage() {
  const session = await getServerAuthSession();

  return (
    <section className="container mx-auto px-4 py-8">
      {!session?.user ? (
        <div className="border-border bg-background/60 rounded-xl border p-8 text-center backdrop-blur">
          <h1 className="text-foreground text-xl font-semibold">请先登录后继续</h1>
          <p className="text-muted-foreground mt-2 text-sm">
            登录本地账号后即可查看跨 JD 的候选人列表。
          </p>
          <div className="mt-6 flex justify-center">
            <SignInButton />
          </div>
        </div>
      ) : (
        <CandidateTrackingDashboard />
      )}
    </section>
  );
}
```

- [ ] **Step 6: 运行候选人组件测试**

Run:

```bash
bun run test -- tests/unit/components/CandidateScreening.test.tsx -t "candidate tracking dashboard"
```

Expected: PASS。

- [ ] **Step 7: 提交候选人路由变更**

```bash
git add src/components/candidate-screening/tracking-dashboard.tsx tests/unit/components/CandidateScreening.test.tsx src/app/candidates/page.tsx src/app/jd-generator/candidates/page.tsx
git commit -m "feat: add candidate resource route"
```

---

### Task 6: 页面路由、侧边栏菜单与工作台入口

**Files:**
- Create: `src/app/resumes/page.tsx`
- Create: `src/app/interviews/page.tsx`
- Modify: `src/components/app-sidebar.tsx`
- Create: `tests/unit/components/AppSidebar.test.tsx`
- Modify: `src/components/dashboard/dashboard-page.tsx`

- [ ] **Step 1: 创建简历和面试页面**

Create `src/app/resumes/page.tsx`:

```tsx
import { SignInButton } from '@/components/auth/sign-in-button';
import { ResumeLibrary } from '@/components/candidate-screening/resume-library';
import { getServerAuthSession } from '@/lib/auth/session';

export default async function ResumesPage() {
  const session = await getServerAuthSession();

  return (
    <section className="container mx-auto px-4 py-8">
      {!session?.user ? (
        <div className="border-border bg-background/60 rounded-xl border p-8 text-center backdrop-blur">
          <h1 className="text-foreground text-xl font-semibold">请先登录后继续</h1>
          <p className="text-muted-foreground mt-2 text-sm">
            登录本地账号后即可查看候选人简历列表。
          </p>
          <div className="mt-6 flex justify-center">
            <SignInButton />
          </div>
        </div>
      ) : (
        <ResumeLibrary />
      )}
    </section>
  );
}
```

Create `src/app/interviews/page.tsx`:

```tsx
import { SignInButton } from '@/components/auth/sign-in-button';
import { InterviewRecordList } from '@/components/candidate-screening/interview-record-list';
import { getServerAuthSession } from '@/lib/auth/session';

export default async function InterviewsPage() {
  const session = await getServerAuthSession();

  return (
    <section className="container mx-auto px-4 py-8">
      {!session?.user ? (
        <div className="border-border bg-background/60 rounded-xl border p-8 text-center backdrop-blur">
          <h1 className="text-foreground text-xl font-semibold">请先登录后继续</h1>
          <p className="text-muted-foreground mt-2 text-sm">
            登录本地账号后即可查看面试记录。
          </p>
          <div className="mt-6 flex justify-center">
            <SignInButton />
          </div>
        </div>
      ) : (
        <InterviewRecordList />
      )}
    </section>
  );
}
```

- [ ] **Step 2: 写侧边栏失败测试**

Create `tests/unit/components/AppSidebar.test.tsx`:

```tsx
import { render, screen } from '@testing-library/react';
import { usePathname } from 'next/navigation';
import { AppSidebar } from '@/components/app-sidebar';

jest.mock('next/navigation', () => ({
  usePathname: jest.fn(),
}));

jest.mock('lucide-react', () => ({
  BrainCircuit: () => <span data-testid="icon-brain" />,
  Building2: () => <span data-testid="icon-building" />,
  ClipboardList: () => <span data-testid="icon-clipboard" />,
  Eye: () => <span data-testid="icon-eye" />,
  FileCode: () => <span data-testid="icon-file-code" />,
  FileText: () => <span data-testid="icon-file-text" />,
  LayoutDashboard: () => <span data-testid="icon-dashboard" />,
  MessageCircle: () => <span data-testid="icon-message" />,
  Users: () => <span data-testid="icon-users" />,
}));

describe('AppSidebar', () => {
  beforeEach(() => {
    (usePathname as jest.Mock).mockReturnValue('/resumes');
  });

  it('renders recruiting resource menu entries', () => {
    render(<AppSidebar />);

    expect(screen.getByRole('link', { name: /候选人列表/ })).toHaveAttribute(
      'href',
      '/candidates',
    );
    expect(screen.getByRole('link', { name: /简历列表/ })).toHaveAttribute('href', '/resumes');
    expect(screen.getByRole('link', { name: /面试记录/ })).toHaveAttribute(
      'href',
      '/interviews',
    );
  });

  it('marks resume route active independently from JD workbench', () => {
    render(<AppSidebar />);

    expect(screen.getByRole('link', { name: /简历列表/ }).className).toContain('text-primary');
    expect(screen.getByRole('link', { name: /JD 工作台/ }).className).not.toContain(
      'text-primary',
    );
  });
});
```

- [ ] **Step 3: 运行侧边栏测试确认失败**

Run:

```bash
bun run test -- tests/unit/components/AppSidebar.test.tsx
```

Expected: FAIL，找不到新增菜单项或 lucide icon 导入不存在。

- [ ] **Step 4: 修改侧边栏菜单**

Modify `src/components/app-sidebar.tsx` 的 lucide import：

```ts
import {
  BrainCircuit,
  Building2,
  ClipboardList,
  Eye,
  FileCode,
  FileText,
  LayoutDashboard,
  MessageCircle,
  Users,
} from 'lucide-react';
```

在 `JD 工作台` 后新增：

```ts
  {
    label: '候选人列表',
    description: '推进与结果',
    href: '/candidates',
    Icon: Users,
  },
  {
    label: '简历列表',
    description: '简历与 JD 挂载',
    href: '/resumes',
    Icon: FileText,
  },
  {
    label: '面试记录',
    description: '反馈与结论',
    href: '/interviews',
    Icon: ClipboardList,
  },
```

- [ ] **Step 5: 修改工作台入口**

Modify `src/components/dashboard/dashboard-page.tsx`，把两个候选人相关按钮 href 从 `/jd-generator/candidates` 改成：

```tsx
href="/candidates"
```

- [ ] **Step 6: 运行侧边栏和 dashboard 测试**

Run:

```bash
bun run test -- tests/unit/components/AppSidebar.test.tsx src/components/dashboard/dashboard-page.test.tsx
```

Expected: PASS。

- [ ] **Step 7: 提交页面和菜单变更**

```bash
git add src/app/resumes/page.tsx src/app/interviews/page.tsx src/components/app-sidebar.tsx tests/unit/components/AppSidebar.test.tsx src/components/dashboard/dashboard-page.tsx
git commit -m "feat: add recruiting resource navigation"
```

---

### Task 7: 全量相关验证与收尾

**Files:**
- Verify only, no planned edits.

- [ ] **Step 1: 运行 repository 测试**

Run:

```bash
bun run test -- src/lib/candidate-screening/repo.test.ts
```

Expected: PASS。

- [ ] **Step 2: 运行 API 测试**

Run:

```bash
bun run test -- tests/unit/api/candidate-screening-routes.test.ts
```

Expected: PASS。

- [ ] **Step 3: 运行组件测试**

Run:

```bash
bun run test -- tests/unit/components/CandidateScreening.test.tsx tests/unit/components/AppSidebar.test.tsx src/components/dashboard/dashboard-page.test.tsx
```

Expected: PASS。

- [ ] **Step 4: 运行类型检查**

Run:

```bash
bun run type-check
```

Expected: PASS。

- [ ] **Step 5: 检查工作区状态**

Run:

```bash
git status --short
```

Expected: 没有未提交变更，或只剩用户明确要求保留的未提交文件。
