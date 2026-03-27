import type { AggregateStatRow } from '@/lib/llm-observability/aggregate-service';

type LlmCallLogRow = {
  provider: string;
  model: string;
  endpoint: string;
  inputTokens: number;
  outputTokens: number;
  totalTokens: number;
  latencyMs: number;
  isError: boolean;
  timestamp: Date;
};

type PrismaLike = {
  $transaction: (args: Promise<unknown>[]) => Promise<unknown[]>;
  llmCallLog: {
    findMany: (args: unknown) => Promise<LlmCallLogRow[]>;
  };
  llmUsageStatsDaily: {
    deleteMany: (args: unknown) => Promise<unknown>;
    createMany: (args: unknown) => Promise<unknown>;
  };
  llmUsageStatsWeekly: {
    deleteMany: (args: unknown) => Promise<unknown>;
    createMany: (args: unknown) => Promise<unknown>;
  };
};

async function loadPrisma(): Promise<PrismaLike | null> {
  try {
    const mod = await import('@/lib/prisma');
    const candidate = (mod as { prisma?: PrismaLike }).prisma;
    return candidate ?? null;
  } catch {
    return null;
  }
}

function toStatRows(logs: LlmCallLogRow[]): AggregateStatRow[] {
  const map = new Map<string, AggregateStatRow & { latencySum: number }>();
  for (const log of logs) {
    const key = `${log.provider}::${log.model}::${log.endpoint}`;
    const existing = map.get(key);
    if (!existing) {
      map.set(key, {
        provider: log.provider,
        model: log.model,
        endpoint: log.endpoint,
        totalCalls: 1,
        successCalls: log.isError ? 0 : 1,
        errorCalls: log.isError ? 1 : 0,
        inputTokens: log.inputTokens,
        outputTokens: log.outputTokens,
        totalTokens: log.totalTokens,
        avgLatencyMs: log.latencyMs,
        latencySum: log.latencyMs,
      });
      continue;
    }
    existing.totalCalls += 1;
    existing.successCalls += log.isError ? 0 : 1;
    existing.errorCalls += log.isError ? 1 : 0;
    existing.inputTokens += log.inputTokens;
    existing.outputTokens += log.outputTokens;
    existing.totalTokens += log.totalTokens;
    existing.latencySum += log.latencyMs;
    existing.avgLatencyMs = existing.latencySum / existing.totalCalls;
  }

  return Array.from(map.values()).map((entry) => {
    const { latencySum, ...row } = entry;
    void latencySum;
    return row;
  });
}

function buildTimestampWhere(startUtc: Date, endUtc: Date, watermarkUtc?: Date): unknown {
  const where: {
    gte: Date;
    lt: Date;
    lte?: Date;
  } = {
    gte: startUtc,
    lt: endUtc,
  };
  if (watermarkUtc) {
    where.lte = watermarkUtc;
  }
  return where;
}

export async function fetchDailyAggregateRows(
  startUtc: Date,
  endUtc: Date,
  watermarkUtc?: Date,
): Promise<AggregateStatRow[]> {
  const prisma = await loadPrisma();
  if (!prisma) {
    return [];
  }

  const logs = await prisma.llmCallLog.findMany({
    where: {
      timestamp: buildTimestampWhere(startUtc, endUtc, watermarkUtc),
    },
    select: {
      provider: true,
      model: true,
      endpoint: true,
      inputTokens: true,
      outputTokens: true,
      totalTokens: true,
      latencyMs: true,
      isError: true,
      timestamp: true,
    },
  });
  return toStatRows(logs);
}

export async function fetchWeeklyAggregateRows(
  startUtc: Date,
  endUtc: Date,
  watermarkUtc?: Date,
): Promise<AggregateStatRow[]> {
  return fetchDailyAggregateRows(startUtc, endUtc, watermarkUtc);
}

export async function replaceDailyBucket(
  bucketDateUtc: Date,
  rows: AggregateStatRow[],
): Promise<void> {
  const prisma = await loadPrisma();
  if (!prisma) {
    return;
  }
  await prisma.$transaction([
    prisma.llmUsageStatsDaily.deleteMany({
      where: {
        bucketDate: bucketDateUtc,
      },
    }),
    ...(rows.length > 0
      ? [
          prisma.llmUsageStatsDaily.createMany({
            data: rows.map((row) => ({
              bucketDate: bucketDateUtc,
              provider: row.provider,
              model: row.model,
              endpoint: row.endpoint,
              totalCalls: row.totalCalls,
              successCalls: row.successCalls,
              errorCalls: row.errorCalls,
              inputTokens: row.inputTokens,
              outputTokens: row.outputTokens,
              totalTokens: row.totalTokens,
              avgLatencyMs: row.avgLatencyMs,
            })),
          }),
        ]
      : []),
  ]);
}

export async function replaceWeeklyBucket(
  bucketWeekStartUtc: Date,
  rows: AggregateStatRow[],
): Promise<void> {
  const prisma = await loadPrisma();
  if (!prisma) {
    return;
  }
  await prisma.$transaction([
    prisma.llmUsageStatsWeekly.deleteMany({
      where: {
        bucketWeek: bucketWeekStartUtc,
      },
    }),
    ...(rows.length > 0
      ? [
          prisma.llmUsageStatsWeekly.createMany({
            data: rows.map((row) => ({
              bucketWeek: bucketWeekStartUtc,
              provider: row.provider,
              model: row.model,
              endpoint: row.endpoint,
              totalCalls: row.totalCalls,
              successCalls: row.successCalls,
              errorCalls: row.errorCalls,
              inputTokens: row.inputTokens,
              outputTokens: row.outputTokens,
              totalTokens: row.totalTokens,
              avgLatencyMs: row.avgLatencyMs,
            })),
          }),
        ]
      : []),
  ]);
}
