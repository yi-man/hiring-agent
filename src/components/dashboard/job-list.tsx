import Link from 'next/link';
import { AlertTriangle, Eye, FileText, Users } from 'lucide-react';
import { Button, Chip } from '@/components/ui';
import {
  DASHBOARD_PLATFORM_ALL,
  type DashboardJobDto,
  type DashboardOverviewDto,
} from '@/lib/dashboard/types';
import type { JDStatus } from '@/types';

type DashboardJobListProps = {
  overview: DashboardOverviewDto;
};

const statusTone: Record<JDStatus, string> = {
  created:
    'border-sky-200 bg-sky-50 text-sky-700 dark:border-sky-900 dark:bg-sky-950/40 dark:text-sky-200',
  ready_to_publish:
    'border-emerald-200 bg-emerald-50 text-emerald-700 dark:border-emerald-900 dark:bg-emerald-950/40 dark:text-emerald-200',
  publishing:
    'border-amber-200 bg-amber-50 text-amber-700 dark:border-amber-900 dark:bg-amber-950/40 dark:text-amber-200',
  published:
    'border-green-200 bg-green-50 text-green-700 dark:border-green-900 dark:bg-green-950/40 dark:text-green-200',
  publish_failed:
    'border-rose-200 bg-rose-50 text-rose-700 dark:border-rose-900 dark:bg-rose-950/40 dark:text-rose-200',
  offline:
    'border-zinc-200 bg-zinc-50 text-zinc-700 dark:border-zinc-800 dark:bg-zinc-900/60 dark:text-zinc-200',
  archived:
    'border-stone-200 bg-stone-50 text-stone-700 dark:border-stone-800 dark:bg-stone-900/60 dark:text-stone-200',
};

function formatUpdatedAt(value: string) {
  const date = new Date(value);
  if (Number.isNaN(date.getTime())) {
    return '更新时间未知';
  }

  return new Intl.DateTimeFormat('zh-CN', {
    dateStyle: 'medium',
    timeStyle: 'short',
  }).format(date);
}

function statusLabel(overview: DashboardOverviewDto, status: JDStatus) {
  return overview.statusCounts.find((item) => item.status === status)?.label ?? status;
}

function platformLabel(overview: DashboardOverviewDto) {
  const currentPlatform = overview.filters.platform ?? DASHBOARD_PLATFORM_ALL;
  return overview.platforms.find((item) => item.platform === currentPlatform)?.label ?? '全部平台';
}

function filterSummary(overview: DashboardOverviewDto) {
  const status = overview.filters.status
    ? statusLabel(overview, overview.filters.status)
    : '全部状态';
  return `${status} · ${platformLabel(overview)} · ${overview.jobs.length} 个岗位`;
}

function StatusChip({ overview, status }: { overview: DashboardOverviewDto; status: JDStatus }) {
  return (
    <Chip className={`border text-xs ${statusTone[status]}`} size="sm" variant="flat">
      <span className="inline-flex items-center gap-1">
        {status === 'publish_failed' ? (
          <AlertTriangle className="h-3.5 w-3.5" aria-hidden="true" />
        ) : null}
        {statusLabel(overview, status)}
      </span>
    </Chip>
  );
}

function CandidateLink({ job }: { job: DashboardJobDto }) {
  return (
    <Link
      className="text-foreground hover:text-primary inline-flex items-center gap-1 text-sm font-medium"
      href={`/jd-generator/${job.id}/candidates`}
    >
      <Users className="text-muted-foreground h-4 w-4" aria-hidden="true" />
      <span className="font-mono tabular-nums">{job.candidateStats.totalCandidates}</span>
      <span className="text-muted-foreground text-xs">候选人</span>
    </Link>
  );
}

