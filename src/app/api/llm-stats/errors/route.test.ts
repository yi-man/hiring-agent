/**
 * @jest-environment node
 */
jest.mock('@/lib/prisma', () => ({
  prisma: {
    llmUsageStatsDaily: {
      findMany: jest.fn(),
    },
  },
}));

import { GET } from '@/app/api/llm-stats/errors/route';

const { prisma } = jest.requireMock('@/lib/prisma') as {
  prisma: {
    llmUsageStatsDaily: { findMany: jest.Mock };
  };
};

describe('GET /api/llm-stats/errors', () => {
  beforeEach(() => {
    prisma.llmUsageStatsDaily.findMany.mockReset();
  });

  it('returns error distributions, summary, recent errors and rankings', async () => {
    prisma.llmUsageStatsDaily.findMany.mockResolvedValueOnce([
      {
        provider: 'openai',
        model: 'gpt-4o-mini',
        endpoint: '/api/chat',
        totalCalls: 10,
        errorCalls: 2,
      },
      {
        provider: 'openai',
        model: 'gpt-4.1',
        endpoint: '/api/jd/agent',
        totalCalls: 5,
        errorCalls: 1,
      },
    ]);

    const response = await GET(
      new Request('http://localhost/api/llm-stats/errors?startDate=2026-03-01&endDate=2026-03-07'),
    );
    const data = (await response.json()) as {
      summary: { totalErrors: number };
      distributions: { providers: unknown[] };
      recentErrors: unknown[];
      topErrorEndpoints: Array<{ endpoint: string; errorCalls: number }>;
    };

    expect(response.status).toBe(200);
    expect(data.summary.totalErrors).toBe(3);
    expect(data.distributions.providers.length).toBe(1);
    expect(data.recentErrors).toEqual([]);
    expect(data.topErrorEndpoints[0]).toEqual({ endpoint: '/api/chat', errorCalls: 2 });
  });

  it('passes provider/model filters', async () => {
    prisma.llmUsageStatsDaily.findMany.mockResolvedValueOnce([]);

    await GET(
      new Request('http://localhost/api/llm-stats/errors?provider=openai&model=gpt-4o-mini'),
    );

    const aggregateArg = prisma.llmUsageStatsDaily.findMany.mock.calls[0][0];
    expect(aggregateArg.where.provider).toBe('openai');
    expect(aggregateArg.where.model).toBe('gpt-4o-mini');
  });
});
