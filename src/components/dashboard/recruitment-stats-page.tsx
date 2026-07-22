'use client';

import { useEffect, useMemo, useState } from 'react';
import Link from 'next/link';
import {
  ChartColumn,
  CheckCircle2,
  Eye,
  FileText,
  ListFilter,
  RefreshCw,
  Users,
} from 'lucide-react';
import { Button } from '@/components/ui';
import { fetchCandidateTrackingOverview } from '@/lib/candidate-screening/client';
import {
  getRecruitmentType,
  recruitmentProgressLabel,
  recruitmentTypeOptions,
  type RecruitmentType,
} from '@/lib/candidate-screening/recruitment-progress';
import type { CandidateTrackingOverviewDto } from '@/lib/candidate-screening/repo';
import { withReturnTarget } from '@/lib/navigation/return-url';

const statsReturnTarget = {
  href: '/recruitment-stats',
  label: '返回招聘统计',
};

function formatDateTime(value: string | null): string {
  if (!value) return '暂无时间';
  const date = new Date(value);
  if (Number.isNaN(date.getTime())) return '暂无时间';
  return new Intl.DateTimeFormat('zh-CN', {
    dateStyle: 'medium',
    timeStyle: 'short',
  }).format(date);
}

export function RecruitmentStatsPage() {
  const [overview, setOverview] = useState<CandidateTrackingOverviewDto>({
    jobs: [],
    candidates: [],
  });
  const [recruitmentType, setRecruitmentType] = useState<RecruitmentType>('recruiting');
  const [isLoading, setIsLoading] = useState(true);
  const [error, setError] = useState('');

  async function loadOverview() {
    setIsLoading(true);
    setError('');
    try {
      setOverview(await fetchCandidateTrackingOverview(300));
    } catch (e) {
      setError(e instanceof Error ? e.message : '加载招聘统计失败');
    } finally {
      setIsLoading(false);
    }
  }

  useEffect(() => {
    void loadOverview();
  }, []);

  const filteredJobs = useMemo(
    () =>
      overview.jobs.filter(
        (job) =>
          recruitmentType === 'all' || getRecruitmentType(job.jobDescription) === recruitmentType,
      ),
    [overview.jobs, recruitmentType],
  );

  const summary = useMemo(() => {
    let recruitingJobs = 0;
    let filledJobs = 0;
    let onboardedCount = 0;
    let hiringGap = 0;
    let unsetTargetJobs = 0;
    let activeCandidates = 0;

    for (const job of overview.jobs) {
      const type = getRecruitmentType(job.jobDescription);
      onboardedCount += job.jobDescription.onboardedCount;
      if (type === 'recruiting') {
        recruitingJobs += 1;
        activeCandidates += job.activeCandidates;
        if (job.hiringGap === null) {
          unsetTargetJobs += 1;
        } else {
          hiringGap += job.hiringGap;
        }
      } else if (type === 'filled') {
        filledJobs += 1;
      }
    }

    return {
      activeCandidates,
      filledJobs,
      hiringGap,
      onboardedCount,
      recruitingJobs,
      unsetTargetJobs,
    };
  }, [overview.jobs]);

  return (
    <main className="bg-background text-foreground min-h-screen">
      <div className="container mx-auto space-y-4 px-4 py-6">
        <header className="border-border flex flex-col gap-3 border-b pb-4 lg:flex-row lg:items-end lg:justify-between">
          <div className="min-w-0">
            <div className="mb-2 flex items-center gap-2">
              <ChartColumn className="text-muted-foreground h-5 w-5" aria-hidden />
              <h1 className="text-foreground text-2xl font-semibold tracking-normal">招聘统计</h1>
            </div>
            <p className="text-muted-foreground text-sm">
              汇总招聘目标、实际入职与岗位缺口，识别仍需补充人选的岗位。
            </p>
          </div>
          <Button
            className="gap-2 self-start lg:self-auto"
            isDisabled={isLoading}
            type="button"
            variant="bordered"
            onClick={() => void loadOverview()}
          >
            <RefreshCw className="h-4 w-4" aria-hidden />
            刷新
          </Button>
        </header>

        {error ? (
          <div className="border-destructive/30 bg-destructive/10 text-destructive rounded-md border px-4 py-3 text-sm">
            {error}
          </div>
        ) : null}

        <section aria-label="招聘进度概览" className="grid gap-3 sm:grid-cols-2 xl:grid-cols-4">
          <div className="border-border bg-card rounded-lg border p-4">
            <div className="text-muted-foreground flex items-center gap-2 text-xs">
              <FileText className="h-4 w-4" aria-hidden />
              招聘缺口
            </div>
            <div className="text-foreground mt-3 text-2xl font-semibold tabular-nums">
              {summary.recruitingJobs} 个未招满岗位
            </div>
            <div className="mt-1 text-sm font-medium text-amber-700 dark:text-amber-300">
              还缺 {summary.hiringGap} 人
            </div>
            {summary.unsetTargetJobs > 0 ? (
              <div className="text-muted-foreground mt-1 text-xs">
                {summary.unsetTargetJobs} 个岗位未设置招聘目标
              </div>
            ) : null}
          </div>
          <Link
            aria-label={`查看已入职人员，共 ${summary.onboardedCount} 人`}
            className="border-border bg-card hover:border-primary/40 hover:bg-primary/5 rounded-lg border p-4 text-left transition-colors"
            href="/candidates?scope=onboarded&recruitmentType=all"
          >
            <div className="text-muted-foreground flex items-center gap-2 text-xs">
              <Users className="h-4 w-4" aria-hidden />
              已入职人员
            </div>
            <div className="text-foreground mt-3 text-2xl font-semibold tabular-nums">
              {summary.onboardedCount} 人
            </div>
            <div className="text-primary mt-1 text-sm font-medium">查看人员名单</div>
          </Link>
          <div className="border-border bg-card rounded-lg border p-4">
            <div className="text-muted-foreground flex items-center gap-2 text-xs">
              <CheckCircle2 className="h-4 w-4" aria-hidden />
              已招满岗位
            </div>
            <div className="text-foreground mt-3 text-2xl font-semibold tabular-nums">
              {summary.filledJobs} 个
            </div>
            <div className="text-muted-foreground mt-1 text-sm">已完成招聘目标</div>
          </div>
          <div className="border-border bg-card rounded-lg border p-4">
            <div className="text-muted-foreground flex items-center gap-2 text-xs">
              <ListFilter className="h-4 w-4" aria-hidden />
              正在推进
            </div>
            <div className="text-foreground mt-3 text-2xl font-semibold tabular-nums">
              {summary.activeCandidates} 人
            </div>
            <div className="text-muted-foreground mt-1 text-sm">当前招聘漏斗中的候选人</div>
          </div>
        </section>

        <section className="border-border rounded-lg border p-4">
          <label className="block max-w-sm space-y-2">
            <span className="text-muted-foreground text-xs">招聘类型</span>
            <select
              aria-label="统计招聘类型"
              className="border-input bg-background text-foreground h-10 w-full rounded-md border px-3 text-sm"
              value={recruitmentType}
              onChange={(event) => setRecruitmentType(event.target.value as RecruitmentType)}
            >
              {recruitmentTypeOptions.map((option) => (
                <option key={option.value} value={option.value}>
                  {option.label}
                </option>
              ))}
            </select>
          </label>
        </section>

        <section className="border-border overflow-hidden rounded-lg border">
          <div className="border-border flex items-center justify-between border-b px-4 py-3">
            <div className="text-sm font-medium">招聘缺口与入职进度</div>
            <div className="text-muted-foreground text-xs">
              {isLoading ? '加载中' : `${filteredJobs.length} 个岗位`}
            </div>
          </div>
          {isLoading ? (
            <div className="text-muted-foreground px-4 py-10 text-center text-sm">
              正在加载招聘统计…
            </div>
          ) : filteredJobs.length === 0 ? (
            <div className="text-muted-foreground px-4 py-10 text-center text-sm">
              当前招聘类型下暂无岗位。
            </div>
          ) : (
            <div className="divide-border divide-y">
              {filteredJobs.map((item) => (
                <article
                  key={item.jobDescription.id}
                  className="grid gap-3 px-4 py-4 lg:grid-cols-[minmax(0,1fr)_100px_100px_110px_110px_150px] lg:items-center"
                >
                  <div className="min-w-0">
                    <Link
                      className="text-foreground block truncate text-sm font-medium hover:underline"
                      href={withReturnTarget(
                        `/jd-generator/${item.jobDescription.id}`,
                        statsReturnTarget,
                      )}
                    >
                      {item.jobDescription.position}
                    </Link>
                    <div className="text-muted-foreground mt-1 truncate text-xs">
                      {item.jobDescription.department} · {item.jobDescription.title}
                    </div>
                    <div className="text-muted-foreground mt-1 text-xs">
                      最新跟踪 {formatDateTime(item.latestCandidateUpdatedAt)}
                    </div>
                  </div>
                  <div className="text-sm">
                    <div className="text-muted-foreground text-xs">招聘目标</div>
                    <div className="mt-1 tabular-nums">
                      {item.jobDescription.hiringTarget === null
                        ? '未设置'
                        : `${item.jobDescription.hiringTarget} 人`}
                    </div>
                  </div>
                  <div className="text-sm">
                    <div className="text-muted-foreground text-xs">已入职</div>
                    <div className="mt-1 tabular-nums">{item.jobDescription.onboardedCount} 人</div>
                  </div>
                  <div className="text-sm">
                    <div className="text-muted-foreground text-xs">当前缺口</div>
                    <div className="mt-1 font-medium">
                      {recruitmentProgressLabel(item.jobDescription, item.hiringGap)}
                    </div>
                  </div>
                  <div className="text-muted-foreground text-xs">
                    <div>{item.activeCandidates} 个跟进中</div>
                    <div className="mt-1">{item.interviewingCandidates} 个面试中</div>
                  </div>
                  <Button
                    as={Link}
                    className="gap-2 justify-self-start lg:justify-self-end"
                    href={withReturnTarget(
                      `/jd-generator/${item.jobDescription.id}/candidates`,
                      statsReturnTarget,
                    )}
                    size="sm"
                    variant="light"
                  >
                    <Eye className="h-4 w-4" aria-hidden />
                    查看候选人
                  </Button>
                </article>
              ))}
            </div>
          )}
        </section>
      </div>
    </main>
  );
}
