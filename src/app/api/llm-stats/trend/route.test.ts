/**
 * @jest-environment node
 */
jest.mock('@/lib/prisma', () => ({
  prisma: {
    llmUsageStatsDaily: {
      findMany: jest.fn(),
    },
    llmUsageStatsWeekly: {
      findMany: jest.fn(),
    },
  },
}));

import { GET } from '@/app/api/llm-stats/trend/route';

const { prisma } = jest.requireMock('@/lib/prisma') as {
  prisma: {
    llmUsageStatsDaily: { findMany: jest.Mock };
    llmUsageStatsWeekly: { findMany: jest.Mock };
  };
};

describe('GET /api/llm-stats/trend', () => {
  beforeEach(() => {
    prisma.llmUsageStatsDaily.findMany.mockReset();
    prisma.llmUsageStatsWeekly.findMany.mockReset();
  });

  it('returns day granularity points by default', async () => {
    prisma.llmUsageStatsDaily.findMany.mockResolvedValueOnce([
      {
        bucketDate: new Date('2026-03-24T00:00:00.000Z'),
        totalCalls: 10,
        errorCalls: 1,
        totalTokens: 1000,
        avgLatencyMs: 120,
      },
    ]);

    const response = await GET(
      new Request('http://localhost/api/llm-stats/trend?startDate=2026-03-24&endDate=2026-03-24'),
    );
    const data = (await response.json()) as {
      filters: { granularity: string };
      points: Array<{ totalCalls: number }>;
    };

    expect(response.status).toBe(200);
    expect(data.filters.granularity).toBe('day');
    expect(data.points[0].totalCalls).toBe(10);
  });

  it('uses ISO week path for week granularity and filters', async () => {
    prisma.llmUsageStatsWeekly.findMany.mockResolvedValueOnce([
      {
        bucketWeek: new Date('2026-03-23T00:00:00.000Z'),
        totalCalls: 20,
        errorCalls: 2,
        totalTokens: 2000,
        avgLatencyMs: 80,
      },
    ]);

    const response = await GET(
      new Request(
        'http://localhost/api/llm-stats/trend?granularity=week&provider=openai&model=gpt-4o-mini&onlyError=true',
      ),
    );
    const data = (await response.json()) as {
      points: Array<{ bucketStart: string }>;
      filters: { granularity: string };
    };

    expect(response.status).toBe(200);
    expect(data.filters.granularity).toBe('week');
    expect(data.points[0].bucketStart).toBeTruthy();

    const arg = prisma.llmUsageStatsWeekly.findMany.mock.calls[0][0];
    expect(arg.where.provider).toBe('openai');
    expect(arg.where.model).toBe('gpt-4o-mini');
    expect(arg.where.errorCalls).toEqual({ gt: 0 });
  });

  it('does not over-fetch extra out-of-range week', async () => {
    prisma.llmUsageStatsWeekly.findMany.mockResolvedValueOnce([]);

    await GET(
      new Request(
        'http://localhost/api/llm-stats/trend?granularity=week&startDate=2026-03-01&endDate=2026-03-07',
      ),
    );

    const arg = prisma.llmUsageStatsWeekly.findMany.mock.calls[0][0];
    const weekWhere = arg.where.bucketWeek;
    expect(weekWhere.gte.toISOString()).toBe('2026-02-22T16:00:00.000Z');
    expect(weekWhere.lt.toISOString()).toBe('2026-03-08T16:00:00.000Z');
  });
});
