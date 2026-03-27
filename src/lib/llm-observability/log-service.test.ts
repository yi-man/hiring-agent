import {
  persistLlmCallLog,
  recordSensitivePayloadAccess,
  recordLlmCallEnd,
  recordLlmCallStart,
  upsertLlmUsageStatsDaily,
} from '@/lib/llm-observability/log-service';

jest.mock('@/lib/prisma', () => ({
  prisma: {
    $executeRaw: jest.fn(),
    llmCallLog: {
      create: jest.fn(),
    },
    llmUsageStatsDaily: {
      create: jest.fn(),
      findUnique: jest.fn(),
      update: jest.fn(),
    },
  },
}));

const { prisma: prismaMock } = jest.requireMock('@/lib/prisma') as {
  prisma: {
    $executeRaw: jest.Mock;
    llmCallLog: {
      create: jest.Mock;
    };
    llmUsageStatsDaily: {
      create: jest.Mock;
      findUnique: jest.Mock;
      update: jest.Mock;
    };
  };
};

describe('llm observability schema constraints (unit intent)', () => {
  beforeEach(() => {
    prismaMock.$executeRaw.mockReset();
    prismaMock.llmCallLog.create.mockReset();
    prismaMock.llmUsageStatsDaily.create.mockReset();
    prismaMock.llmUsageStatsDaily.findUnique.mockReset();
    prismaMock.llmUsageStatsDaily.update.mockReset();
  });

  it('inserts call log with nullable callId and fallback shape fields', async () => {
    prismaMock.llmCallLog.create.mockResolvedValueOnce({ id: '1' });

    await expect(
      persistLlmCallLog({
        callId: null,
        provider: 'openai',
        requestId: 'req-1',
        endpoint: '/api/chat',
        model: 'gpt-4.1-mini',
        requestHeaders: {},
        requestPayload: {},
        responsePayload: {},
        inputTokens: 1,
        outputTokens: 1,
        totalTokens: 2,
        latencyMs: 10,
        isError: false,
        retryCount: 0,
        finalOutcome: 'success',
        timestamp: new Date('2026-03-26T00:00:00.000Z'),
      }),
    ).resolves.toEqual({
      id: '1',
    });
    expect(prismaMock.llmCallLog.create).toHaveBeenCalledTimes(1);
    expect(prismaMock.llmCallLog.create).toHaveBeenCalledWith(
      expect.objectContaining({
        data: expect.objectContaining({
          callId: null,
          provider: 'openai',
          requestId: 'req-1',
        }),
      }),
    );
    const lastCall = prismaMock.llmCallLog.create.mock.calls.at(-1)?.[0];
    expect(lastCall.data).not.toHaveProperty('createdAt');
  });

  it('treats duplicate callId as dedup signal', async () => {
    const duplicateError = Object.assign(new Error('Unique constraint failed on call_id'), {
      code: 'P2002',
    });
    prismaMock.llmCallLog.create.mockRejectedValueOnce(duplicateError);

    await expect(
      persistLlmCallLog({
        callId: 'call-dup',
        provider: 'openai',
        requestId: 'req-dup',
        endpoint: '/api/chat',
        model: 'gpt-4.1-mini',
        requestHeaders: {},
        requestPayload: {},
        responsePayload: {},
        inputTokens: 1,
        outputTokens: 1,
        totalTokens: 2,
        latencyMs: 10,
        isError: false,
        retryCount: 0,
        finalOutcome: 'success',
        timestamp: new Date('2026-03-26T00:00:00.000Z'),
      }),
    ).rejects.toMatchObject({ code: 'P2002' });
  });

  it('creates daily aggregate on first write', async () => {
    prismaMock.llmUsageStatsDaily.create.mockResolvedValueOnce({ id: 'daily-1' });

    await expect(
      upsertLlmUsageStatsDaily({
        bucketDate: new Date('2026-03-26T00:00:00.000Z'),
        provider: 'openai',
        model: 'gpt-4.1-mini',
        endpoint: '/api/chat',
        totalCalls: 1,
        successCalls: 1,
        errorCalls: 0,
        inputTokens: 10,
        outputTokens: 20,
        totalTokens: 30,
        avgLatencyMs: 25,
      }),
    ).resolves.toEqual({ id: 'daily-1' });
    expect(prismaMock.llmUsageStatsDaily.create).toHaveBeenCalledWith(
      expect.objectContaining({
        data: expect.objectContaining({
          avgLatencyMs: 25,
        }),
      }),
    );
  });

  it('handles create race with P2002 then applies atomic weighted update path', async () => {
    const duplicateError = Object.assign(new Error('Unique constraint failed'), { code: 'P2002' });
    prismaMock.llmUsageStatsDaily.create.mockRejectedValueOnce(duplicateError);
    prismaMock.$executeRaw.mockResolvedValueOnce(1);
    prismaMock.llmUsageStatsDaily.findUnique.mockResolvedValueOnce({ id: 'daily-existing' });

    const bucketDate = new Date('2026-03-26T00:00:00.000Z');
    await upsertLlmUsageStatsDaily({
      bucketDate,
      provider: 'openai',
      model: 'gpt-4.1-mini',
      endpoint: '/api/chat',
      totalCalls: 2,
      successCalls: 2,
      errorCalls: 0,
      inputTokens: 10,
      outputTokens: 20,
      totalTokens: 30,
      avgLatencyMs: 40,
    });

    expect(prismaMock.$executeRaw).toHaveBeenCalledTimes(1);
    expect(prismaMock.llmUsageStatsDaily.findUnique).toHaveBeenCalledWith(
      expect.objectContaining({
        where: expect.objectContaining({
          bucketDate_provider_model_endpoint: expect.objectContaining({
            bucketDate,
            provider: 'openai',
            model: 'gpt-4.1-mini',
            endpoint: '/api/chat',
          }),
        }),
      }),
    );
  });
});

