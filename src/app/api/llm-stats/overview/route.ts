import { NextResponse } from 'next/server';
import { prisma } from '@/lib/prisma';
import {
  buildWhereForStats,
  formatBucketDate,
  parseDateRange,
  parseFilters,
  toIsoWeekStart,
} from '@/app/api/llm-stats/_shared';

type StatsRow = {
  totalCalls: number;
  successCalls: number;
  errorCalls: number;
  inputTokens: number;
  outputTokens: number;
  totalTokens: number;
  avgLatencyMs: number;
};

function sumStats(rows: StatsRow[]) {
  const totals = rows.reduce(
    (acc, row) => {
      acc.totalCalls += row.totalCalls;
      acc.successCalls += row.successCalls;
      acc.errorCalls += row.errorCalls;
      acc.inputTokens += row.inputTokens;
      acc.outputTokens += row.outputTokens;
      acc.totalTokens += row.totalTokens;
      acc.weightedLatency += row.avgLatencyMs * row.totalCalls;
      return acc;
    },
    {
      totalCalls: 0,
      successCalls: 0,
      errorCalls: 0,
      inputTokens: 0,
      outputTokens: 0,
      totalTokens: 0,
      weightedLatency: 0,
    },
  );

  return {
    totalCalls: totals.totalCalls,
    successCalls: totals.successCalls,
    errorCalls: totals.errorCalls,
    inputTokens: totals.inputTokens,
    outputTokens: totals.outputTokens,
    totalTokens: totals.totalTokens,
    avgLatencyMs: totals.totalCalls > 0 ? totals.weightedLatency / totals.totalCalls : 0,
    errorRate: totals.totalCalls > 0 ? totals.errorCalls / totals.totalCalls : 0,
  };
}

export async function GET(request: Request) {
  try {
    const { searchParams } = new URL(request.url);
    const range = parseDateRange(searchParams);
    const { provider, model, onlyError } = parseFilters(searchParams);

    const commonWhere = buildWhereForStats({
      startUtc: range.startUtc,
      endUtcExclusive: range.endUtcExclusive,
      provider,
      model,
    });
    const totalRows = await prisma.llmUsageStatsDaily.findMany({
      where: {
        ...commonWhere,
        ...(onlyError ? { errorCalls: { gt: 0 } } : {}),
      },
      select: {
        totalCalls: true,
        successCalls: true,
        errorCalls: true,
        inputTokens: true,
        outputTokens: true,
        totalTokens: true,
        avgLatencyMs: true,
      },
    });

    const todayStartUtc = new Date(range.endUtcExclusive.getTime() - 24 * 60 * 60 * 1000);
    const todayRows = await prisma.llmUsageStatsDaily.findMany({
      where: {
        bucketDate: {
          gte: todayStartUtc,
          lt: range.endUtcExclusive,
        },
        ...(provider ? { provider } : {}),
        ...(model ? { model } : {}),
        ...(onlyError ? { errorCalls: { gt: 0 } } : {}),
      },
      select: {
        totalCalls: true,
        successCalls: true,
        errorCalls: true,
        inputTokens: true,
        outputTokens: true,
        totalTokens: true,
        avgLatencyMs: true,
      },
    });

    const weekStartUtc = toIsoWeekStart(todayStartUtc, range.timezone);
    const weekRows = await prisma.llmUsageStatsWeekly.findMany({
      where: {
        bucketWeek: weekStartUtc,
        ...(provider ? { provider } : {}),
        ...(model ? { model } : {}),
        ...(onlyError ? { errorCalls: { gt: 0 } } : {}),
      },
      select: {
        totalCalls: true,
        successCalls: true,
        errorCalls: true,
        inputTokens: true,
        outputTokens: true,
        totalTokens: true,
        avgLatencyMs: true,
      },
    });

    return NextResponse.json({
      timezone: range.timezone,
      range: {
        startDate: range.startDate,
        endDate: range.endDate,
      },
      filters: { provider, model, onlyError },
      overview: {
        today: sumStats(todayRows),
        week: {
          weekStartDate: formatBucketDate(weekStartUtc, range.timezone),
          ...sumStats(weekRows),
        },
        total: sumStats(totalRows),
      },
    });
  } catch (error) {
    const message = error instanceof Error ? error.message : 'Unknown server error';
    return NextResponse.json({ error: message }, { status: 500 });
  }
}
