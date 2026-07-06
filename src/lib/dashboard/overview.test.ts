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
      findMany: jest.fn(),
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
      findMany: jest.Mock;
    };
    $connect: jest.Mock;
  };
};

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
    prismaMock.candidateScreeningResult.findMany.mockReset();
  });

  it('returns status summaries, platform summaries, jobs and recent tasks', async () => {
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
    expect(prismaMock.jobPublishTask.findMany).toHaveBeenCalledWith(
      expect.objectContaining({ take: 200 }),
    );
    expect(prismaMock.candidateScreeningResult.findMany).toHaveBeenCalledWith(
      expect.objectContaining({ take: 1000 }),
    );
  });
});
