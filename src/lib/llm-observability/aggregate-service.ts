import {
  fetchDailyAggregateRows,
  fetchWeeklyAggregateRows,
  replaceDailyBucket,
  replaceWeeklyBucket,
} from '@/lib/llm-observability/aggregate-repo';
import { env } from '@/lib/env';

export type AggregateStatRow = {
  provider: string;
  model: string;
  endpoint: string;
  totalCalls: number;
  successCalls: number;
  errorCalls: number;
  inputTokens: number;
  outputTokens: number;
  totalTokens: number;
  avgLatencyMs: number;
};

export type AggregateRepoPort = {
  fetchDailyAggregateRows: (
    startUtc: Date,
    endUtc: Date,
    watermarkUtc?: Date,
  ) => Promise<AggregateStatRow[]>;
  replaceDailyBucket: (bucketDateUtc: Date, rows: AggregateStatRow[]) => Promise<void>;
  fetchWeeklyAggregateRows: (
    startUtc: Date,
    endUtc: Date,
    watermarkUtc?: Date,
  ) => Promise<AggregateStatRow[]>;
  replaceWeeklyBucket: (bucketWeekStartUtc: Date, rows: AggregateStatRow[]) => Promise<void>;
};

export type AggregateService = {
  runRealtimeAggregation: (nowUtc: Date) => Promise<void>;
  runDailySolidification: (dateUtc: Date) => Promise<void>;
  runWeeklySolidification: (weekStartUtc: Date) => Promise<void>;
  runBackfill: (startDateUtc: Date, endDateUtc: Date) => Promise<void>;
};

export type AggregateServiceConfig = {
  realtimeWatermarkMinutes: number;
};

const defaultRepo: AggregateRepoPort = {
  fetchDailyAggregateRows,
  replaceDailyBucket,
  fetchWeeklyAggregateRows,
  replaceWeeklyBucket,
};

function toUtcDayStart(date: Date): Date {
  return new Date(Date.UTC(date.getUTCFullYear(), date.getUTCMonth(), date.getUTCDate()));
}

function addUtcDays(date: Date, days: number): Date {
  return new Date(date.getTime() + days * 24 * 60 * 60 * 1000);
}

function toUtcIsoWeekStart(date: Date): Date {
  const dayStart = toUtcDayStart(date);
  const utcWeekday = dayStart.getUTCDay();
  const offset = utcWeekday === 0 ? -6 : 1 - utcWeekday;
  return addUtcDays(dayStart, offset);
}

async function recomputeDailyBucket(
  repo: AggregateRepoPort,
  bucketDateUtc: Date,
  watermarkUtc?: Date,
): Promise<void> {
  const endUtc = addUtcDays(bucketDateUtc, 1);
  const rows = await repo.fetchDailyAggregateRows(bucketDateUtc, endUtc, watermarkUtc);
  await repo.replaceDailyBucket(bucketDateUtc, rows);
}

async function recomputeWeeklyBucket(
  repo: AggregateRepoPort,
  bucketWeekStartUtc: Date,
  watermarkUtc?: Date,
): Promise<void> {
  const endUtc = addUtcDays(bucketWeekStartUtc, 7);
  const rows = await repo.fetchWeeklyAggregateRows(bucketWeekStartUtc, endUtc, watermarkUtc);
  await repo.replaceWeeklyBucket(bucketWeekStartUtc, rows);
}

export function createAggregateService(
  repo: AggregateRepoPort = defaultRepo,
  config: Partial<AggregateServiceConfig> = {},
): AggregateService {
  const realtimeWatermarkMinutes =
    config.realtimeWatermarkMinutes ?? env.LLM_OBSERVABILITY_REALTIME_WATERMARK_MINUTES;

  return {
    async runRealtimeAggregation(nowUtc: Date): Promise<void> {
      const now = new Date(nowUtc);
      const watermarkUtc = new Date(now.getTime() - realtimeWatermarkMinutes * 60 * 1000);
      const dayStart = toUtcDayStart(now);
      const weekStart = toUtcIsoWeekStart(now);

      await recomputeDailyBucket(repo, addUtcDays(dayStart, -2), watermarkUtc);
      await recomputeDailyBucket(repo, addUtcDays(dayStart, -1), watermarkUtc);
      await recomputeDailyBucket(repo, dayStart, watermarkUtc);
      await recomputeWeeklyBucket(repo, weekStart, watermarkUtc);
    },

    async runDailySolidification(dateUtc: Date): Promise<void> {
      await recomputeDailyBucket(repo, toUtcDayStart(dateUtc));
    },

    async runWeeklySolidification(weekStartUtc: Date): Promise<void> {
      await recomputeWeeklyBucket(repo, toUtcIsoWeekStart(weekStartUtc));
    },

    async runBackfill(startDateUtc: Date, endDateUtc: Date): Promise<void> {
      const start = toUtcDayStart(startDateUtc);
      const end = toUtcDayStart(endDateUtc);
      if (start.getTime() > end.getTime()) {
        return;
      }

      let cursor = start;
      while (cursor.getTime() <= end.getTime()) {
        await recomputeDailyBucket(repo, cursor);
        cursor = addUtcDays(cursor, 1);
      }

      const seenWeeks = new Set<number>();
      cursor = start;
      while (cursor.getTime() <= end.getTime()) {
        const weekStart = toUtcIsoWeekStart(cursor);
        const weekKey = weekStart.getTime();
        if (!seenWeeks.has(weekKey)) {
          seenWeeks.add(weekKey);
          await recomputeWeeklyBucket(repo, weekStart);
        }
        cursor = addUtcDays(cursor, 1);
      }
    },
  };
}

export const aggregateService = createAggregateService();
