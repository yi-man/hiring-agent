import {
  AggregateRepoPort,
  AggregateStatRow,
  createAggregateService,
} from '@/lib/llm-observability/aggregate-service';
import {
  runAggregationCronTick,
  runRetentionCleanup,
} from '@/lib/llm-observability/aggregate-cron';

jest.mock('@/lib/prisma', () => ({
  prisma: {
    llmCallLog: { deleteMany: jest.fn().mockResolvedValue({ count: 0 }) },
    llmUsageStatsDaily: { deleteMany: jest.fn().mockResolvedValue({ count: 0 }) },
    llmUsageStatsWeekly: { deleteMany: jest.fn().mockResolvedValue({ count: 0 }) },
    llmUsageStatsTotal: { deleteMany: jest.fn().mockResolvedValue({ count: 0 }) },
  },
}));

const { prisma } = jest.requireMock('@/lib/prisma') as {
  prisma: {
    llmCallLog: { deleteMany: jest.Mock };
    llmUsageStatsDaily: { deleteMany: jest.Mock };
    llmUsageStatsWeekly: { deleteMany: jest.Mock };
    llmUsageStatsTotal: { deleteMany: jest.Mock };
  };
};

function row(overrides: Partial<AggregateStatRow> = {}): AggregateStatRow {
  return {
    provider: 'openai',
    model: 'gpt-4o-mini',
    endpoint: '/api/chat',
    totalCalls: 1,
    successCalls: 1,
    errorCalls: 0,
    inputTokens: 10,
    outputTokens: 20,
    totalTokens: 30,
    avgLatencyMs: 100,
    ...overrides,
  };
}

function createRepoMock(): jest.Mocked<AggregateRepoPort> {
  return {
    fetchDailyAggregateRows: jest.fn().mockResolvedValue([row()]),
    replaceDailyBucket: jest.fn().mockResolvedValue(undefined),
    fetchWeeklyAggregateRows: jest.fn().mockResolvedValue([row()]),
    replaceWeeklyBucket: jest.fn().mockResolvedValue(undefined),
  };
}

describe('aggregate-service', () => {
  it('applies realtime watermark (now-10m) and recomputes D-2..D', async () => {
    const repo = createRepoMock();
    const service = createAggregateService(repo, {
      realtimeWatermarkMinutes: 10,
    });
    const now = new Date('2026-03-26T12:00:00.000Z');

    await service.runRealtimeAggregation(now);

    expect(repo.fetchDailyAggregateRows).toHaveBeenCalledTimes(3);
    expect(repo.replaceDailyBucket).toHaveBeenCalledTimes(3);
    expect(repo.fetchDailyAggregateRows).toHaveBeenNthCalledWith(
      1,
      new Date('2026-03-24T00:00:00.000Z'),
      new Date('2026-03-25T00:00:00.000Z'),
      new Date('2026-03-26T11:50:00.000Z'),
    );
    expect(repo.fetchDailyAggregateRows).toHaveBeenNthCalledWith(
      2,
      new Date('2026-03-25T00:00:00.000Z'),
      new Date('2026-03-26T00:00:00.000Z'),
      new Date('2026-03-26T11:50:00.000Z'),
    );
    expect(repo.fetchDailyAggregateRows).toHaveBeenNthCalledWith(
      3,
      new Date('2026-03-26T00:00:00.000Z'),
      new Date('2026-03-27T00:00:00.000Z'),
      new Date('2026-03-26T11:50:00.000Z'),
    );
    expect(repo.fetchWeeklyAggregateRows).toHaveBeenCalledWith(
      new Date('2026-03-23T00:00:00.000Z'),
      new Date('2026-03-30T00:00:00.000Z'),
      new Date('2026-03-26T11:50:00.000Z'),
    );
  });

  it('daily and weekly solidification recompute full closed buckets', async () => {
    const repo = createRepoMock();
    const service = createAggregateService(repo);

    await service.runDailySolidification(new Date('2026-03-25T00:00:00.000Z'));
    await service.runWeeklySolidification(new Date('2026-03-16T00:00:00.000Z'));

    expect(repo.fetchDailyAggregateRows).toHaveBeenCalledWith(
      new Date('2026-03-25T00:00:00.000Z'),
      new Date('2026-03-26T00:00:00.000Z'),
      undefined,
    );
    expect(repo.fetchWeeklyAggregateRows).toHaveBeenCalledWith(
      new Date('2026-03-16T00:00:00.000Z'),
      new Date('2026-03-23T00:00:00.000Z'),
      undefined,
    );
  });

  it('is idempotent when rerunning same solidification inputs', async () => {
    const repo = createRepoMock();
    const service = createAggregateService(repo);
    const day = new Date('2026-03-25T00:00:00.000Z');

    await service.runDailySolidification(day);
    await service.runDailySolidification(day);

    const first = repo.replaceDailyBucket.mock.calls[0];
    const second = repo.replaceDailyBucket.mock.calls[1];
    expect(first).toEqual(second);
  });

  it('automatically re-includes delayed D-1 data on next realtime run', async () => {
    const repo = createRepoMock();
    const service = createAggregateService(repo);
    const now = new Date('2026-03-26T12:00:00.000Z');

    await service.runRealtimeAggregation(now);
    await service.runRealtimeAggregation(new Date('2026-03-26T12:05:00.000Z'));

    const dMinus1Start = new Date('2026-03-25T00:00:00.000Z').getTime();
    const dMinus1Calls = repo.fetchDailyAggregateRows.mock.calls.filter(
      ([start]) => start.getTime() === dMinus1Start,
    );
    expect(dMinus1Calls).toHaveLength(2);
  });
});

