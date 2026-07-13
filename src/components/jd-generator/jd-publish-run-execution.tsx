'use client';

import { useCallback, useEffect, useState } from 'react';
import Link from 'next/link';
import { useSearchParams } from 'next/navigation';
import {
  AlertTriangle,
  ArrowLeft,
  CheckCircle2,
  Clock3,
  FileText,
  Loader2,
  RefreshCw,
  XCircle,
} from 'lucide-react';
import { Button, Chip } from '@/components/ui';
import { fetchJobDescriptionPublishRunWithEvents } from '@/lib/jd/client';
import {
  currentPathWithSearch,
  getReturnTarget,
  withReturnTarget,
} from '@/lib/navigation/return-url';
import type {
  JobDescriptionPublishRunDto,
  JobDescriptionPublishRunEventDto,
  JobDescriptionPublishRunStage,
  JobDescriptionPublishRunStatus,
} from '@/lib/jd-publishing/publish-run-repo';

const terminalStatuses: JobDescriptionPublishRunStatus[] = ['success', 'failed'];

const statusMeta: Record<
  JobDescriptionPublishRunStatus,
  { label: string; className: string; icon: React.ReactNode }
> = {
  pending: {
    label: '排队中',
    className: 'border-zinc-200 bg-zinc-50 text-zinc-700 dark:border-zinc-800 dark:bg-zinc-900/60',
    icon: <Clock3 className="h-4 w-4" aria-hidden />,
  },
  running: {
    label: '执行中',
    className:
      'border-amber-200 bg-amber-50 text-amber-700 dark:border-amber-900 dark:bg-amber-950/40',
    icon: <Loader2 className="h-4 w-4 animate-spin" aria-hidden />,
  },
  success: {
    label: '已完成',
    className:
      'border-emerald-200 bg-emerald-50 text-emerald-700 dark:border-emerald-900 dark:bg-emerald-950/40',
    icon: <CheckCircle2 className="h-4 w-4" aria-hidden />,
  },
  failed: {
    label: '失败',
    className: 'border-rose-200 bg-rose-50 text-rose-700 dark:border-rose-900 dark:bg-rose-950/40',
    icon: <XCircle className="h-4 w-4" aria-hidden />,
  },
};

const stageLabels: Record<JobDescriptionPublishRunStage, string> = {
  queued: '任务创建',
  publishing: '发布到 BOSS 直聘',
  completed: '完成',
};

const stageOrder: JobDescriptionPublishRunStage[] = ['queued', 'publishing', 'completed'];

function formatTime(value: string | null) {
  if (!value) return '未记录';
  const date = new Date(value);
  if (Number.isNaN(date.getTime())) return '未记录';
  return new Intl.DateTimeFormat('zh-CN', {
    dateStyle: 'medium',
    timeStyle: 'medium',
  }).format(date);
}

function formatDuration(run: JobDescriptionPublishRunDto) {
  if (!run.startedAt) return '未开始';
  const start = new Date(run.startedAt).getTime();
  const end = run.finishedAt ? new Date(run.finishedAt).getTime() : Date.now();
  if (Number.isNaN(start) || Number.isNaN(end) || end < start) return '统计中';
  const seconds = Math.max(0, Math.round((end - start) / 1000));
  if (seconds < 60) return `${seconds}s`;
  return `${Math.floor(seconds / 60)}m ${seconds % 60}s`;
}

function eventToneClass(level: JobDescriptionPublishRunEventDto['level']) {
  if (level === 'success') return 'border-emerald-200 bg-emerald-50/70 dark:border-emerald-900';
  if (level === 'warning') return 'border-amber-200 bg-amber-50/70 dark:border-amber-900';
  if (level === 'error') return 'border-rose-200 bg-rose-50/70 dark:border-rose-900';
  return 'border-border bg-background';
}

function isPlainObject(value: unknown): value is Record<string, unknown> {
  return typeof value === 'object' && value !== null && !Array.isArray(value);
}

