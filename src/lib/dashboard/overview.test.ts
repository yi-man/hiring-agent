import {
  aggregateCandidateStats,
  findLatestDashboardTask,
  getDashboardOverview,
  inferDashboardPlatform,
  parseDashboardFilters,
} from './overview';
import type { DashboardPublishTaskSummary } from './types';

jest.mock('@/lib/prisma', () => ({
  prisma: {
    jobDescription: {
      findMany: jest.fn(),
      groupBy: jest.fn(),
    },
    jobPublishTask: {
      findMany: jest.fn(),
    },
    candidateScreeningResult: {
      groupBy: jest.fn(),
    },
    $connect: jest.fn(),
  },
}));

const { prisma: prismaMock } = jest.requireMock('@/lib/prisma') as {
  prisma: {
    jobDescription: {
      findMany: jest.Mock;
      groupBy: jest.Mock;
    };
    jobPublishTask: {
      findMany: jest.Mock;
    };
    candidateScreeningResult: {
      groupBy: jest.Mock;
    };
    $connect: jest.Mock;
  };
};

function dashboardJobRow(overrides: Record<string, unknown>) {
  return {
    id: 'jd-1',
    department: '技术部',
    position: 'AI 应用工程师',
    salaryRange: '30-50K',
    workLocations: ['上海'],
    status: 'published',
    content: {
      title: 'AI 应用工程师',
      summary: '负责 AI 招聘产品',
      responsibilities: [],
      requirements: [],
      bonus: [],
      highlights: [],
    },
    updatedAt: new Date('2026-07-06T10:00:00.000Z'),
    ...overrides,
  };
}

const dashboardJobSelect = {
  id: true,
  department: true,
  position: true,
  salaryRange: true,
  workLocations: true,
  status: true,
  content: true,
  updatedAt: true,
};

const dashboardTaskSelect = {
  id: true,
  jobDescriptionId: true,
  platform: true,
  status: true,
  errorMessage: true,
  createdAt: true,
  updatedAt: true,
};