describe('recordLlmCallStart / recordLlmCallEnd', () => {
  beforeEach(() => {
    prismaMock.llmCallLog.create.mockReset();
    delete process.env.LLM_OBSERVABILITY_MAX_PAYLOAD_CHARS;
    jest.spyOn(console, 'info').mockImplementation(() => undefined);
  });

  afterEach(() => {
    jest.restoreAllMocks();
  });

  it('records success with tokens, latency, status and wrapper timestamp', async () => {
    prismaMock.llmCallLog.create.mockResolvedValueOnce({ id: 'ok-1' });
    const start = recordLlmCallStart({
      callId: 'call-1',
      traceId: 'trace-1',
      requestId: 'req-1',
      endpoint: '/api/chat',
      provider: 'openai',
      model: 'gpt-4.1-mini',
      requestHeaders: { authorization: 'Bearer test' },
      requestPayload: { prompt: 'hello' },
      retryCount: 1,
      timestamp: new Date('2026-03-26T10:00:00.000Z'),
    });
    const endTimestamp = new Date('2026-03-26T10:00:01.500Z');

    await expect(
      recordLlmCallEnd(start, {
        timestamp: endTimestamp,
        responsePayload: { text: 'hi' },
        httpStatus: 200,
        inputTokens: 10,
        outputTokens: 20,
        totalTokens: 30,
      }),
    ).resolves.toBeUndefined();

    expect(prismaMock.llmCallLog.create).toHaveBeenCalledTimes(1);
    expect(prismaMock.llmCallLog.create).toHaveBeenCalledWith(
      expect.objectContaining({
        data: expect.objectContaining({
          isError: false,
          httpStatus: 200,
          inputTokens: 10,
          outputTokens: 20,
          totalTokens: 30,
          latencyMs: 1500,
          timestamp: endTimestamp,
          finalOutcome: 'success',
        }),
      }),
    );
  });

  it('maps timeout/rate-limit/auth/network errors and persists raw payload fields', async () => {
    prismaMock.llmCallLog.create.mockResolvedValue({ id: 'ok' });
    const start = recordLlmCallStart({
      callId: 'call-err',
      endpoint: '/api/chat',
      provider: 'openai',
      model: 'gpt-4.1-mini',
      requestHeaders: 'x-header: 1',
      requestPayload: 'raw-request-body',
      timestamp: new Date('2026-03-26T10:00:00.000Z'),
    });
    const endTimestamp = new Date('2026-03-26T10:00:01.000Z');

    const cases = [
      [{ code: 'ETIMEDOUT', message: 'request timeout' }, 'timeout', 'ETIMEDOUT'],
      [{ status: 429, message: 'rate limit exceeded' }, 'rate_limit', 'rate_limit'],
      [{ status: 401, code: 'invalid_api_key' }, 'auth', 'invalid_api_key'],
      [{ code: 'ENOTFOUND', message: 'network unavailable' }, 'transport', 'ENOTFOUND'],
    ] as const;

    for (const [error, domain, code] of cases) {
      await recordLlmCallEnd(start, {
        timestamp: endTimestamp,
        error,
        responsePayload: 'raw-response-body',
        httpStatus: (error as { status?: number }).status ?? null,
      });

      expect(prismaMock.llmCallLog.create).toHaveBeenLastCalledWith(
        expect.objectContaining({
          data: expect.objectContaining({
            isError: true,
            errorDomain: domain,
            errorCode: code,
            requestHeaders: { raw: 'x-header: 1' },
            requestPayload: { raw: 'raw-request-body' },
            responsePayload: { raw: 'raw-response-body' },
          }),
        }),
      );
    }
  });

  it('does not throw into business path when write fails', async () => {
    prismaMock.llmCallLog.create.mockRejectedValueOnce(new Error('db unavailable'));
    const start = recordLlmCallStart({
      endpoint: '/api/chat',
      provider: 'openai',
      model: 'gpt-4.1-mini',
      requestHeaders: {},
      requestPayload: {},
      timestamp: new Date('2026-03-26T10:00:00.000Z'),
    });

    await expect(
      recordLlmCallEnd(start, {
        timestamp: new Date('2026-03-26T10:00:01.000Z'),
        responsePayload: {},
      }),
    ).resolves.toBeUndefined();
  });

  it('truncates oversized response payloads based on configured limit', async () => {
    process.env.LLM_OBSERVABILITY_MAX_PAYLOAD_CHARS = '40';
    prismaMock.llmCallLog.create.mockResolvedValueOnce({ id: 'ok-2' });
    const start = recordLlmCallStart({
      endpoint: '/api/chat',
      provider: 'openai',
      model: 'gpt-4.1-mini',
      requestHeaders: {},
      requestPayload: {},
      timestamp: new Date('2026-03-26T10:00:00.000Z'),
    });

    await recordLlmCallEnd(start, {
      timestamp: new Date('2026-03-26T10:00:01.000Z'),
      responsePayload: { text: 'x'.repeat(200) },
    });

    const call = prismaMock.llmCallLog.create.mock.calls.at(-1)?.[0];
    expect(call.data.responsePayload).toEqual(
      expect.objectContaining({
        __truncated: true,
        __maxChars: 40,
      }),
    );
  });

  it('writes audit log when sensitive payload access is recorded', () => {
    const infoSpy = jest.spyOn(console, 'info').mockImplementation(() => undefined);
    recordSensitivePayloadAccess({
      actor: 'security-test',
      action: 'read_log_details',
      endpoint: '/api/llm-stats/logs',
      success: true,
    });
    expect(infoSpy).toHaveBeenCalledWith(
      '[llm-observability:audit]',
      expect.stringContaining('"action":"read_log_details"'),
    );
  });
});