function JobRow({ job, overview }: { job: DashboardJobDto; overview: DashboardOverviewDto }) {
  const location = job.workLocations.length > 0 ? job.workLocations.join(' / ') : '地点待定';
  const publishFailureMessage =
    job.status === 'publish_failed'
      ? `发布失败：${job.latestTask?.errorMessage?.trim() || '请查看发布记录'}`
      : null;

  return (
    <article className="grid gap-3 px-4 py-4 xl:grid-cols-[minmax(0,1.35fr)_120px_118px_132px_132px_92px] xl:items-center">
      <div className="min-w-0">
        <Link
          className="text-foreground block truncate text-sm font-medium hover:underline"
          href={`/jd-generator/${job.id}`}
        >
          {job.title}
        </Link>
        <div className="text-muted-foreground mt-1 flex min-w-0 flex-wrap items-center gap-x-3 gap-y-1 text-xs">
          <span className="shrink-0">{job.department}</span>
          <span className="min-w-0 truncate">{job.position}</span>
          {job.salaryRange ? <span className="shrink-0">{job.salaryRange}</span> : null}
        </div>
        <div className="text-muted-foreground mt-1 truncate text-xs">{location}</div>
        {publishFailureMessage ? (
          <div className="mt-2 flex min-w-0 items-start gap-1.5 rounded-md border border-rose-200 bg-rose-50 px-2 py-1 text-xs text-rose-700 dark:border-rose-900 dark:bg-rose-950/40 dark:text-rose-200">
            <AlertTriangle className="mt-0.5 h-3.5 w-3.5 shrink-0" aria-hidden="true" />
            <span className="min-w-0 break-words">{publishFailureMessage}</span>
          </div>
        ) : null}
      </div>

      <StatusChip overview={overview} status={job.status} />

      <div className="min-w-0">
        <div className="text-muted-foreground text-xs">平台</div>
        <div className="text-foreground truncate text-sm">{job.platform.label}</div>
      </div>

      <div className="min-w-0">
        <div className="text-muted-foreground text-xs">候选人</div>
        <CandidateLink job={job} />
        {job.candidateStats.followUpCandidates > 0 ? (
          <div className="text-muted-foreground mt-1 text-xs">
            {job.candidateStats.followUpCandidates} 个待跟进
          </div>
        ) : null}
      </div>

      <div className="text-muted-foreground text-xs">{formatUpdatedAt(job.updatedAt)}</div>

      <Button
        as={Link}
        className="gap-2 justify-self-start xl:justify-self-end"
        disableRipple
        href={`/jd-generator/${job.id}`}
        size="sm"
        variant="light"
      >
        <Eye className="h-4 w-4" aria-hidden="true" />
        查看
      </Button>
    </article>
  );
}

export function DashboardJobList({ overview }: DashboardJobListProps) {
  return (
    <section className="border-border overflow-hidden rounded-lg border" aria-label="岗位列表">
      <div className="border-border flex flex-col gap-1 border-b px-4 py-3 sm:flex-row sm:items-center sm:justify-between">
        <div className="flex items-center gap-2 text-sm font-medium">
          <FileText className="text-muted-foreground h-4 w-4" aria-hidden="true" />
          岗位列表
        </div>
        <div className="text-muted-foreground text-xs">{filterSummary(overview)}</div>
      </div>

      {overview.jobs.length === 0 ? (
        <div className="px-4 py-12 text-center">
          <div className="border-border mx-auto flex h-10 w-10 items-center justify-center rounded-md border">
            <FileText className="text-muted-foreground h-5 w-5" aria-hidden="true" />
          </div>
          <div className="text-foreground mt-3 text-sm font-medium">当前筛选下暂无岗位</div>
          <p className="text-muted-foreground mt-1 text-sm">新建 JD 后即可进入发布和候选人链路。</p>
          <Button
            as={Link}
            className="mt-4"
            color="primary"
            disableRipple
            href="/jd-generator/new"
            size="sm"
          >
            新建 JD
          </Button>
        </div>
      ) : (
        <div className="divide-border divide-y">
          {overview.jobs.map((job) => (
            <JobRow key={job.id} job={job} overview={overview} />
          ))}
        </div>
      )}
    </section>
  );
}
