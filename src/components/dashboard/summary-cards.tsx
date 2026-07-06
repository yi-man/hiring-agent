import Link from 'next/link';
import { AlertTriangle, Clock3, Send, Users, Workflow } from 'lucide-react';
import type { LucideIcon } from 'lucide-react';
import type { DashboardOverviewDto } from '@/lib/dashboard/types';

type SummaryCardsProps = {
  overview: DashboardOverviewDto;
};

type MetricCard = {
  label: string;
  value: number;
  href: string;
  detail: string;
  Icon: LucideIcon;
  tone: string;
};

export function SummaryCards({ overview }: SummaryCardsProps) {
  const metrics: MetricCard[] = [
    {
      label: '招聘中',
      value: overview.summary.recruitingJobs,
      href: '/?status=published',
      detail: '已上线岗位',
      Icon: Workflow,
      tone: 'text-emerald-700 bg-emerald-50 border-emerald-200 dark:text-emerald-200 dark:bg-emerald-950/40 dark:border-emerald-900',
    },
    {
      label: '待发布',
      value: overview.summary.readyToPublishJobs,
      href: '/?status=ready_to_publish',
      detail: '可进入发布',
      Icon: Send,
      tone: 'text-sky-700 bg-sky-50 border-sky-200 dark:text-sky-200 dark:bg-sky-950/40 dark:border-sky-900',
    },
    {
      label: '发布中',
      value: overview.summary.publishingJobs,
      href: '/?status=publishing',
      detail: '任务执行中',
      Icon: Clock3,
      tone: 'text-amber-700 bg-amber-50 border-amber-200 dark:text-amber-200 dark:bg-amber-950/40 dark:border-amber-900',
    },
    {
      label: '发布异常',
      value: overview.summary.publishFailedJobs,
      href: '/?status=publish_failed',
      detail: '需要处理',
      Icon: AlertTriangle,
      tone: 'text-rose-700 bg-rose-50 border-rose-200 dark:text-rose-200 dark:bg-rose-950/40 dark:border-rose-900',
    },
    {
      label: '待跟进候选人',
      value: overview.summary.activeCandidates,
      href: '/jd-generator/candidates',
      detail: '跟进中候选人',
      Icon: Users,
      tone: 'text-violet-700 bg-violet-50 border-violet-200 dark:text-violet-200 dark:bg-violet-950/40 dark:border-violet-900',
    },
  ];

  return (
    <section aria-label="工作台指标" className="grid gap-3 sm:grid-cols-2 xl:grid-cols-5">
      {metrics.map(({ Icon, ...metric }) => (
        <Link
          key={metric.label}
          aria-label={`${metric.label} ${metric.value}`}
          className="border-border bg-card text-foreground hover:border-primary/50 focus-visible:ring-ring group rounded-lg border p-3 transition-colors outline-none focus-visible:ring-2"
          href={metric.href}
        >
          <div className="flex items-start justify-between gap-3">
            <div className="min-w-0">
              <div className="text-muted-foreground truncate text-xs">{metric.label}</div>
              <div className="mt-1 font-mono text-2xl leading-none font-semibold tabular-nums">
                {metric.value}
              </div>
            </div>
            <span
              className={`flex h-9 w-9 shrink-0 items-center justify-center rounded-md border ${metric.tone}`}
            >
              <Icon className="h-4 w-4" aria-hidden="true" />
            </span>
          </div>
          <div className="text-muted-foreground group-hover:text-foreground mt-3 truncate text-xs">
            {metric.detail}
          </div>
        </Link>
      ))}
    </section>
  );
}
