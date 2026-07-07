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
        createdAt: new Date('2026-07-06T03:00:00.000Z'),
        updatedAt: new Date('2026-07-06T03:00:00.000Z'),
      },
      {
        jobDescriptionId: 'jd-1',
        status: 'success',
        id: 'run-1',
        createdAt: new Date('2026-07-06T02:00:00.000Z'),
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

  it('uses run creation time instead of update time to find the latest run', async () => {
    prismaMock.candidateScreeningRun.findMany.mockResolvedValueOnce([
      {
        jobDescriptionId: 'jd-1',
        status: 'success',
        id: 'run-old',
        createdAt: new Date('2026-07-06T02:00:00.000Z'),
        updatedAt: new Date('2026-07-06T04:00:00.000Z'),
      },
      {
        jobDescriptionId: 'jd-1',
        status: 'running',
        id: 'run-new',
        createdAt: new Date('2026-07-06T03:00:00.000Z'),
        updatedAt: new Date('2026-07-06T03:30:00.000Z'),
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
      latestRunId: 'run-new',
      latestRunStatus: 'running',
      latestRunUpdatedAt: '2026-07-06T03:30:00.000Z',
    });
  });

  it('counts only scores of 70 or above as qualified', async () => {
    prismaMock.candidateScreeningRun.findMany.mockResolvedValueOnce([
      {
        jobDescriptionId: 'jd-1',
        status: 'success',
        id: 'run-1',
        createdAt: new Date('2026-07-06T03:00:00.000Z'),
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
        createdAt: new Date('2026-07-06T03:00:00.000Z'),
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
