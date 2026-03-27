import { env } from '@/lib/env';
import { aggregateService, AggregateService } from '@/lib/llm-observability/aggregate-service';

export type AggregateCronConfig = {
  dailySolidifyHourUtc: number;
  dailySolidifyMinuteUtc: number;
  weeklySolidifyWeekdayUtc: number;
  weeklySolidifyHourUtc: number;
  weeklySolidifyMinuteUtc: number;
  retentionCleanupHourUtc: number;
  retentionCleanupMinuteUtc: number;
  rawPayloadRetentionDays: number;
  aggregateRetentionDays: number;
};

type PrismaRetentionPort = {
  llmCallLog: { deleteMany: (args: unknown) => Promise<unknown> };
  llmUsageStatsDaily: { deleteMany: (args: unknown) => Promise<unknown> };
  llmUsageStatsWeekly: { deleteMany: (args: unknown) => Promise<unknown> };
  llmUsageStatsTotal: { deleteMany: (args: unknown) => Promise<unknown> };
};

function parseEnvInt(value: string | undefined, fallback: number): number {
  if (!value) {
    return fallback;
  }
  const parsed = Number(value);
  if (!Number.isFinite(parsed)) {
    return fallback;
  }
  const asInt = Math.trunc(parsed);
  return asInt >= 0 ? asInt : fallback;
}

const defaultConfig: AggregateCronConfig = {
  dailySolidifyHourUtc: env.LLM_OBSERVABILITY_DAILY_SOLIDIFY_HOUR_UTC,
  dailySolidifyMinuteUtc: env.LLM_OBSERVABILITY_DAILY_SOLIDIFY_MINUTE_UTC,
  weeklySolidifyWeekdayUtc: env.LLM_OBSERVABILITY_WEEKLY_SOLIDIFY_WEEKDAY_UTC,
  weeklySolidifyHourUtc: env.LLM_OBSERVABILITY_WEEKLY_SOLIDIFY_HOUR_UTC,
  weeklySolidifyMinuteUtc: env.LLM_OBSERVABILITY_WEEKLY_SOLIDIFY_MINUTE_UTC,
  retentionCleanupHourUtc: parseEnvInt(process.env.LLM_OBSERVABILITY_RETENTION_CLEANUP_HOUR_UTC, 1),
  retentionCleanupMinuteUtc: parseEnvInt(
    process.env.LLM_OBSERVABILITY_RETENTION_CLEANUP_MINUTE_UTC,
    0,
  ),
  rawPayloadRetentionDays: parseEnvInt(process.env.LLM_OBSERVABILITY_RAW_PAYLOAD_RETENTION_DAYS, 7),
  aggregateRetentionDays: parseEnvInt(process.env.LLM_OBSERVABILITY_AGGREGATE_RETENTION_DAYS, 90),
};

function toUtcDayStart(date: Date): Date {
  return new Date(Date.UTC(date.getUTCFullYear(), date.getUTCMonth(), date.getUTCDate()));
}

function addUtcDays(date: Date, days: number): Date {
  return new Date(date.getTime() + days * 24 * 60 * 60 * 1000);
}

async function loadPrismaForRetention(): Promise<PrismaRetentionPort | null> {
  try {
    const mod = await import('@/lib/prisma');
    const candidate = (mod as { prisma?: PrismaRetentionPort }).prisma;
    return candidate ?? null;
  } catch {
    return null;
  }
}

export async function runRetentionCleanup(
  nowUtc: Date,
  config: AggregateCronConfig,
): Promise<void> {
  const prisma = await loadPrismaForRetention();
  if (!prisma) {
    return;
  }
  const rawCutoff = addUtcDays(nowUtc, -Math.max(1, config.rawPayloadRetentionDays));
  const aggregateCutoff = toUtcDayStart(
    addUtcDays(nowUtc, -Math.max(1, config.aggregateRetentionDays)),
  );

  await Promise.all([
    prisma.llmCallLog.deleteMany({
      where: {
        timestamp: { lt: rawCutoff },
      },
    }),
    prisma.llmUsageStatsDaily.deleteMany({
      where: {
        bucketDate: { lt: aggregateCutoff },
      },
    }),
    prisma.llmUsageStatsWeekly.deleteMany({
      where: {
        bucketWeek: { lt: aggregateCutoff },
      },
    }),
    prisma.llmUsageStatsTotal.deleteMany({
      where: {
        updatedAt: { lt: aggregateCutoff },
      },
    }),
  ]);
}

export async function runAggregationCronTick(
  nowUtc: Date = new Date(),
  service: AggregateService = aggregateService,
  config: AggregateCronConfig = defaultConfig,
): Promise<void> {
  await service.runRealtimeAggregation(nowUtc);

  const hour = nowUtc.getUTCHours();
  const minute = nowUtc.getUTCMinutes();
  const weekday = nowUtc.getUTCDay();

  if (hour === config.dailySolidifyHourUtc && minute === config.dailySolidifyMinuteUtc) {
    await service.runDailySolidification(addUtcDays(toUtcDayStart(nowUtc), -1));
  }

  if (
    weekday === config.weeklySolidifyWeekdayUtc &&
    hour === config.weeklySolidifyHourUtc &&
    minute === config.weeklySolidifyMinuteUtc
  ) {
    await service.runWeeklySolidification(addUtcDays(toUtcDayStart(nowUtc), -7));
  }

  if (hour === config.retentionCleanupHourUtc && minute === config.retentionCleanupMinuteUtc) {
    await runRetentionCleanup(nowUtc, config);
  }
}