function renderDetailValue(key: string, value: unknown) {
  if (value === null || value === undefined || value === '') return null;
  if (Array.isArray(value)) {
    return value.length > 0 ? value.join('、') : null;
  }
  if (isPlainObject(value)) {
    return (
      <pre className="bg-muted/40 max-h-40 overflow-auto rounded-md px-2 py-1 font-mono text-[11px] whitespace-pre-wrap">
        {JSON.stringify(value, null, 2)}
      </pre>
    );
  }
  if (typeof value === 'boolean') {
    return value ? '是' : '否';
  }
  return String(value);
}

function EventDetail({ detail }: { detail: Record<string, unknown> | null }) {
  if (!detail || Object.keys(detail).length === 0) return null;

  return (
    <dl className="mt-2 grid gap-2 text-xs sm:grid-cols-2">
      {Object.entries(detail).map(([key, value]) => {
        const rendered = renderDetailValue(key, value);
        if (!rendered) return null;
        return (
          <div key={key} className="min-w-0 rounded-md border px-2 py-1.5">
            <dt className="text-muted-foreground mb-1 font-mono">{key}</dt>
            <dd className="text-foreground min-w-0 break-words">{rendered}</dd>
          </div>
        );
      })}
    </dl>
  );
}

function stepState(params: {
  stage: JobDescriptionPublishRunStage;
  run: JobDescriptionPublishRunDto;
  events: JobDescriptionPublishRunEventDto[];
}) {
  const stageEvents = params.events.filter((event) => event.stage === params.stage);
  if (stageEvents.some((event) => event.level === 'error')) return 'failed';
  if (params.run.status === 'failed' && params.run.currentStage === params.stage) return 'failed';
  if (stageEvents.some((event) => event.level === 'success')) return 'done';
  if (params.run.status === 'success') return 'done';
  if (params.run.currentStage === params.stage && params.run.status === 'running') return 'active';
  const currentIndex = params.run.currentStage ? stageOrder.indexOf(params.run.currentStage) : -1;
  const stageIndex = stageOrder.indexOf(params.stage);
  if (currentIndex > stageIndex) return 'done';
  if (params.stage === 'queued' && stageEvents.length > 0) return 'done';
  return 'waiting';
}

function StepDot({ state }: { state: ReturnType<typeof stepState> }) {
  if (state === 'done') {
    return <CheckCircle2 className="mt-0.5 h-4 w-4 shrink-0 text-emerald-600" aria-hidden />;
  }
  if (state === 'failed') {
    return <XCircle className="mt-0.5 h-4 w-4 shrink-0 text-rose-600" aria-hidden />;
  }
  if (state === 'active') {
    return <Loader2 className="mt-0.5 h-4 w-4 shrink-0 animate-spin text-amber-600" aria-hidden />;
  }
  return <span className="border-border bg-muted mt-1 h-3 w-3 shrink-0 rounded-full border" />;
}

