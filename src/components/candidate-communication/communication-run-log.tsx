'use client';

import { useCallback, useEffect, useState } from 'react';
import Link from 'next/link';
import { ArrowLeft, FileText, MessageCircle, RefreshCw } from 'lucide-react';
import { Button, Chip } from '@/components/ui';
import { fetchCandidateCommunicationRun } from '@/lib/candidate-communication/client';
import type {
  CandidateCommunicationRunDto,
  CandidateCommunicationRunRecord,
  CandidateCommunicationRunStatus,
} from '@/lib/candidate-communication/repo';

const statusLabel: Record<CandidateCommunicationRunStatus, string> = {
  running: '运行中',
  success: '已完成',
  failed: '失败',
};

const modeLabel: Record<CandidateCommunicationRunDto['mode'], string> = {
  batch: '批量沟通',
  single: '单点沟通',
};

const runSteps = ['读取沟通范围', '执行沟通策略', '收尾统计'] as const;

function formatTime(value: string | null) {
  if (!value) return '未记录';
  const date = new Date(value);
  if (Number.isNaN(date.getTime())) return '未记录';
  return new Intl.DateTimeFormat('zh-CN', {
    dateStyle: 'medium',
    timeStyle: 'short',
  }).format(date);
}

function recordStatusLabel(status: CandidateCommunicationRunRecord['status']) {
  if (status === 'success') return '成功';
  if (status === 'failed') return '失败';
  return '运行中';
}

function scopeHref(run: CandidateCommunicationRunDto) {
  if (run.jobDescriptionId && run.candidateId) {
    return `/jd-generator/${run.jobDescriptionId}/candidates/${run.candidateId}`;
  }
  if (run.jobDescriptionId) return `/jd-generator/${run.jobDescriptionId}`;
  return '/candidates';
}

