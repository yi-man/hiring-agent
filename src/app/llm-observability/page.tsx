'use client';

import { useCallback, useEffect, useMemo, useState } from 'react';
import { usePathname, useRouter, useSearchParams } from 'next/navigation';
import { FilterBar } from '@/components/llm-observability/filter-bar';
import { OverviewCards } from '@/components/llm-observability/overview-cards';
import { TrendCharts } from '@/components/llm-observability/trend-charts';
import { ErrorPanel } from '@/components/llm-observability/error-panel';
import { LogTable } from '@/components/llm-observability/log-table';
import { LogDetailsDrawer } from '@/components/llm-observability/log-details-drawer';
import type {
  ErrorDistributionResponse,
  LlmStatsFilters,
  LogItem,
  LogsResponse,
  OverviewResponse,
  TrendResponse,
} from '@/components/llm-observability/types';

function defaultDateRange() {
  const end = new Date();
  const start = new Date(end.getTime() - 29 * 24 * 60 * 60 * 1000);
  const toDate = (date: Date) => date.toISOString().slice(0, 10);
  return { startDate: toDate(start), endDate: toDate(end) };
}

function parseNumber(raw: string | null, fallback: number): number {
  if (!raw) return fallback;
  const parsed = Number(raw);
  if (!Number.isFinite(parsed)) return fallback;
  const intValue = Math.trunc(parsed);
  return intValue > 0 ? intValue : fallback;
}

export default function LlmObservabilityPage() {
  const router = useRouter();
  const pathname = usePathname();
  const searchParams = useSearchParams();
  const initialDates = useMemo(() => defaultDateRange(), []);

  const [filters, setFilters] = useState<LlmStatsFilters>({
    startDate: searchParams.get('startDate') || initialDates.startDate,
    endDate: searchParams.get('endDate') || initialDates.endDate,
    timezone: searchParams.get('timezone') || 'Asia/Shanghai',
    provider: searchParams.get('provider') || '',
    model: searchParams.get('model') || '',
    onlyError: searchParams.get('onlyError') === 'true' || searchParams.get('onlyError') === '1',
    granularity: searchParams.get('granularity') === 'week' ? 'week' : 'day',
    page: parseNumber(searchParams.get('page'), 1),
    limit: parseNumber(searchParams.get('limit'), 20),
    adminToken: '',
  });

  const [overview, setOverview] = useState<OverviewResponse['overview'] | null>(null);
  const [trend, setTrend] = useState<TrendResponse['points']>([]);
  const [errors, setErrors] = useState<ErrorDistributionResponse | null>(null);
  const [logs, setLogs] = useState<LogsResponse | null>(null);
  const [selectedLog, setSelectedLog] = useState<LogItem | null>(null);
  const [isDrawerOpen, setDrawerOpen] = useState(false);
  const [isLoading, setLoading] = useState(false);
  const [pageError, setPageError] = useState<string | null>(null);

  const syncUrl = useCallback(
    (next: LlmStatsFilters) => {
      const params = new URLSearchParams();
      params.set('startDate', next.startDate);
      params.set('endDate', next.endDate);
      params.set('timezone', next.timezone);
      params.set('granularity', next.granularity);
      params.set('page', String(next.page));
      params.set('limit', String(next.limit));
      if (next.provider) params.set('provider', next.provider);
      if (next.model) params.set('model', next.model);
      if (next.onlyError) params.set('onlyError', 'true');
      router.replace(`${pathname}?${params.toString()}`);
    },
    [pathname, router],
  );

  const onFilterChange = (patch: Partial<LlmStatsFilters>) => {
    setFilters((prev) => {
      const next = { ...prev, ...patch };
      syncUrl(next);
      return next;
    });
  };

  useEffect(() => {
    const load = async () => {
      setLoading(true);
      setPageError(null);
      try {
        const params = new URLSearchParams();
        params.set('startDate', filters.startDate);
        params.set('endDate', filters.endDate);
        params.set('timezone', filters.timezone);
        params.set('granularity', filters.granularity);
        params.set('page', String(filters.page));
        params.set('limit', String(filters.limit));
        if (filters.provider) params.set('provider', filters.provider);
        if (filters.model) params.set('model', filters.model);
        if (filters.onlyError) params.set('onlyError', 'true');
        const query = params.toString();

        const [overviewRes, trendRes, errorsRes, logsRes] = await Promise.all([
          fetch(`/api/llm-stats/overview?${query}`),
          fetch(`/api/llm-stats/trend?${query}`),
          fetch(`/api/llm-stats/errors?${query}`),
          fetch(`/api/llm-stats/logs?${query}`),
        ]);

        if (!overviewRes.ok || !trendRes.ok || !errorsRes.ok || !logsRes.ok) {
          throw new Error('failed to load llm observability data');
        }

        const overviewJson = (await overviewRes.json()) as OverviewResponse;
        const trendJson = (await trendRes.json()) as TrendResponse;
        const errorsJson = (await errorsRes.json()) as ErrorDistributionResponse;
        const logsJson = (await logsRes.json()) as LogsResponse;

        setOverview(overviewJson.overview);
        setTrend(trendJson.points);
        setErrors(errorsJson);
        setLogs(logsJson);
      } catch (error) {
        setPageError(error instanceof Error ? error.message : 'unknown error');
      } finally {
        setLoading(false);
      }
    };

    void load();
  }, [filters]);

  return (
    <div className="container mx-auto space-y-4 px-4 pb-12">
      <div className="space-y-1">
        <h1 className="text-2xl font-semibold">LLM Observability</h1>
        <p className="text-foreground/70 text-sm">
          Overview, trends, errors, and call logs for LLM traffic.
        </p>
      </div>

      <FilterBar filters={filters} onChange={onFilterChange} />

      {pageError && <div className="text-danger text-sm">{pageError}</div>}

      <OverviewCards data={overview} isLoading={isLoading} />
      <TrendCharts points={trend} isLoading={isLoading} />
      <ErrorPanel data={errors} isLoading={isLoading} />

      <LogTable
        logs={logs?.items ?? []}
        page={filters.page}
        hasMore={logs?.hasMore ?? false}
        total={logs?.total ?? 0}
        isLoading={isLoading}
        canLoadDetails={Boolean(filters.adminToken)}
        onPageChange={(page) => onFilterChange({ page })}
        onSelectLog={(log) => {
          setSelectedLog(log);
          setDrawerOpen(true);
        }}
      />

      <LogDetailsDrawer
        isOpen={isDrawerOpen}
        selectedLog={selectedLog}
        filters={filters}
        onClose={() => setDrawerOpen(false)}
      />
    </div>
  );
}
