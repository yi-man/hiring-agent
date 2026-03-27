import { env } from '@/lib/env';
import {
  type AggregateCronConfig,
  runRetentionCleanup,
} from '@/lib/llm-observability/aggregate-cron';
import { aggregateService, type AggregateService } from '@/lib/llm-observability/aggregate-service';

export type ObservabilityOp = 'realtime' | 'daily' | 'weekly' | 'backfill' | 'retention';

export type ObservabilityRunnerDeps = {
  service: AggregateService;
  runRetention: (nowUtc: Date, config: AggregateCronConfig) => Promise<void>;
  now: () => Date;
};

const defaultDeps: ObservabilityRunnerDeps = {
  service: aggregateService,
  runRetention: runRetentionCleanup,
  now: () => new Date(),
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

function parseIsoDateArg(value: string | undefined, flagName: string): Date {
  if (!value) {
    throw new Error(`Missing required argument: ${flagName}`);
  }
  const date = new Date(value);
  if (Number.isNaN(date.getTime())) {
    throw new Error(`Invalid date for ${flagName}: ${value}`);
  }
  return date;
}

function parseArgs(argv: string[]): Record<string, string> {
  const parsed: Record<string, string> = {};
  for (let i = 0; i < argv.length; i += 1) {
    const token = argv[i];
    if (!token.startsWith('--')) {
      continue;
    }
    const key = token.slice(2);
    const value = argv[i + 1];
    if (!value || value.startsWith('--')) {
      parsed[key] = 'true';
      continue;
    }
    parsed[key] = value;
    i += 1;
  }
  return parsed;
}

function buildRetentionConfig(): AggregateCronConfig {
  return {
    dailySolidifyHourUtc: env.LLM_OBSERVABILITY_DAILY_SOLIDIFY_HOUR_UTC,
    dailySolidifyMinuteUtc: env.LLM_OBSERVABILITY_DAILY_SOLIDIFY_MINUTE_UTC,
    weeklySolidifyWeekdayUtc: env.LLM_OBSERVABILITY_WEEKLY_SOLIDIFY_WEEKDAY_UTC,
    weeklySolidifyHourUtc: env.LLM_OBSERVABILITY_WEEKLY_SOLIDIFY_HOUR_UTC,
    weeklySolidifyMinuteUtc: env.LLM_OBSERVABILITY_WEEKLY_SOLIDIFY_MINUTE_UTC,
    retentionCleanupHourUtc: parseEnvInt(
      process.env.LLM_OBSERVABILITY_RETENTION_CLEANUP_HOUR_UTC,
      1,
    ),
    retentionCleanupMinuteUtc: parseEnvInt(
      process.env.LLM_OBSERVABILITY_RETENTION_CLEANUP_MINUTE_UTC,
      0,
    ),
    rawPayloadRetentionDays: parseEnvInt(
      process.env.LLM_OBSERVABILITY_RAW_PAYLOAD_RETENTION_DAYS,
      7,
    ),
    aggregateRetentionDays: parseEnvInt(process.env.LLM_OBSERVABILITY_AGGREGATE_RETENTION_DAYS, 90),
  };
}

export function getObservabilityOpsUsage(): string {
  return [
    'Usage: llm-observability-ops <command> [options]',
    '',
    'Commands:',
    '  realtime',
    '  daily --date <ISO_DATE>',
    '  weekly --week-start <ISO_DATE>',
    '  backfill --start-date <ISO_DATE> --end-date <ISO_DATE>',
    '  retention [--now <ISO_DATE>]',
  ].join('\n');
}

export async function runObservabilityOp(
  argv: string[],
  deps: ObservabilityRunnerDeps = defaultDeps,
): Promise<{ operation: ObservabilityOp; detail: string }> {
  const [operationRaw, ...rest] = argv;
  const operation = operationRaw as ObservabilityOp | undefined;
  const args = parseArgs(rest);

  switch (operation) {
    case 'realtime': {
      const now = deps.now();
      await deps.service.runRealtimeAggregation(now);
      return { operation, detail: `ran realtime aggregation at ${now.toISOString()}` };
    }
    case 'daily': {
      const date = parseIsoDateArg(args['date'], '--date');
      await deps.service.runDailySolidification(date);
      return { operation, detail: `solidified daily bucket ${date.toISOString()}` };
    }
    case 'weekly': {
      const weekStart = parseIsoDateArg(args['week-start'], '--week-start');
      await deps.service.runWeeklySolidification(weekStart);
      return { operation, detail: `solidified weekly bucket ${weekStart.toISOString()}` };
    }
    case 'backfill': {
      const start = parseIsoDateArg(args['start-date'], '--start-date');
      const end = parseIsoDateArg(args['end-date'], '--end-date');
      await deps.service.runBackfill(start, end);
      return {
        operation,
        detail: `backfilled range ${start.toISOString()} -> ${end.toISOString()}`,
      };
    }
    case 'retention': {
      const now = args['now'] ? parseIsoDateArg(args['now'], '--now') : deps.now();
      await deps.runRetention(now, buildRetentionConfig());
      return { operation, detail: `ran retention cleanup at ${now.toISOString()}` };
    }
    default:
      throw new Error(getObservabilityOpsUsage());
  }
}
