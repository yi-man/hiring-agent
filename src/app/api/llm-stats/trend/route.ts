import { NextResponse } from 'next/server';
import { prisma } from '@/lib/prisma';
import {
  formatBucketDate,
  parseDateRange,
  parseFilters,
  toIsoWeekStart,
} from '@/app/api/llm-stats/_shared';

type TrendPoint = {
  bucketStart: string;
  totalCalls: number;
  errorCalls: number;
  totalTokens: number;
  avgLatencyMs: number;
};

type DailyRow = {
  bucketDate: Date;
  totalCalls: number;
  errorCalls: number;
  totalTokens: number;
  avgLatencyMs: number;
};

type WeeklyRow = {
  bucketWeek: Date;
  totalCalls: number;
  errorCalls: number;
  totalTokens: number;
  avgLatencyMs: number;
};

export async function GET(request: Request) {
  try {
    const { searchParams } = new URL(request.url);
    const range = parseDateRange(searchParams);
    const { provider, model, onlyError } = parseFilters(searchParams);
    const granularity = searchParams.get('granularity') === 'week' ? 'week' : 'day';

    if (granularity === 'week') {
      const weekStart = toIsoWeekStart(range.startUtc, range.timezone);
      const lastDayInRange = new Date(range.endUtcExclusive.getTime() - 1);
      const lastWeekStart = toIsoWeekStart(lastDayInRange, range.timezone);
      const weekEndExclusive = new Date(lastWeekStart.getTime() + 7 * 24 * 60 * 60 * 1000);
      const rows = await prisma.llmUsageStatsWeekly.findMany({
        where: {
          bucketWeek: {
            gte: weekStart,
            lt: weekEndExclusive,
          },
          ...(provider ? { provider } : {}),
          ...(model ? { model } : {}),
          ...(onlyError ? { errorCalls: { gt: 0 } } : {}),
        },
        select: {
          bucketWeek: true,
          totalCalls: true,
          errorCalls: true,
          totalTokens: true,
          avgLatencyMs: true,
        },
        orderBy: {
          bucketWeek: 'asc',
        },
      });

      const points = rows.map(
        (row: WeeklyRow): TrendPoint => ({
          bucketStart: formatBucketDate(row.bucketWeek, range.timezone),
          totalCalls: row.totalCalls,
          errorCalls: row.errorCalls,
          totalTokens: row.totalTokens,
          avgLatencyMs: row.avgLatencyMs,
        }),
      );

      return NextResponse.json({
        timezone: range.timezone,
        range: { startDate: range.startDate, endDate: range.endDate },
        filters: { provider, model, onlyError, granularity },
        points,
      });
    }

    const rows = await prisma.llmUsageStatsDaily.findMany({
      where: {
        bucketDate: {
          gte: range.startUtc,
          lt: range.endUtcExclusive,
        },
        ...(provider ? { provider } : {}),
        ...(model ? { model } : {}),
        ...(onlyError ? { errorCalls: { gt: 0 } } : {}),
      },
      select: {
        bucketDate: true,
        totalCalls: true,
        errorCalls: true,
        totalTokens: true,
        avgLatencyMs: true,
      },
      orderBy: {
        bucketDate: 'asc',
      },
    });

    const points = rows.map(
      (row: DailyRow): TrendPoint => ({
        bucketStart: formatBucketDate(row.bucketDate, range.timezone),
        totalCalls: row.totalCalls,
        errorCalls: row.errorCalls,
        totalTokens: row.totalTokens,
        avgLatencyMs: row.avgLatencyMs,
      }),
    );

    return NextResponse.json({
      timezone: range.timezone,
      range: { startDate: range.startDate, endDate: range.endDate },
      filters: { provider, model, onlyError, granularity },
      points,
    });
  } catch (error) {
    const message = error instanceof Error ? error.message : 'Unknown server error';
    return NextResponse.json({ error: message }, { status: 500 });
  }
}
