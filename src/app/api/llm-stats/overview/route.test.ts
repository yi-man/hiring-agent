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

import { GET } from '@/app/api/llm-stats/overview/route';

const { prisma } = jest.requireMock('@/lib/prisma') as {
  prisma: {
    llmUsageStatsDaily: { findMany: jest.Mock };
    llmUsageStatsWeekly: { findMany: jest.Mock };
  };
};

describe('GET /api/llm-stats/overview', () => {
  beforeEach(() => {
    prisma.llmUsageStatsDaily.findMany.mockReset();
    prisma.llmUsageStatsWeekly.findMany.mockReset();
  });

  it('returns default timezone and aggregated cards', async () => {
    prisma.llmUsageStatsDaily.findMany
      .mockResolvedValueOnce([
        {
          totalCalls: 10,
          successCalls: 9,
          errorCalls: 1,
          inputTokens: 100,
          outputTokens: 200,
          totalTokens: 300,
          avgLatencyMs: 100,
        },
      ])
      .mockResolvedValueOnce([
        {
          totalCalls: 2,
          successCalls: 1,
          errorCalls: 1,
          inputTokens: 20,
          outputTokens: 10,
          totalTokens: 30,
          avgLatencyMs: 50,
        },
      ]);
    prisma.llmUsageStatsWeekly.findMany.mockResolvedValueOnce([
      {
        totalCalls: 5,
        successCalls: 4,
        errorCalls: 1,
        inputTokens: 50,
        outputTokens: 50,
        totalTokens: 100,
        avgLatencyMs: 70,
      },
    ]);

    const response = await GET(new Request('http://localhost/api/llm-stats/overview'));
    const data = (await response.json()) as {
      timezone: string;
      overview: {
        total: { totalCalls: number };
        today: { errorCalls: number };
        week: { weekStartDate: string };
      };
    };

    expect(response.status).toBe(200);
    expect(data.timezone).toBe('Asia/Shanghai');
    expect(data.overview.total.totalCalls).toBe(10);
    expect(data.overview.today.errorCalls).toBe(1);
    expect(typeof data.overview.week.weekStartDate).toBe('string');
  });

  it('applies provider/model/onlyError filters', async () => {
    prisma.llmUsageStatsDaily.findMany.mockResolvedValue([]);
    prisma.llmUsageStatsWeekly.findMany.mockResolvedValue([]);

    await GET(
      new Request(
        'http://localhost/api/llm-stats/overview?provider=openai&model=gpt-4o-mini&onlyError=true&startDate=2026-03-01&endDate=2026-03-07',
      ),
    );

    const firstCallArg = prisma.llmUsageStatsDaily.findMany.mock.calls[0][0];
    expect(firstCallArg.where.provider).toBe('openai');
    expect(firstCallArg.where.model).toBe('gpt-4o-mini');
    expect(firstCallArg.where.errorCalls).toEqual({ gt: 0 });
  });
});
