import Link from 'next/link';
import { AlertTriangle, Clock3, History, Send } from 'lucide-react';
import type { LucideIcon } from 'lucide-react';
import { Chip } from '@/components/ui';
import type {
  DashboardJobDto,
  DashboardOverviewDto,
  DashboardPublishTaskSummary,
} from '@/lib/dashboard/types';
import type { PublishTaskStatus } from '@/lib/jd-publishing/types';
import type { JDStatus } from '@/types';

type ActionQueueProps = {
  overview: DashboardOverviewDto;
};

type QueueCard = {
  label: string;
  count: number;
  href: string;
  detail: string;
  Icon: LucideIcon;
  status: JDStatus;
  tone: string;
};

const taskStatusMeta: Record<PublishTaskStatus, { label: string; className: string }> = {
  running: {
    label: '运行中',
    className:
      'border-amber-200 bg-amber-50 text-amber-700 dark:border-amber-900 dark:bg-amber-950/40 dark:text-amber-200',
  },
  success: {
    label: '成功',
    className:
      'border-green-200 bg-green-50 text-green-700 dark:border-green-900 dark:bg-green-950/40 dark:text-green-200',
  },
  failed: {
    label: '失败',
    className:
      'border-rose-200 bg-rose-50 text-rose-700 dark:border-rose-900 dark:bg-rose-950/40 dark:text-rose-200',
  },
};

function formatTaskTime(value: string) {
  const date = new Date(value);
  if (Number.isNaN(date.getTime())) {
    return '时间未知';
  }

  return new Intl.DateTimeFormat('zh-CN', {
    month: '2-digit',
    day: '2-digit',
    hour: '2-digit',
    minute: '2-digit',
  }).format(date);
}

function taskJobTitle(jobs: DashboardJobDto[], task: DashboardPublishTaskSummary) {
  return jobs.find((job) => job.id === task.jobDescriptionId)?.title ?? task.jobDescriptionId;
}

function TaskStatusChip({ status }: { status: PublishTaskStatus }) {
  const meta = taskStatusMeta[status];
  return (
    <Chip className={`border text-xs ${meta.className}`} size="sm" variant="flat">
      {meta.label}
    </Chip>
  );
}

export function ActionQueue({ overview }: ActionQueueProps) {
  const queueCards: QueueCard[] = [
    {
      label: '发布失败',
      count: overview.summary.publishFailedJobs,
      href: '/?status=publish_failed',
      detail: '查看异常岗位',
      Icon: AlertTriangle,
      status: 'publish_failed',
      tone: 'text-rose-700 bg-rose-50 border-rose-200 dark:text-rose-200 dark:bg-rose-950/40 dark:border-rose-900',
    },
    {
      label: '待发布',
      count: overview.summary.readyToPublishJobs,
      href: '/?status=ready_to_publish',
      detail: '进入发布准备',
      Icon: Send,
      status: 'ready_to_publish',
      tone: 'text-sky-700 bg-sky-50 border-sky-200 dark:text-sky-200 dark:bg-sky-950/40 dark:border-sky-900',
    },
    {
      label: '发布中任务',
      count: overview.summary.publishingJobs,
      href: '/?status=publishing',
      detail: '跟踪执行状态',
      Icon: Clock3,
      status: 'publishing',
      tone: 'text-amber-700 bg-amber-50 border-amber-200 dark:text-amber-200 dark:bg-amber-950/40 dark:border-amber-900',
    },
  ];

  return (
    <aside className="space-y-4" aria-label="待处理队列">
      <section className="border-border rounded-lg border p-4">
        <div className="mb-3 flex items-center gap-2 text-sm font-medium">
          <Send className="text-muted-foreground h-4 w-4" aria-hidden="true" />
          待处理
        </div>
        <div className="grid gap-2">
          {queueCards.map(({ Icon, ...item }) => (
            <Link
              key={item.status}
              className="border-border hover:border-primary/50 focus-visible:ring-ring flex items-center justify-between gap-3 rounded-lg border p-3 transition-colors outline-none focus-visible:ring-2"
              href={item.href}
            >
              <div className="flex min-w-0 items-center gap-3">
                <span
                  className={`flex h-8 w-8 shrink-0 items-center justify-center rounded-md border ${item.tone}`}
                >
                  <Icon className="h-4 w-4" aria-hidden="true" />
                </span>
                <div className="min-w-0">
                  <div className="text-foreground truncate text-sm font-medium">{item.label}</div>
                  <div className="text-muted-foreground truncate text-xs">{item.detail}</div>
                </div>
              </div>
              <span className="font-mono text-lg font-semibold tabular-nums">{item.count}</span>
            </Link>
          ))}
        </div>
      </section>

      <section className="border-border overflow-hidden rounded-lg border">
        <div className="border-border flex items-center justify-between border-b px-4 py-3">
          <div className="flex items-center gap-2 text-sm font-medium">
            <History className="text-muted-foreground h-4 w-4" aria-hidden="true" />
            最近发布任务
          </div>
          <div className="text-muted-foreground text-xs">{overview.recentTasks.length} 条</div>
        </div>
        {overview.recentTasks.length === 0 ? (
          <div className="text-muted-foreground px-4 py-8 text-center text-sm">暂无发布任务。</div>
        ) : (
          <div className="divide-border divide-y">
            {overview.recentTasks.map((task) => (
              <Link
                key={task.id}
                className="hover:bg-muted/40 block px-4 py-3 transition-colors"
                href={`/jd-generator/${task.jobDescriptionId}`}
              >
                <div className="flex items-start justify-between gap-3">
                  <div className="min-w-0">
                    <div className="text-foreground truncate text-sm font-medium">
                      {taskJobTitle(overview.jobs, task)}
                    </div>
                    <div className="text-muted-foreground mt-1 truncate text-xs">
                      {task.platform} · {formatTaskTime(task.updatedAt)}
                    </div>
                  </div>
                  <TaskStatusChip status={task.status} />
                </div>
                {task.errorMessage ? (
                  <div className="mt-2 truncate text-xs text-rose-600 dark:text-rose-300">
                    {task.errorMessage}
                  </div>
                ) : null}
              </Link>
            ))}
          </div>
        )}
      </section>
    </aside>
  );
}