describe('dashboard overview helpers', () => {
  beforeEach(() => {
    prismaMock.jobDescription.findMany.mockReset();
    prismaMock.jobDescription.groupBy.mockReset();
    prismaMock.jobPublishTask.findMany.mockReset();
    prismaMock.candidateScreeningResult.groupBy.mockReset();
    prismaMock.$connect.mockReset();
  });

  it('parses valid filters with bounded limits', () => {
    expect(
      parseDashboardFilters(
        new URL('http://localhost/api/dashboard?status=published&platform=boss-like&limit=250')
          .searchParams,
      ),
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

  it('rejects invalid platform filters', () => {
    expect(() =>
      parseDashboardFilters(
        new URL('http://localhost/api/dashboard?platform=unknown').searchParams,
      ),
    ).toThrow('platform is invalid');
  });

  it('infers the latest successful publish platform for a JD', () => {
    const tasks: DashboardPublishTaskSummary[] = [
      {
        id: 'task-success-old',
        jobDescriptionId: 'jd-1',
        platform: 'boss-like',
        status: 'success',
        errorMessage: null,
        createdAt: '2026-07-06T09:00:00.000Z',
        updatedAt: '2026-07-06T09:01:00.000Z',
      },
      {
        id: 'task-failed',
        jobDescriptionId: 'jd-1',
        platform: 'boss-like',
        status: 'failed',
        errorMessage: 'form changed',
        createdAt: '2026-07-06T10:00:00.000Z',
        updatedAt: '2026-07-06T10:01:00.000Z',
      },
      {
        id: 'task-success-new',
        jobDescriptionId: 'jd-1',
        platform: 'boss-like',
        status: 'success',
        errorMessage: null,
        createdAt: '2026-07-06T11:00:00.000Z',
        updatedAt: '2026-07-06T11:02:00.000Z',
      },
    ];

    expect(inferDashboardPlatform('published', tasks)).toEqual({
      platform: 'boss-like',
      label: 'BOSS-like',
      recruitingJobs: 1,
      failedJobs: 1,
    });
  });

  it('marks published jobs without successful tasks as untracked platform', () => {
    expect(inferDashboardPlatform('published', [])).toEqual({
      platform: 'untracked',
      label: '未记录平台',
      recruitingJobs: 1,
      failedJobs: 0,
    });
  });

  it('does not infer boss-like for ready-to-publish jobs without publish tasks', () => {
    expect(inferDashboardPlatform('ready_to_publish', [])).toEqual({
      platform: 'untracked',
      label: '未记录平台',
      recruitingJobs: 0,
      failedJobs: 0,
    });
  });

  it('uses failed task summary when no successful publish exists', () => {
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
    ];

    expect(inferDashboardPlatform('published', tasks)).toEqual({
      platform: 'boss-like',
      label: 'BOSS-like',
      recruitingJobs: 0,
      failedJobs: 1,
    });
  });

  it('selects publish tasks by latest createdAt timestamp', () => {
    const tasks: DashboardPublishTaskSummary[] = [
      {
        id: 'task-success-old',
        jobDescriptionId: 'jd-1',
        platform: 'boss-like',
        status: 'success',
        errorMessage: null,
        createdAt: '2026-07-06T09:00:00.000Z',
        updatedAt: '2026-07-06T09:01:00.000Z',
      },
      {
        id: 'task-success-new',
        jobDescriptionId: 'jd-1',
        platform: 'boss-like',
        status: 'success',
        errorMessage: null,
        createdAt: '2026-07-06T10:00:00.000Z',
        updatedAt: '2026-07-06T10:01:00.000Z',
      },
      {
        id: 'task-failed-newer',
        jobDescriptionId: 'jd-1',
        platform: 'boss-like',
        status: 'failed',
        errorMessage: 'form changed again',
        createdAt: '2026-07-06T11:00:00.000Z',
        updatedAt: '2026-07-06T11:01:00.000Z',
      },
    ];

    expect(findLatestDashboardTask(tasks, 'success')?.id).toBe('task-success-new');
    expect(findLatestDashboardTask(tasks, 'failed')?.id).toBe('task-failed-newer');
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

describe('getDashboardOverview', () => {
  beforeEach(() => {
    prismaMock.jobDescription.findMany.mockReset();
    prismaMock.jobDescription.groupBy.mockReset();
    prismaMock.jobPublishTask.findMany.mockReset();
    prismaMock.candidateScreeningResult.groupBy.mockReset();
  });

  it('returns status summaries, platform summaries, jobs and recent tasks', async () => {
    prismaMock.jobDescription.groupBy.mockResolvedValueOnce([
      { status: 'published', _count: { _all: 2 } },
      { status: 'ready_to_publish', _count: { _all: 1 } },
      { status: 'publishing', _count: { _all: 1 } },
      { status: 'publish_failed', _count: { _all: 1 } },
    ]);
    prismaMock.jobDescription.findMany.mockResolvedValueOnce([dashboardJobRow({ id: 'jd-1' })]);
    prismaMock.jobPublishTask.findMany.mockResolvedValueOnce([
      {
        id: 'task-1',
        jobDescriptionId: 'jd-1',
        platform: 'boss-like',
        status: 'success',
        errorMessage: null,
        createdAt: new Date('2026-07-06T09:00:00.000Z'),
        updatedAt: new Date('2026-07-06T09:01:00.000Z'),
      },
    ]);
    prismaMock.candidateScreeningResult.groupBy.mockResolvedValueOnce([
      {
        jobDescriptionId: 'jd-1',
        decisionAction: 'chat',
        decisionPriority: 'high',
        interviewStage: 'to_contact',
        _count: { _all: 1 },
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
    expect(prismaMock.jobDescription.findMany).toHaveBeenCalledWith(
      expect.objectContaining({
        where: { userId: 'u1', status: 'published' },
        orderBy: { updatedAt: 'desc' },
        select: dashboardJobSelect,
      }),
    );
    const jobQuery = prismaMock.jobDescription.findMany.mock.calls[0]?.[0];
    expect(jobQuery).not.toHaveProperty('take');
    expect(prismaMock.jobPublishTask.findMany).toHaveBeenCalledWith(
      expect.objectContaining({
        where: {
          userId: 'u1',
          jobDescriptionId: { in: ['jd-1'] },
          status: { in: ['success', 'failed', 'running'] },
        },
        orderBy: { createdAt: 'desc' },
        select: dashboardTaskSelect,
      }),
    );
    const taskQuery = prismaMock.jobPublishTask.findMany.mock.calls[0]?.[0];
    expect(taskQuery).not.toHaveProperty('take');
    expect(prismaMock.candidateScreeningResult.groupBy).toHaveBeenCalledWith({
      by: ['jobDescriptionId', 'decisionAction', 'decisionPriority', 'interviewStage'],
      where: { userId: 'u1', jobDescriptionId: { in: ['jd-1'] } },
      _count: { _all: true },
    });
  });

  it('uses grouped candidate counts so large active groups are not capped', async () => {
    prismaMock.jobDescription.groupBy.mockResolvedValueOnce([
      { status: 'published', _count: { _all: 1 } },
    ]);
    prismaMock.jobDescription.findMany.mockResolvedValueOnce([dashboardJobRow({ id: 'jd-1' })]);
    prismaMock.jobPublishTask.findMany.mockResolvedValueOnce([]);
    prismaMock.candidateScreeningResult.groupBy.mockResolvedValueOnce([
      {
        jobDescriptionId: 'jd-1',
        decisionAction: 'chat',
        decisionPriority: 'high',
        interviewStage: 'to_contact',
        _count: { _all: 1200 },
      },
    ]);

    const overview = await getDashboardOverview({
      userId: 'u1',
      filters: { status: 'published', limit: 25 },
    });

    expect(overview.summary.activeCandidates).toBe(1200);
    expect(overview.jobs[0]?.candidateStats).toEqual(
      expect.objectContaining({
        totalCandidates: 1200,
        activeCandidates: 1200,
        highPriorityCandidates: 1200,
        followUpCandidates: 1200,
      }),
    );
  });

  it('applies platform filters after platform inference and before returned job slicing', async () => {
    const newestUntracked = dashboardJobRow({
      id: 'jd-new',
      position: '未追踪职位',
      content: {
        title: '未追踪职位',
        summary: '',
        responsibilities: [],
        requirements: [],
        bonus: [],
        highlights: [],
      },
      updatedAt: new Date('2026-07-06T12:00:00.000Z'),
    });
    const olderBossLike = dashboardJobRow({
      id: 'jd-old',
      position: 'BOSS 直聘职位',
      content: {
        title: 'BOSS 直聘职位',
        summary: '',
        responsibilities: [],
        requirements: [],
        bonus: [],
        highlights: [],
      },
      updatedAt: new Date('2026-07-06T10:00:00.000Z'),
    });

    prismaMock.jobDescription.groupBy.mockResolvedValueOnce([
      { status: 'published', _count: { _all: 2 } },
    ]);
    prismaMock.jobDescription.findMany.mockImplementationOnce((args: { take?: number }) =>
      Promise.resolve([newestUntracked, olderBossLike].slice(0, args.take)),
    );
    prismaMock.jobPublishTask.findMany.mockResolvedValueOnce([
      {
        id: 'task-old',
        jobDescriptionId: 'jd-old',
        platform: 'boss-like',
        status: 'success',
        errorMessage: null,
        createdAt: new Date('2026-07-06T09:00:00.000Z'),
        updatedAt: new Date('2026-07-06T09:01:00.000Z'),
      },
    ]);
    prismaMock.candidateScreeningResult.groupBy.mockResolvedValueOnce([]);

    const overview = await getDashboardOverview({
      userId: 'u1',
      filters: { status: 'published', platform: 'boss-like', limit: 1 },
    });

    expect(overview.jobs).toHaveLength(1);
    expect(overview.jobs[0]).toEqual(
      expect.objectContaining({
        id: 'jd-old',
        platform: expect.objectContaining({ platform: 'boss-like' }),
      }),
    );
    expect(prismaMock.jobDescription.findMany).toHaveBeenCalledWith(
      expect.objectContaining({
        where: { userId: 'u1', status: 'published' },
        orderBy: { updatedAt: 'desc' },
        select: dashboardJobSelect,
      }),
    );
    expect(prismaMock.jobPublishTask.findMany).toHaveBeenCalledWith(
      expect.objectContaining({
        where: {
          userId: 'u1',
          jobDescriptionId: { in: ['jd-new', 'jd-old'] },
          status: { in: ['success', 'failed', 'running'] },
        },
        orderBy: { createdAt: 'desc' },
        select: dashboardTaskSelect,
      }),
    );
    const platformsByKey = new Map(
      overview.platforms.map((platform) => [platform.platform, platform]),
    );
    expect(platformsByKey.get('all')).toEqual(
      expect.objectContaining({ recruitingJobs: 2, failedJobs: 0 }),
    );
    expect(platformsByKey.get('boss-like')).toEqual(
      expect.objectContaining({ recruitingJobs: 1, failedJobs: 0 }),
    );
    expect(platformsByKey.get('untracked')).toEqual(
      expect.objectContaining({ recruitingJobs: 1, failedJobs: 0 }),
    );
  });

  it('skips task and candidate aggregation queries when no jobs match', async () => {
    prismaMock.jobDescription.groupBy.mockResolvedValueOnce([]);
    prismaMock.jobDescription.findMany.mockResolvedValueOnce([]);

    const overview = await getDashboardOverview({
      userId: 'u1',
      filters: { status: 'published', limit: 25 },
    });

    expect(overview.jobs).toEqual([]);
    expect(prismaMock.jobPublishTask.findMany).not.toHaveBeenCalled();
    expect(prismaMock.candidateScreeningResult.groupBy).not.toHaveBeenCalled();
  });
});
