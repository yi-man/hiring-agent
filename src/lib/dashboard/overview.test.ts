import { aggregateCandidateStats, inferDashboardPlatform, parseDashboardFilters } from './overview';
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
