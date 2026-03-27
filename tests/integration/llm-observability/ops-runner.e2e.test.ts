import { runObservabilityOp } from '@/lib/llm-observability/ops-runner';

function buildDeps() {
  return {
    service: {
      runRealtimeAggregation: jest.fn().mockResolvedValue(undefined),
      runDailySolidification: jest.fn().mockResolvedValue(undefined),
      runWeeklySolidification: jest.fn().mockResolvedValue(undefined),
      runBackfill: jest.fn().mockResolvedValue(undefined),
    },
    runRetention: jest.fn().mockResolvedValue(undefined),
    now: jest.fn().mockReturnValue(new Date('2026-03-30T02:03:04.000Z')),
  };
}

describe('llm observability ops runner (integration/e2e artifact)', () => {
  afterEach(() => {
    delete process.env.LLM_OBSERVABILITY_RETENTION_CLEANUP_HOUR_UTC;
    delete process.env.LLM_OBSERVABILITY_RETENTION_CLEANUP_MINUTE_UTC;
    delete process.env.LLM_OBSERVABILITY_RAW_PAYLOAD_RETENTION_DAYS;
    delete process.env.LLM_OBSERVABILITY_AGGREGATE_RETENTION_DAYS;
  });

  it('routes realtime, daily, weekly and backfill commands to service methods', async () => {
    const deps = buildDeps();

    await runObservabilityOp(['realtime'], deps);
    await runObservabilityOp(['daily', '--date', '2026-03-29T00:00:00.000Z'], deps);
    await runObservabilityOp(['weekly', '--week-start', '2026-03-23T00:00:00.000Z'], deps);
    await runObservabilityOp(
      [
        'backfill',
        '--start-date',
        '2026-03-20T00:00:00.000Z',
        '--end-date',
        '2026-03-29T00:00:00.000Z',
      ],
      deps,
    );

    expect(deps.service.runRealtimeAggregation).toHaveBeenCalledWith(
      new Date('2026-03-30T02:03:04.000Z'),
    );
    expect(deps.service.runDailySolidification).toHaveBeenCalledWith(
      new Date('2026-03-29T00:00:00.000Z'),
    );
    expect(deps.service.runWeeklySolidification).toHaveBeenCalledWith(
      new Date('2026-03-23T00:00:00.000Z'),
    );
    expect(deps.service.runBackfill).toHaveBeenCalledWith(
      new Date('2026-03-20T00:00:00.000Z'),
      new Date('2026-03-29T00:00:00.000Z'),
    );
  });

  it('executes retention command with env-derived defaults', async () => {
    const deps = buildDeps();
    process.env.LLM_OBSERVABILITY_RETENTION_CLEANUP_HOUR_UTC = '4';
    process.env.LLM_OBSERVABILITY_RETENTION_CLEANUP_MINUTE_UTC = '30';
    process.env.LLM_OBSERVABILITY_RAW_PAYLOAD_RETENTION_DAYS = '14';
    process.env.LLM_OBSERVABILITY_AGGREGATE_RETENTION_DAYS = '120';

    await runObservabilityOp(['retention', '--now', '2026-03-30T05:00:00.000Z'], deps);

    expect(deps.runRetention).toHaveBeenCalledTimes(1);
    expect(deps.runRetention).toHaveBeenCalledWith(new Date('2026-03-30T05:00:00.000Z'), {
      dailySolidifyHourUtc: expect.any(Number),
      dailySolidifyMinuteUtc: expect.any(Number),
      weeklySolidifyWeekdayUtc: expect.any(Number),
      weeklySolidifyHourUtc: expect.any(Number),
      weeklySolidifyMinuteUtc: expect.any(Number),
      retentionCleanupHourUtc: 4,
      retentionCleanupMinuteUtc: 30,
      rawPayloadRetentionDays: 14,
      aggregateRetentionDays: 120,
    });
  });
});
