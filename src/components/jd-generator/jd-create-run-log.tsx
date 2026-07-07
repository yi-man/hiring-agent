'use client';

import { useCallback, useEffect, useState } from 'react';
import Link from 'next/link';
import { useSearchParams } from 'next/navigation';
import { ArrowLeft, CheckCircle2, FileText, RefreshCw } from 'lucide-react';
import { Button, Chip } from '@/components/ui';
import { fetchJobDescription } from '@/lib/jd/client';
import {
  currentPathWithSearch,
  getReturnTarget,
  withReturnTarget,
} from '@/lib/navigation/return-url';
import type { JobDescriptionDto } from '@/types';

function formatTime(value: string) {
  const date = new Date(value);
  if (Number.isNaN(date.getTime())) return '未记录';
  return new Intl.DateTimeFormat('zh-CN', {
    dateStyle: 'medium',
    timeStyle: 'short',
  }).format(date);
}

export function JDCreateRunLog({ jobDescriptionId }: { jobDescriptionId: string }) {
  const searchParams = useSearchParams();
  const returnTarget = getReturnTarget(searchParams, {
    href: '/jd-generator',
    label: '返回列表',
  });
  const createRunReturnTarget = {
    href: currentPathWithSearch(`/jd-generator/${jobDescriptionId}/runs/create`, searchParams),
    label: '返回创建记录',
  };
  const [jobDescription, setJobDescription] = useState<JobDescriptionDto | null>(null);
  const [isLoading, setIsLoading] = useState(true);
  const [isRefreshing, setIsRefreshing] = useState(false);
  const [error, setError] = useState('');

  const loadJobDescription = useCallback(
    async (options?: { silent?: boolean }) => {
      if (options?.silent) {
        setIsRefreshing(true);
      } else {
        setIsLoading(true);
      }
      setError('');
      try {
        setJobDescription(await fetchJobDescription(jobDescriptionId));
      } catch (e) {
        setError(e instanceof Error ? e.message : '加载 JD 创建记录失败');
      } finally {
        setIsLoading(false);
        setIsRefreshing(false);
      }
    },
    [jobDescriptionId],
  );

  useEffect(() => {
    void loadJobDescription();
  }, [loadJobDescription]);

  if (isLoading) {
    return <div className="text-muted-foreground py-12 text-center text-sm">正在加载创建记录…</div>;
  }

  if (!jobDescription) {
    return (
      <div className="space-y-4">
        <Button as={Link} className="gap-2 px-0" href={returnTarget.href} variant="light">
          <ArrowLeft className="h-4 w-4" aria-hidden />
          {returnTarget.label}
        </Button>
        <div className="border-destructive/30 bg-destructive/10 text-destructive rounded-md border px-4 py-3 text-sm">
          {error || 'JD 创建记录不存在'}
        </div>
      </div>
    );
  }

  const context = jobDescription.generationMeta?.context ?? null;
  const steps = [
    {
      label: '读取岗位输入',
      detail: `${jobDescription.department} · ${jobDescription.position}`,
    },
    {
      label: '生成 JD 内容',
      detail: jobDescription.generationMeta?.model ?? '已生成',
    },
    {
      label: '保存到 JD 工作台',
      detail: formatTime(jobDescription.createdAt),
    },
  ];

  return (
    <div className="space-y-4">
      <div className="border-border flex flex-col gap-3 border-b pb-4 lg:flex-row lg:items-end lg:justify-between">
        <div className="min-w-0">
          <Button as={Link} className="mb-3 gap-2 px-0" href={returnTarget.href} variant="light">
            <ArrowLeft className="h-4 w-4" aria-hidden />
            {returnTarget.label}
          </Button>
          <div className="flex flex-wrap items-center gap-2">
            <CheckCircle2 className="h-5 w-5 text-emerald-600" aria-hidden />
            <h1 className="text-foreground text-2xl font-semibold tracking-normal">JD 创建完成</h1>
            <Chip size="sm" variant="flat">
              {jobDescription.status}
            </Chip>
          </div>
          <p className="text-muted-foreground mt-1 text-sm">
            {jobDescription.position} · {formatTime(jobDescription.updatedAt)}
          </p>
        </div>
        <div className="flex flex-wrap gap-2">
          <Button
            className="gap-2"
            isDisabled={isRefreshing}
            type="button"
            variant="bordered"
            onClick={() => void loadJobDescription({ silent: true })}
          >
            <RefreshCw className="h-4 w-4" aria-hidden />
            {isRefreshing ? '刷新中' : '刷新'}
          </Button>
          <Button
            as={Link}
            className="gap-2"
            color="primary"
            href={withReturnTarget(`/jd-generator/${jobDescription.id}`, createRunReturnTarget)}
          >
            <FileText className="h-4 w-4" aria-hidden />
            查看详情
          </Button>
        </div>
      </div>

      {error ? (
        <div className="border-destructive/30 bg-destructive/10 text-destructive rounded-md border px-4 py-3 text-sm">
          {error}
        </div>
      ) : null}

      <section className="grid gap-3 md:grid-cols-3">
        <div className="border-border rounded-lg border p-4">
          <div className="text-muted-foreground text-xs">职位</div>
          <div className="text-foreground mt-2 text-lg font-semibold">
            {jobDescription.position}
          </div>
        </div>
        <div className="border-border rounded-lg border p-4">
          <div className="text-muted-foreground text-xs">公司上下文</div>
          <div className="text-foreground mt-2 text-lg font-semibold">
            {context?.used ? `${context.matches.length} 个来源` : '未使用'}
          </div>
        </div>
        <div className="border-border rounded-lg border p-4">
          <div className="text-muted-foreground text-xs">生成模型</div>
          <div className="text-foreground mt-2 truncate text-lg font-semibold">
            {jobDescription.generationMeta?.model ?? '未记录'}
          </div>
        </div>
      </section>

      <div className="grid gap-4 xl:grid-cols-[minmax(0,0.48fr)_minmax(360px,0.52fr)]">
        <section className="border-border rounded-lg border p-4">
          <div className="mb-4 flex items-center gap-2 text-sm font-medium">
            <FileText className="text-muted-foreground h-4 w-4" aria-hidden />
            执行步骤
          </div>
          <div className="space-y-3">
            {steps.map((step) => (
              <div key={step.label} className="flex items-start gap-3 rounded-md border px-3 py-2">
                <span className="mt-1 h-2.5 w-2.5 shrink-0 rounded-full bg-emerald-500" />
                <div>
                  <div className="text-foreground text-sm font-medium">{step.label}</div>
                  <div className="text-muted-foreground mt-1 text-xs">{step.detail}</div>
                </div>
              </div>
            ))}
          </div>
        </section>

        <section className="border-border rounded-lg border p-4">
          <div className="mb-4 text-sm font-medium">生成摘要</div>
          <div className="space-y-3 text-sm">
            <div>
              <div className="text-muted-foreground text-xs">标题</div>
              <div className="text-foreground mt-1">{jobDescription.content.title}</div>
            </div>
            <div>
              <div className="text-muted-foreground text-xs">摘要</div>
              <p className="text-foreground mt-1 leading-6">{jobDescription.content.summary}</p>
            </div>
          </div>
        </section>
      </div>
    </div>
  );
}