describe('aggregate-cron', () => {
  beforeEach(() => {
    prisma.llmCallLog.deleteMany.mockClear();
    prisma.llmUsageStatsDaily.deleteMany.mockClear();
    prisma.llmUsageStatsWeekly.deleteMany.mockClear();
    prisma.llmUsageStatsTotal.deleteMany.mockClear();
  });

  it('runs realtime every tick and runs daily/weekly solidification by schedule', async () => {
    const service = {
      runRealtimeAggregation: jest.fn().mockResolvedValue(undefined),
      runDailySolidification: jest.fn().mockResolvedValue(undefined),
      runWeeklySolidification: jest.fn().mockResolvedValue(undefined),
      runBackfill: jest.fn().mockResolvedValue(undefined),
    };

    await runAggregationCronTick(new Date('2026-03-30T00:10:00.000Z'), service, {
      dailySolidifyHourUtc: 0,
      dailySolidifyMinuteUtc: 5,
      weeklySolidifyWeekdayUtc: 1,
      weeklySolidifyHourUtc: 0,
      weeklySolidifyMinuteUtc: 10,
      retentionCleanupHourUtc: 1,
      retentionCleanupMinuteUtc: 0,
      rawPayloadRetentionDays: 7,
      aggregateRetentionDays: 90,
    });

    expect(service.runRealtimeAggregation).toHaveBeenCalledWith(
      new Date('2026-03-30T00:10:00.000Z'),
    );
    expect(service.runDailySolidification).not.toHaveBeenCalled();
    expect(service.runWeeklySolidification).toHaveBeenCalledWith(
      new Date('2026-03-23T00:00:00.000Z'),
    );
  });

  it('retention cleanup path exists and remains idempotent across repeated runs', async () => {
    const now = new Date('2026-03-30T01:00:00.000Z');
    const config = {
      dailySolidifyHourUtc: 0,
      dailySolidifyMinuteUtc: 5,
      weeklySolidifyWeekdayUtc: 1,
      weeklySolidifyHourUtc: 0,
      weeklySolidifyMinuteUtc: 10,
      retentionCleanupHourUtc: 1,
      retentionCleanupMinuteUtc: 0,
      rawPayloadRetentionDays: 7,
      aggregateRetentionDays: 90,
    };

    await runRetentionCleanup(now, config);
    const firstDailyDeleteArgs = prisma.llmUsageStatsDaily.deleteMany.mock.calls[0][0];
    const firstRawDeleteArgs = prisma.llmCallLog.deleteMany.mock.calls[0][0];

    await runRetentionCleanup(now, config);
    const secondDailyDeleteArgs = prisma.llmUsageStatsDaily.deleteMany.mock.calls[1][0];
    const secondRawDeleteArgs = prisma.llmCallLog.deleteMany.mock.calls[1][0];

    expect(firstDailyDeleteArgs).toEqual(secondDailyDeleteArgs);
    expect(firstRawDeleteArgs).toEqual(secondRawDeleteArgs);
  });
});
