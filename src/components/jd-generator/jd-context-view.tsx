'use client';

import { useCallback, useEffect, useMemo, useState } from 'react';
import Link from 'next/link';
import { useSearchParams } from 'next/navigation';
import { ArrowLeft, BookOpen, Database, FileText, RefreshCw } from 'lucide-react';
import { Button, Chip } from '@/components/ui';
import { fetchJobDescriptionContext } from '@/lib/jd/client';
import {
  currentPathWithSearch,
  getReturnTarget,
  withReturnTarget,
} from '@/lib/navigation/return-url';
import type { JobDescriptionContextDto } from '@/lib/jd/context';

function formatUpdatedAt(value: string) {
  const date = new Date(value);
  if (Number.isNaN(date.getTime())) return '更新时间未知';
  return new Intl.DateTimeFormat('zh-CN', {
    dateStyle: 'medium',
    timeStyle: 'short',
  }).format(date);
}

function formatScore(value: number) {
  return Number.isFinite(value) ? value.toFixed(2) : 'n/a';
}

function formatNumber(value: number) {
  return new Intl.NumberFormat('zh-CN').format(value);
}

export function JDContextView({ jobDescriptionId }: { jobDescriptionId: string }) {
  const searchParams = useSearchParams();
  const returnTarget = getReturnTarget(searchParams, {
    href: `/jd-generator/${jobDescriptionId}`,
    label: '返回 JD',
  });
  const pageReturnTarget = {
    href: currentPathWithSearch(`/jd-generator/${jobDescriptionId}/context`, searchParams),
    label: '返回上下文',
  };
  const [data, setData] = useState<JobDescriptionContextDto | null>(null);
  const [isLoading, setIsLoading] = useState(true);
  const [isRefreshing, setIsRefreshing] = useState(false);
  const [error, setError] = useState('');

  const loadContext = useCallback(
    async (options?: { silent?: boolean }) => {
      if (options?.silent) {
        setIsRefreshing(true);
      } else {
        setIsLoading(true);
      }
      setError('');
      try {
        setData(await fetchJobDescriptionContext(jobDescriptionId));
      } catch (e) {
        setError(e instanceof Error ? e.message : '加载 JD 上下文失败');
      } finally {
        setIsLoading(false);
        setIsRefreshing(false);
      }
    },
    [jobDescriptionId],
  );

  useEffect(() => {
    void loadContext();
  }, [loadContext]);

  const documentCount = useMemo(() => {
    return new Set(data?.context.matches.map((match) => match.documentId) ?? []).size;
  }, [data]);

  if (isLoading) {
    return <div className="text-muted-foreground py-12 text-center text-sm">正在加载上下文…</div>;
  }

  if (!data) {
    return (
      <div className="space-y-4">
        <Button as={Link} className="gap-2 px-0" href={returnTarget.href} variant="light">
          <ArrowLeft className="h-4 w-4" aria-hidden />
          {returnTarget.label}
        </Button>
        <div className="border-destructive/30 bg-destructive/10 text-destructive rounded-md border px-4 py-3 text-sm">
          {error || 'JD 上下文不存在'}
        </div>
      </div>
    );
  }

  const { context, jobDescription } = data;
  const selection = context.selection;

  return (
    <div className="space-y-4">
      <div className="border-border flex flex-col gap-3 border-b pb-4 lg:flex-row lg:items-end lg:justify-between">
        <div className="min-w-0">
          <Button as={Link} className="mb-3 gap-2 px-0" href={returnTarget.href} variant="light">
            <ArrowLeft className="h-4 w-4" aria-hidden />
            {returnTarget.label}
          </Button>
          <div className="flex flex-wrap items-center gap-2">
            <BookOpen className="text-muted-foreground h-5 w-5" aria-hidden />
            <h1 className="text-foreground text-2xl font-semibold tracking-normal">
              本次使用的知识库上下文
            </h1>
            <Chip className="border text-xs" size="sm" variant="flat">
              {context.used ? '已使用' : '未使用'}
            </Chip>
          </div>
          <p className="text-muted-foreground mt-1 text-sm">
            {jobDescription.department} · {jobDescription.position} ·{' '}
            {formatUpdatedAt(jobDescription.updatedAt)}
          </p>
        </div>
        <div className="flex flex-wrap gap-2">
          <Button
            className="gap-2"
            isDisabled={isRefreshing}
            type="button"
            variant="bordered"
            onClick={() => void loadContext({ silent: true })}
          >
            <RefreshCw className="h-4 w-4" aria-hidden />
            {isRefreshing ? '刷新中' : '刷新'}
          </Button>
          <Button
            as={Link}
            className="gap-2"
            href={withReturnTarget('/knowledge', pageReturnTarget)}
            variant="bordered"
          >
            <Database className="h-4 w-4" aria-hidden />
            打开知识库
          </Button>
          <Button
            as={Link}
            className="gap-2"
            color="primary"
            href={withReturnTarget(`/jd-generator/${jobDescription.id}`, pageReturnTarget)}
          >
            <FileText className="h-4 w-4" aria-hidden />
            查看 JD
          </Button>
        </div>
      </div>

      {error ? (
        <div className="border-destructive/30 bg-destructive/10 text-destructive rounded-md border px-4 py-3 text-sm">
          {error}
        </div>
      ) : null}

      <section className="grid gap-3 md:grid-cols-4">
        <div className="border-border rounded-lg border p-4">
          <div className="text-muted-foreground text-xs">选入片段</div>
          <div className="text-foreground mt-2 text-lg font-semibold">
            {selection.selectedCount} / {selection.maxChunks}
          </div>
        </div>
        <div className="border-border rounded-lg border p-4">
          <div className="text-muted-foreground text-xs">选入文档</div>
          <div className="text-foreground mt-2 text-lg font-semibold">
            {documentCount} / {selection.maxDocuments}
          </div>
        </div>
        <div className="border-border rounded-lg border p-4">
          <div className="text-muted-foreground text-xs">候选召回</div>
          <div className="text-foreground mt-2 text-lg font-semibold">
            {selection.candidateCount} / {selection.candidateTopK}
          </div>
        </div>
        <div className="border-border rounded-lg border p-4">
          <div className="text-muted-foreground text-xs">上下文长度</div>
          <div className="text-foreground mt-2 text-lg font-semibold">
            {formatNumber(context.textLength)}
          </div>
        </div>
      </section>

      <div className="grid gap-4 xl:grid-cols-[minmax(0,0.66fr)_minmax(340px,0.34fr)]">
        <section className="border-border space-y-4 rounded-lg border p-4">
          <div className="flex items-center justify-between gap-3">
            <div className="text-foreground text-sm font-medium">选入片段</div>
            <span className="text-muted-foreground text-xs">
              每份文档最多 {selection.maxChunksPerDocument} 条
            </span>
          </div>
          {context.matches.length > 0 ? (
            <div className="space-y-3">
              {context.matches.map((match) => (
                <article
                  key={`${match.documentId}-${match.chunkId}`}
                  className="rounded-lg border p-3"
                >
                  <div className="flex flex-wrap items-start justify-between gap-3">
                    <div className="min-w-0">
                      <div className="text-foreground text-sm font-medium">
                        #{match.selectedRank} {match.title?.trim() || match.filename}
                      </div>
                      <div className="text-muted-foreground mt-1 text-xs">
                        {match.filename} · chunk {match.chunkIndex}
                      </div>
                    </div>
                    <Chip className="border text-xs" size="sm" variant="flat">
                      score {formatScore(match.score)}
                    </Chip>
                  </div>
                  <div className="text-muted-foreground mt-2 text-xs">{match.reason}</div>
                  {match.content.trim() ? (
                    <pre className="bg-muted/40 text-foreground mt-3 max-h-72 overflow-auto rounded-md px-3 py-2 text-xs leading-6 whitespace-pre-wrap">
                      {match.content}
                    </pre>
                  ) : (
                    <div className="text-muted-foreground mt-3 rounded-md border px-3 py-2 text-xs">
                      未找到该片段正文，可能是历史记录或文档已重新索引。
                    </div>
                  )}
                </article>
              ))}
            </div>
          ) : (
            <div className="text-muted-foreground rounded-md border px-3 py-8 text-center text-sm">
              本次生成没有选入知识库片段。
            </div>
          )}
        </section>

        <aside className="space-y-4">
          <section className="border-border space-y-3 rounded-lg border p-4">
            <div className="text-foreground text-sm font-medium">检索 query</div>
            <pre className="bg-muted/40 text-muted-foreground max-h-56 overflow-auto rounded-md px-3 py-2 text-xs whitespace-pre-wrap">
              {context.query || '未记录'}
            </pre>
          </section>

          <section className="border-border space-y-3 rounded-lg border p-4">
            <div className="text-foreground text-sm font-medium">选入规则</div>
            <dl className="grid gap-2 text-xs">
              <div className="flex justify-between gap-3 rounded-md border px-3 py-2">
                <dt className="text-muted-foreground">候选召回</dt>
                <dd className="font-mono">top {selection.candidateTopK}</dd>
              </div>
              <div className="flex justify-between gap-3 rounded-md border px-3 py-2">
                <dt className="text-muted-foreground">最终片段</dt>
                <dd className="font-mono">max {selection.maxChunks}</dd>
              </div>
              <div className="flex justify-between gap-3 rounded-md border px-3 py-2">
                <dt className="text-muted-foreground">文档上限</dt>
                <dd className="font-mono">max {selection.maxDocuments}</dd>
              </div>
              <div className="flex justify-between gap-3 rounded-md border px-3 py-2">
                <dt className="text-muted-foreground">单文档片段</dt>
                <dd className="font-mono">max {selection.maxChunksPerDocument}</dd>
              </div>
              <div className="flex justify-between gap-3 rounded-md border px-3 py-2">
                <dt className="text-muted-foreground">最低分</dt>
                <dd className="font-mono">{selection.minScore}</dd>
              </div>
            </dl>
          </section>

          <section className="border-border space-y-3 rounded-lg border p-4">
            <div className="text-foreground text-sm font-medium">过滤统计</div>
            <dl className="grid gap-2 text-xs">
              <div className="flex justify-between gap-3">
                <dt className="text-muted-foreground">低分过滤</dt>
                <dd className="font-mono">{selection.excludedByLowScore}</dd>
              </div>
              <div className="flex justify-between gap-3">
                <dt className="text-muted-foreground">重复/相邻过滤</dt>
                <dd className="font-mono">{selection.excludedByRedundancy}</dd>
              </div>
              <div className="flex justify-between gap-3">
                <dt className="text-muted-foreground">文档上限过滤</dt>
                <dd className="font-mono">{selection.excludedByDocumentLimit}</dd>
              </div>
              <div className="flex justify-between gap-3">
                <dt className="text-muted-foreground">单文档上限过滤</dt>
                <dd className="font-mono">{selection.excludedByPerDocumentLimit}</dd>
              </div>
              <div className="flex justify-between gap-3">
                <dt className="text-muted-foreground">长度过滤</dt>
                <dd className="font-mono">{selection.excludedByContextLength}</dd>
              </div>
            </dl>
          </section>
        </aside>
      </div>

      <section className="border-border space-y-3 rounded-lg border p-4">
        <div className="text-foreground text-sm font-medium">模型上下文原文</div>
        <pre className="bg-muted/40 text-foreground max-h-96 overflow-auto rounded-md px-3 py-2 text-xs leading-6 whitespace-pre-wrap">
          {context.contextText || '本次没有可展示的上下文原文。'}
        </pre>
      </section>
    </div>
  );
}
