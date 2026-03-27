/**
 * @jest-environment node
 */
jest.mock('@/lib/prisma', () => ({
  prisma: {
    llmCallLog: {
      findMany: jest.fn(),
      count: jest.fn(),
    },
  },
}));
jest.mock('@/lib/env', () => ({
  env: {
    LLM_OBSERVABILITY_ADMIN_TOKEN: undefined,
  },
}));
jest.mock('@/lib/llm-observability/log-service', () => ({
  recordSensitivePayloadAccess: jest.fn(),
}));

import { GET } from '@/app/api/llm-stats/logs/route';

const { prisma } = jest.requireMock('@/lib/prisma') as {
  prisma: {
    llmCallLog: {
      findMany: jest.Mock;
      count: jest.Mock;
    };
  };
};
const { env } = jest.requireMock('@/lib/env') as {
  env: {
    LLM_OBSERVABILITY_ADMIN_TOKEN?: string;
  };
};
const { recordSensitivePayloadAccess } = jest.requireMock(
  '@/lib/llm-observability/log-service',
) as {
  recordSensitivePayloadAccess: jest.Mock;
};

describe('GET /api/llm-stats/logs', () => {
  beforeEach(() => {
    prisma.llmCallLog.findMany.mockReset();
    prisma.llmCallLog.count.mockReset();
    env.LLM_OBSERVABILITY_ADMIN_TOKEN = undefined;
    recordSensitivePayloadAccess.mockReset();
  });

  it('supports pagination and filters', async () => {
    prisma.llmCallLog.findMany.mockResolvedValueOnce([
      {
        id: '1',
        callId: 'c1',
        traceId: null,
        requestId: 'r1',
        timestamp: new Date('2026-03-26T00:00:00.000Z'),
        endpoint: '/api/chat',
        provider: 'openai',
        model: 'gpt-4o-mini',
        latencyMs: 123,
        inputTokens: 1,
        outputTokens: 2,
        totalTokens: 3,
        isError: true,
        errorDomain: 'provider',
        errorCode: 'RATE_LIMIT',
        providerStatus: '429',
        httpStatus: 429,
        retryCount: 1,
        finalOutcome: 'failed',
      },
    ]);
    prisma.llmCallLog.count.mockResolvedValueOnce(3);

    const response = await GET(
      new Request(
        'http://localhost/api/llm-stats/logs?page=2&limit=1&provider=openai&model=gpt-4o-mini&onlyError=true',
      ),
    );
    const data = (await response.json()) as {
      page: number;
      limit: number;
      total: number;
      items: Array<{ id: string }>;
    };

    expect(response.status).toBe(200);
    expect(data.page).toBe(2);
    expect(data.limit).toBe(1);
    expect(data.total).toBe(3);
    expect(data.items[0].id).toBe('1');

    const arg = prisma.llmCallLog.findMany.mock.calls[0][0];
    expect(arg.where.provider).toBe('openai');
    expect(arg.where.model).toBe('gpt-4o-mini');
    expect(arg.where.isError).toBe(true);
    expect(arg.skip).toBe(1);
    expect(arg.take).toBe(1);
  });

  it('sanitizes invalid page/limit to safe defaults', async () => {
    prisma.llmCallLog.findMany.mockResolvedValueOnce([]);
    prisma.llmCallLog.count.mockResolvedValueOnce(0);

    const response = await GET(
      new Request('http://localhost/api/llm-stats/logs?page=abc&limit=NaN&provider=openai'),
    );
    const data = (await response.json()) as { page: number; limit: number };

    expect(response.status).toBe(200);
    expect(data.page).toBe(1);
    expect(data.limit).toBe(20);

    const arg = prisma.llmCallLog.findMany.mock.calls[0][0];
    expect(arg.skip).toBe(0);
    expect(arg.take).toBe(20);
  });

  it('denies detail fields when server admin token is unset', async () => {
    const response = await GET(
      new Request('http://localhost/api/llm-stats/logs?includeDetails=true'),
    );
    expect(response.status).toBe(403);
    expect(prisma.llmCallLog.findMany).not.toHaveBeenCalled();
    expect(prisma.llmCallLog.count).not.toHaveBeenCalled();
    expect(recordSensitivePayloadAccess).toHaveBeenCalledWith(
      expect.objectContaining({
        action: 'read_log_details',
        success: false,
      }),
    );
  });

  it('denies detail fields when provided token mismatches', async () => {
    env.LLM_OBSERVABILITY_ADMIN_TOKEN = 'server-secret';
    const response = await GET(
      new Request('http://localhost/api/llm-stats/logs?includeDetails=true', {
        headers: { 'x-llm-observability-admin-token': 'wrong-secret' },
      }),
    );
    expect(response.status).toBe(403);
    expect(prisma.llmCallLog.findMany).not.toHaveBeenCalled();
    expect(prisma.llmCallLog.count).not.toHaveBeenCalled();
  });

  it('allows detail fields when trusted token matches server config', async () => {
    env.LLM_OBSERVABILITY_ADMIN_TOKEN = 'server-secret';
    prisma.llmCallLog.findMany.mockResolvedValueOnce([
      {
        id: '1',
        callId: null,
        traceId: null,
        requestId: null,
        timestamp: new Date('2026-03-26T00:00:00.000Z'),
        endpoint: '/api/chat',
        provider: 'openai',
        model: 'gpt-4o-mini',
        latencyMs: 10,
        inputTokens: 1,
        outputTokens: 2,
        totalTokens: 3,
        isError: false,
        errorDomain: null,
        errorCode: null,
        providerStatus: null,
        httpStatus: 200,
        retryCount: 0,
        finalOutcome: 'success',
        requestHeaders: { authorization: 'Bearer x' },
        requestPayload: { prompt: 'hello' },
        responsePayload: { text: 'world' },
      },
    ]);
    prisma.llmCallLog.count.mockResolvedValueOnce(1);

    const response = await GET(
      new Request('http://localhost/api/llm-stats/logs?includeDetails=true', {
        headers: { 'x-llm-observability-admin-token': 'server-secret' },
      }),
    );
    const data = (await response.json()) as {
      filters: { includeDetails: boolean };
      items: Array<{
        requestPayload?: unknown;
        requestHeaders?: unknown;
        responsePayload?: unknown;
      }>;
    };

    expect(response.status).toBe(200);
    expect(data.filters.includeDetails).toBe(true);
    expect(data.items[0].requestHeaders).toEqual({ authorization: 'Bearer x' });
    expect(data.items[0].requestPayload).toEqual({ prompt: 'hello' });
    expect(data.items[0].responsePayload).toEqual({ text: 'world' });
    expect(recordSensitivePayloadAccess).toHaveBeenCalledWith(
      expect.objectContaining({
        action: 'read_log_details',
        success: true,
      }),
    );
  });
});