export function CandidateCommunicationRunLog({ runId }: { runId: string }) {
  const [run, setRun] = useState<CandidateCommunicationRunDto | null>(null);
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
        setRun(await fetchCandidateCommunicationRun(runId));
      } catch (e) {
        setError(e instanceof Error ? e.message : '加载沟通执行日志失败');
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

  useEffect(() => {
    if (!run || run.status !== 'running') return;
    const timer = window.setInterval(() => void loadRun({ silent: true }), 3000);
    return () => window.clearInterval(timer);
  }, [loadRun, run]);

  if (isLoading) {
    return <div className="text-muted-foreground py-12 text-center text-sm">正在加载沟通日志…</div>;
  }

  if (!run) {
    return (
      <div className="space-y-4">
        <Button as={Link} className="gap-2 px-0" href="/jd-generator" variant="light">
          <ArrowLeft className="h-4 w-4" aria-hidden />
          返回 JD 工作台
        </Button>
        <div className="border-destructive/30 bg-destructive/10 text-destructive rounded-md border px-4 py-3 text-sm">
          {error || '沟通执行记录不存在'}
        </div>
      </div>
    );
  }

  const stats = run.stats ?? {
    total: 0,
    selected: 0,
    processed: 0,
    failed: 0,
    records: [],
  };
  const scopeTitle =
    run.candidate?.displayName ??
    run.jobDescription?.position ??
    (run.mode === 'batch' ? '全部候选人' : '候选人');

  return (
    <div className="space-y-4">
      <div className="border-border flex flex-col gap-3 border-b pb-4 lg:flex-row lg:items-end lg:justify-between">
        <div className="min-w-0">
          <Button as={Link} className="mb-3 gap-2 px-0" href={scopeHref(run)} variant="light">
            <ArrowLeft className="h-4 w-4" aria-hidden />
            返回范围
          </Button>
          <div className="flex flex-wrap items-center gap-2">
            <MessageCircle className="text-muted-foreground h-5 w-5" aria-hidden />
            <h1 className="text-foreground text-2xl font-semibold tracking-normal">沟通执行日志</h1>
            <Chip size="sm" variant="flat">
              {modeLabel[run.mode]}
            </Chip>
            <Chip size="sm" variant="flat">
              {statusLabel[run.status]}
            </Chip>
            <span className="text-muted-foreground text-sm">{scopeTitle}</span>
          </div>
          <p className="text-muted-foreground mt-1 text-sm">
            Run {run.id} · {scopeTitle} · {formatTime(run.updatedAt)}
          </p>
        </div>
        <Button
          className="gap-2 self-start lg:self-auto"
          isDisabled={isRefreshing}
          type="button"
          variant="bordered"
          onClick={() => void loadRun({ silent: true })}
        >
          <RefreshCw className="h-4 w-4" aria-hidden />
          {isRefreshing ? '刷新中' : '刷新'}
        </Button>
      </div>

      {error ? (
        <div className="border-destructive/30 bg-destructive/10 text-destructive rounded-md border px-4 py-3 text-sm">
          {error}
        </div>
      ) : null}

      {run.errorMessage ? (
        <div className="border-destructive/30 bg-destructive/10 text-destructive rounded-md border px-4 py-3 text-sm">
          {run.errorMessage}
        </div>
      ) : null}

      <section className="grid gap-3 md:grid-cols-4">
        <div className="border-border rounded-lg border p-4">
          <div className="text-muted-foreground text-xs">总范围</div>
          <div className="text-foreground mt-2 text-2xl font-semibold">{stats.total} 条</div>
        </div>
        <div className="border-border rounded-lg border p-4">
          <div className="text-muted-foreground text-xs">选中执行</div>
          <div className="text-foreground mt-2 text-2xl font-semibold">{stats.selected} 条选中</div>
        </div>
        <div className="border-border rounded-lg border p-4">
          <div className="text-muted-foreground text-xs">处理完成</div>
          <div className="text-foreground mt-2 text-2xl font-semibold">
            {stats.processed} 条已处理
          </div>
        </div>
        <div className="border-border rounded-lg border p-4">
          <div className="text-muted-foreground text-xs">失败</div>
          <div className="text-foreground mt-2 text-2xl font-semibold">{stats.failed} 条</div>
        </div>
      </section>

      <div className="grid gap-4 xl:grid-cols-[minmax(0,0.5fr)_minmax(360px,0.5fr)]">
        <section className="border-border rounded-lg border p-4">
          <div className="mb-4 flex items-center gap-2 text-sm font-medium">
            <FileText className="text-muted-foreground h-4 w-4" aria-hidden />
            执行步骤
          </div>
          <div className="space-y-3">
            {runSteps.map((step, index) => (
              <div key={step} className="flex items-start gap-3 rounded-md border px-3 py-2">
                <span
                  className={
                    run.status === 'failed' && index === runSteps.length - 1
                      ? 'bg-destructive mt-1 h-2.5 w-2.5 shrink-0 rounded-full'
                      : run.status === 'running' && index === runSteps.length - 1
                        ? 'mt-1 h-2.5 w-2.5 shrink-0 rounded-full bg-amber-500'
                        : 'mt-1 h-2.5 w-2.5 shrink-0 rounded-full bg-emerald-500'
                  }
                  aria-hidden
                />
                <div>
                  <div className="text-foreground text-sm font-medium">{step}</div>
                  <div className="text-muted-foreground mt-1 text-xs">
                    {index === 0
                      ? modeLabel[run.mode]
                      : index === 1
                        ? `平台 ${run.platform}`
                        : `更新于 ${formatTime(run.updatedAt)}`}
                  </div>
                </div>
              </div>
            ))}
          </div>
        </section>

        <section className="border-border rounded-lg border p-4">
          <div className="mb-4 flex items-center gap-2 text-sm font-medium">
            <MessageCircle className="text-muted-foreground h-4 w-4" aria-hidden />
            记录明细
          </div>
          {stats.records.length > 0 ? (
            <div className="space-y-2">
              {stats.records.map((record, index) => (
                <div
                  key={`${record.candidateId ?? 'record'}-${index}`}
                  className="grid gap-2 rounded-md border px-3 py-2 md:grid-cols-[minmax(0,1fr)_84px]"
                >
                  <div className="min-w-0">
                    <div className="text-foreground truncate text-sm font-medium">
                      {record.candidateName ?? record.candidateId ?? '候选人'}
                    </div>
                    <div className="text-muted-foreground mt-1 text-xs">{record.detail}</div>
                  </div>
                  <div className="text-muted-foreground text-xs md:text-right">
                    {recordStatusLabel(record.status)}
                  </div>
                </div>
              ))}
            </div>
          ) : (
            <p className="text-muted-foreground text-sm">
              当前运行只返回汇总统计，暂无逐条消息明细。
            </p>
          )}
        </section>
      </div>
    </div>
  );
}