export function JDPublishRunExecution({ runId }: { runId: string }) {
  const searchParams = useSearchParams();
  const returnTarget = getReturnTarget(searchParams, {
    href: '/jd-generator',
    label: '返回列表',
  });
  const [run, setRun] = useState<JobDescriptionPublishRunDto | null>(null);
  const [events, setEvents] = useState<JobDescriptionPublishRunEventDto[]>([]);
  const [isLoading, setIsLoading] = useState(true);
  const [isRefreshing, setIsRefreshing] = useState(false);
  const [error, setError] = useState('');

  const loadRun = useCallback(
    async (options?: { silent?: boolean }) => {
      if (options?.silent) {
        setIsRefreshing(true);
      } else {
        setIsLoading(true);
      }
      setError('');
      try {
        const data = await fetchJobDescriptionPublishRunWithEvents(runId);
        setRun(data.run);
        setEvents(data.events);
      } catch (e) {
        setError(e instanceof Error ? e.message : '加载发布进度失败');
      } finally {
        setIsLoading(false);
        setIsRefreshing(false);
      }
    },
    [runId],
  );

  useEffect(() => {
    void loadRun();
  }, [loadRun]);

  const runStatus = run?.status;
  useEffect(() => {
    if (!runStatus || terminalStatuses.includes(runStatus)) return;
    const timer = window.setInterval(() => {
      void loadRun({ silent: true });
    }, 1500);
    return () => window.clearInterval(timer);
  }, [loadRun, runStatus]);

  const detailHref = run?.jobDescriptionId
    ? withReturnTarget(`/jd-generator/${run.jobDescriptionId}`, {
        href: currentPathWithSearch(`/jd-generator/publish-runs/${runId}`, searchParams),
        label: '返回执行页',
      })
    : null;

  if (isLoading) {
    return <div className="text-muted-foreground py-12 text-center text-sm">正在加载执行页…</div>;
  }

  if (!run) {
    return (
      <div className="space-y-4">
        <Button as={Link} className="gap-2 px-0" href={returnTarget.href} variant="light">
          <ArrowLeft className="h-4 w-4" aria-hidden />
          {returnTarget.label}
        </Button>
        <div className="border-destructive/30 bg-destructive/10 text-destructive rounded-md border px-4 py-3 text-sm">
          {error || '发布任务不存在'}
        </div>
      </div>
    );
  }

  const meta = statusMeta[run.status];

  return (
    <div className="space-y-4">
      <div className="border-border flex flex-col gap-3 border-b pb-4 lg:flex-row lg:items-end lg:justify-between">
        <div className="min-w-0">
          <Button as={Link} className="mb-3 gap-2 px-0" href={returnTarget.href} variant="light">
            <ArrowLeft className="h-4 w-4" aria-hidden />
            {returnTarget.label}
          </Button>
          <div className="flex flex-wrap items-center gap-2">
            <span className="text-muted-foreground">{meta.icon}</span>
            <h1 className="text-foreground text-2xl font-semibold tracking-normal">JD 发布执行</h1>
            <Chip className={`border text-xs ${meta.className}`} size="sm" variant="flat">
              {meta.label}
            </Chip>
          </div>
          <p className="text-muted-foreground mt-1 text-sm">
            {run.platform === 'boss-like' ? 'BOSS 直聘' : run.platform} ·{' '}
            {formatTime(run.updatedAt)}
          </p>
        </div>
        <div className="flex flex-wrap gap-2">
          <Button
            className="gap-2"
            isDisabled={isRefreshing}
            type="button"
            variant="bordered"
            onClick={() => void loadRun({ silent: true })}
          >
            <RefreshCw className="h-4 w-4" aria-hidden />
            {isRefreshing ? '刷新中' : '刷新'}
          </Button>
          {detailHref ? (
            <Button as={Link} className="gap-2" color="primary" href={detailHref}>
              <FileText className="h-4 w-4" aria-hidden />
              查看详情
            </Button>
          ) : null}
        </div>
      </div>

      {run.status === 'success' && detailHref ? (
        <div className="rounded-md border border-emerald-200 bg-emerald-50/70 px-4 py-3 text-sm text-emerald-800 dark:border-emerald-900 dark:bg-emerald-950/30 dark:text-emerald-200">
          发布任务已完成，可以进入详情页查看 JD 状态。
        </div>
      ) : null}

      {run.status === 'failed' ? (
        <div className="border-destructive/30 bg-destructive/10 text-destructive flex items-start gap-2 rounded-md border px-4 py-3 text-sm">
          <AlertTriangle className="mt-0.5 h-4 w-4 shrink-0" aria-hidden />
          <span>{run.errorMessage || '发布失败'}</span>
        </div>
      ) : null}

      {error ? (
        <div className="border-destructive/30 bg-destructive/10 text-destructive rounded-md border px-4 py-3 text-sm">
          {error}
        </div>
      ) : null}

      <section className="grid gap-3 md:grid-cols-4">
        <div className="border-border rounded-lg border p-4">
          <div className="text-muted-foreground text-xs">当前阶段</div>
          <div className="text-foreground mt-2 text-base font-semibold">
            {run.currentStage ? stageLabels[run.currentStage] : '等待开始'}
          </div>
        </div>
        <div className="border-border rounded-lg border p-4">
          <div className="text-muted-foreground text-xs">耗时</div>
          <div className="text-foreground mt-2 text-base font-semibold">{formatDuration(run)}</div>
        </div>
        <div className="border-border rounded-lg border p-4">
          <div className="text-muted-foreground text-xs">事件</div>
          <div className="text-foreground mt-2 text-base font-semibold">{events.length} 条</div>
        </div>
        <div className="border-border rounded-lg border p-4">
          <div className="text-muted-foreground text-xs">平台</div>
          <div className="text-foreground mt-2 truncate text-base font-semibold">
            {run.platform === 'boss-like' ? 'BOSS 直聘' : run.platform}
          </div>
        </div>
      </section>

      {/* Workflow / Skill info section */}
      {run.skillId ? (
        <section className="border-border rounded-lg border p-4">
          <details>
            <summary className="cursor-pointer text-sm font-medium text-blue-600 hover:text-blue-700 dark:text-blue-400">
              Workflow: {run.skillId}
            </summary>
            <div className="text-muted-foreground mt-2 text-xs">
              Skill ID: {run.skillId}
              {run.publishTaskId ? <> · Task ID: {run.publishTaskId}</> : null}
            </div>
          </details>
        </section>
      ) : null}

      <div className="grid gap-4 xl:grid-cols-[minmax(300px,0.42fr)_minmax(0,0.58fr)]">
        <section className="border-border rounded-lg border p-4">
          <div className="mb-4 flex items-center gap-2 text-sm font-medium">
            <Clock3 className="text-muted-foreground h-4 w-4" aria-hidden />
            执行步骤
          </div>
          <div className="space-y-3">
            {stageOrder.map((stage) => {
              const state = stepState({ stage, run, events });
              const stageEvents = events.filter((event) => event.stage === stage);
              const lastEvent = stageEvents.at(-1);
              return (
                <div key={stage} className="rounded-md border px-3 py-2">
                  <div className="flex items-start gap-3">
                    <StepDot state={state} />
                    <div className="min-w-0">
                      <div className="text-foreground text-sm font-medium">
                        {stageLabels[stage]}
                      </div>
                      <div className="text-muted-foreground mt-1 text-xs">
                        {lastEvent ? lastEvent.message : '等待执行'}
                      </div>
                    </div>
                  </div>
                </div>
              );
            })}
          </div>
        </section>

        <section className="border-border rounded-lg border p-4">
          <div className="mb-4 flex items-center justify-between gap-3">
            <div className="text-sm font-medium">执行事件</div>
            {!terminalStatuses.includes(run.status) ? (
              <span className="text-muted-foreground inline-flex items-center gap-1 text-xs">
                <Loader2 className="h-3.5 w-3.5 animate-spin" aria-hidden />
                自动刷新中
              </span>
            ) : null}
          </div>
          {events.length === 0 ? (
            <div className="text-muted-foreground rounded-md border px-3 py-8 text-center text-sm">
              暂无事件，任务正在进入队列。
            </div>
          ) : (
            <div className="space-y-3">
              {events.map((event) => (
                <article
                  key={event.id}
                  className={`rounded-md border px-3 py-2 ${eventToneClass(event.level)}`}
                >
                  <div className="flex flex-wrap items-start justify-between gap-2">
                    <div className="min-w-0">
                      <div className="text-foreground text-sm font-medium">{event.message}</div>
                      <div className="text-muted-foreground mt-1 text-xs">
                        {stageLabels[event.stage]} · {formatTime(event.createdAt)}
                      </div>
                    </div>
                    <Chip size="sm" variant="flat">
                      {event.level}
                    </Chip>
                  </div>
                  <EventDetail detail={event.detail} />
                </article>
              ))}
            </div>
          )}
        </section>
      </div>
    </div>
  );
}
