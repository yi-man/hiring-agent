import { prisma } from '@/lib/prisma';
import { JD_STATUSES, type JDStatus } from '@/types';
import type {
  DashboardCandidateSignal,
  DashboardCandidateStats,
  DashboardFilters,
  DashboardJobSource,
  DashboardOverviewDto,
  DashboardPlatformFilter,
  DashboardPlatformSummary,
  DashboardPublishTaskSummary,
} from './types';
import { DASHBOARD_PLATFORM_ALL, DASHBOARD_PLATFORM_UNTRACKED } from './types';

const MAX_LIMIT = 100;
const DEFAULT_LIMIT = 25;

const statusLabels: Record<JDStatus, string> = {
  created: '已创建',
  ready_to_publish: '待发布',
  publishing: '发布中',
  published: '招聘中',
  publish_failed: '发布异常',
  offline: '已下线',
  archived: '已归档',
};

const platformLabels: Record<string, string> = {
  [DASHBOARD_PLATFORM_ALL]: '全部平台',
  'boss-like': 'BOSS-like',
  [DASHBOARD_PLATFORM_UNTRACKED]: '未记录平台',
};

function parseLimit(value: string | null): number {
  if (!value) return DEFAULT_LIMIT;
  const parsed = Number(value);
  if (!Number.isFinite(parsed)) return DEFAULT_LIMIT;
  return Math.max(1, Math.min(MAX_LIMIT, Math.trunc(parsed)));
}

export function labelForStatus(status: JDStatus): string {
  return statusLabels[status] ?? status;
}

export function labelForPlatform(platform: DashboardPlatformFilter): string {
  return platformLabels[platform] ?? platform;
}

export function parseDashboardFilters(searchParams: URLSearchParams): DashboardFilters {
  const statusParam = searchParams.get('status');
  if (statusParam && !JD_STATUSES.includes(statusParam as JDStatus)) {
    throw new Error('status is invalid');
  }

  const platformParam = searchParams.get('platform') as DashboardPlatformFilter | null;
  const platform = platformParam || undefined;

  return {
    status: statusParam ? (statusParam as JDStatus) : undefined,
    platform,
    limit: parseLimit(searchParams.get('limit')),
  };
}

export function isActiveDashboardCandidate(signal: DashboardCandidateSignal): boolean {
  return (
    signal.decisionAction !== 'skip' &&
    signal.interviewStage !== 'rejected' &&
    signal.interviewStage !== 'withdrawn'
  );
}

export function isInterviewingDashboardCandidate(signal: DashboardCandidateSignal): boolean {
  return (
    signal.interviewStage === 'phone_screen' ||
    signal.interviewStage === 'interviewing' ||
    signal.interviewStage === 'offer'
  );
}

function emptyCandidateStats(): DashboardCandidateStats {
  return {
    totalCandidates: 0,
    activeCandidates: 0,
    interviewingCandidates: 0,
    highPriorityCandidates: 0,
    followUpCandidates: 0,
  };
}

function dashboardTaskCreatedAtMs(task: DashboardPublishTaskSummary): number {
  const createdAtMs = Date.parse(task.createdAt);
  return Number.isFinite(createdAtMs) ? createdAtMs : 0;
}

export function findLatestDashboardTask(
  tasks: DashboardPublishTaskSummary[],
  status: DashboardPublishTaskSummary['status'],
): DashboardPublishTaskSummary | undefined {
  let latestTask: DashboardPublishTaskSummary | undefined;

  for (const task of tasks) {
    if (task.status !== status) continue;
    if (!latestTask || dashboardTaskCreatedAtMs(task) > dashboardTaskCreatedAtMs(latestTask)) {
      latestTask = task;
    }
  }

  return latestTask;
}

export function aggregateCandidateStats(
  signals: DashboardCandidateSignal[],
): Map<string, DashboardCandidateStats> {
  const statsByJob = new Map<string, DashboardCandidateStats>();

  for (const signal of signals) {
    const current = statsByJob.get(signal.jobDescriptionId) ?? emptyCandidateStats();
    const isActive = isActiveDashboardCandidate(signal);
    statsByJob.set(signal.jobDescriptionId, {
      totalCandidates: current.totalCandidates + 1,
      activeCandidates: current.activeCandidates + (isActive ? 1 : 0),
      interviewingCandidates:
        current.interviewingCandidates + (isInterviewingDashboardCandidate(signal) ? 1 : 0),
      highPriorityCandidates:
        current.highPriorityCandidates + (signal.decisionPriority === 'high' ? 1 : 0),
      followUpCandidates:
        current.followUpCandidates +
        (isActive && (signal.decisionAction === 'chat' || signal.decisionAction === 'collect')
          ? 1
          : 0),
    });
  }

  return statsByJob;
}

export function inferDashboardPlatform(
  jobStatus: JDStatus,
  tasks: DashboardPublishTaskSummary[],
): DashboardPlatformSummary {
  const successfulTask = findLatestDashboardTask(tasks, 'success');
  if (successfulTask) {
    return {
      platform: successfulTask.platform,
      label: labelForPlatform(successfulTask.platform),
      recruitingJobs: jobStatus === 'published' ? 1 : 0,
      failedJobs: tasks.some((task) => task.status === 'failed') ? 1 : 0,
    };
  }

  const failedTask = findLatestDashboardTask(tasks, 'failed');
  if (failedTask) {
    return {
      platform: failedTask.platform,
      label: labelForPlatform(failedTask.platform),
      recruitingJobs: 0,
      failedJobs: 1,
    };
  }

  return {
    platform: DASHBOARD_PLATFORM_UNTRACKED,
    label: labelForPlatform(DASHBOARD_PLATFORM_UNTRACKED),
    recruitingJobs: jobStatus === 'published' ? 1 : 0,
    failedJobs: 0,
  };
}

export function readDashboardJobTitle(job: DashboardJobSource): string {
  return job.content.title?.trim() || job.position;
}

export async function getDashboardOverview(params: {
  userId: string;
  filters: DashboardFilters;
}): Promise<DashboardOverviewDto> {
  await prisma.$connect().catch(() => undefined);
  return {
    summary: {
      recruitingJobs: 0,
      readyToPublishJobs: 0,
      publishingJobs: 0,
      publishFailedJobs: 0,
      activeCandidates: 0,
    },
    statusCounts: [],
    platforms: [],
    jobs: [],
    recentTasks: [],
    filters: params.filters,
  };
}
