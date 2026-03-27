import { NextResponse } from 'next/server';
import { prisma } from '@/lib/prisma';
import { buildWhereForStats, parseDateRange, parseFilters } from '@/app/api/llm-stats/_shared';

type ErrorRow = {
  provider: string;
  model: string;
  endpoint: string;
  totalCalls: number;
  errorCalls: number;
};

export async function GET(request: Request) {
  try {
    const { searchParams } = new URL(request.url);
    const range = parseDateRange(searchParams);
    const { provider, model } = parseFilters(searchParams);

    const rows = await prisma.llmUsageStatsDaily.findMany({
      where: buildWhereForStats({
        startUtc: range.startUtc,
        endUtcExclusive: range.endUtcExclusive,
        provider,
        model,
      }),
      select: {
        provider: true,
        model: true,
        endpoint: true,
        totalCalls: true,
        errorCalls: true,
      },
    });

    const byProvider = new Map<string, number>();
    const byModel = new Map<string, number>();
    const byEndpoint = new Map<string, number>();
    let totalCalls = 0;
    let totalErrors = 0;

    for (const row of rows as ErrorRow[]) {
      totalCalls += row.totalCalls;
      totalErrors += row.errorCalls;
      byProvider.set(row.provider, (byProvider.get(row.provider) ?? 0) + row.errorCalls);
      byModel.set(row.model, (byModel.get(row.model) ?? 0) + row.errorCalls);
      byEndpoint.set(row.endpoint, (byEndpoint.get(row.endpoint) ?? 0) + row.errorCalls);
    }

    const sortDesc = (
      a: { key: string; errorCalls: number },
      b: { key: string; errorCalls: number },
    ) => b.errorCalls - a.errorCalls;

    return NextResponse.json({
      timezone: range.timezone,
      range: { startDate: range.startDate, endDate: range.endDate },
      filters: { provider, model },
      summary: {
        totalCalls,
        totalErrors,
        errorRate: totalCalls > 0 ? totalErrors / totalCalls : 0,
      },
      distributions: {
        providers: Array.from(byProvider.entries())
          .map(([key, errorCalls]) => ({ provider: key, errorCalls }))
          .sort((a, b) =>
            sortDesc(
              { key: a.provider, errorCalls: a.errorCalls },
              { key: b.provider, errorCalls: b.errorCalls },
            ),
          ),
        models: Array.from(byModel.entries())
          .map(([key, errorCalls]) => ({ model: key, errorCalls }))
          .sort((a, b) =>
            sortDesc(
              { key: a.model, errorCalls: a.errorCalls },
              { key: b.model, errorCalls: b.errorCalls },
            ),
          ),
        endpoints: Array.from(byEndpoint.entries())
          .map(([key, errorCalls]) => ({ endpoint: key, errorCalls }))
          .sort((a, b) =>
            sortDesc(
              { key: a.endpoint, errorCalls: a.errorCalls },
              { key: b.endpoint, errorCalls: b.errorCalls },
            ),
          ),
      },
      topErrorEndpoints: Array.from(byEndpoint.entries())
        .map(([endpoint, errorCalls]) => ({ endpoint, errorCalls }))
        .sort((a, b) => b.errorCalls - a.errorCalls)
        .slice(0, 10),
      recentErrors: [],
    });
  } catch (error) {
    const message = error instanceof Error ? error.message : 'Unknown server error';
    return NextResponse.json({ error: message }, { status: 500 });
  }
}
