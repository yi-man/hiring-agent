import { prisma } from '@/lib/prisma';
import type { PublishPlatform, PublishTaskStatus } from '@/lib/jd-publishing/types';
import { JD_STATUSES, type JD, type JDStatus } from '@/types';
import { RECRUITMENT_PLATFORM_IDS, isRecruitmentPlatform } from '@/lib/recruitment-platforms';
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
import {
  DASHBOARD_PLATFORM_ALL,
  DASHBOARD_PLATFORM_UNTRACKED,
  type DashboardJobDto,
  type DashboardPlatformKey,
  type DashboardStatusSummary,
} from './types';

const MAX_LIMIT = 100;
const DEFAULT_LIMIT = 25;
const RECENT_TASK_LIMIT = 8;

const statusLabels: Record<JDStatus, string> = {
  created: '已创建',
  ready_to_publish: '待发布',
  publishing: '发布中',
  published: '招聘中',
  filled: '已招满',
  publish_failed: '发布异常',
  offline: '已停止招聘（系统内）',
  archived: '已归档',
};

const dashboardPlatformFilters = [
  DASHBOARD_PLATFORM_ALL,
  ...RECRUITMENT_PLATFORM_IDS,
  DASHBOARD_PLATFORM_UNTRACKED,
] as const satisfies readonly DashboardPlatformFilter[];

const platformLabels: Record<DashboardPlatformFilter, string> = {
  [DASHBOARD_PLATFORM_ALL]: '全部平台',
  boss: 'BOSS 直聘',
  liepin: '猎聘',
  zhilian: '智联招聘',
  'boss-like': 'BOSS-like',
  [DASHBOARD_PLATFORM_UNTRACKED]: '未记录平台',
};

type DashboardJobRow = {
  id: string;
  department: string;
  position: string;
  salaryRange: string | null;
  workLocations: unknown | null;
  status: string;
  hiringTarget: number | null;
  content: unknown;
  updatedAt: Date | string;
};

type DashboardTaskRow = {
  id: string;
  jobDescriptionId: string;
  platform: string;
  status: string;
  errorMessage: string | null;
  createdAt: Date | string;
  updatedAt: Date | string;
};

type DashboardCandidateCountRow = {
  jobDescriptionId: string;
  decisionAction: string;
  decisionPriority: string;
  interviewStage: string;
  _count: {
    _all: number;
  };
};

type DashboardStatusCountRow = {
  status: string;
  _count: {
    _all: number;
  };
};

const dashboardJobSelect = {
  id: true,
  department: true,
  position: true,
  salaryRange: true,
  workLocations: true,
  status: true,
  hiringTarget: true,
  content: true,
  updatedAt: true,
} as const;

const dashboardTaskSelect = {
  id: true,
  jobDescriptionId: true,
  platform: true,
  status: true,
  errorMessage: true,
  createdAt: true,
  updatedAt: true,
} as const;

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
  return platformLabels[platform];
}

function isDashboardPlatformFilter(value: string): value is DashboardPlatformFilter {
  return dashboardPlatformFilters.includes(value as DashboardPlatformFilter);
}

function isPublishPlatform(value: string): value is PublishPlatform {
  return isRecruitmentPlatform(value);
}

function toPublishPlatform(value: string): PublishPlatform {
  if (!isPublishPlatform(value)) {
    throw new Error(`Unsupported publish platform: ${value}`);
  }

  return value;
}

function iso(value: Date | string): string {
  if (value instanceof Date) {
    return value.toISOString();
  }

  const parsed = new Date(value);
  return Number.isNaN(parsed.getTime()) ? value : parsed.toISOString();
}

function toRecord(value: unknown): Record<string, unknown> {
  return value && typeof value === 'object' && !Array.isArray(value)
    ? (value as Record<string, unknown>)
    : {};
}

function toStringArray(value: unknown): string[] {
  if (!Array.isArray(value)) {
    return [];
  }

  return value.filter((item): item is string => typeof item === 'string' && item.trim().length > 0);
}

function readString(value: unknown, fallback: string): string {
  return typeof value === 'string' ? value : fallback;
}

function mapJobContent(value: unknown, fallbackTitle: string): JD {
  const content = toRecord(value);
  return {
    title: readString(content.title, fallbackTitle),
    summary: readString(content.summary, ''),
    responsibilities: toStringArray(content.responsibilities),
    requirements: toStringArray(content.requirements),
    bonus: toStringArray(content.bonus),
    highlights: toStringArray(content.highlights),
  };
}

function mapJobSource(row: DashboardJobRow): DashboardJobSource {
  return {
    id: row.id,
    department: row.department,
    position: row.position,
    status: row.status as JDStatus,
    hiringTarget: row.hiringTarget,
    salaryRange: row.salaryRange,
    workLocations: toStringArray(row.workLocations),
    updatedAt: iso(row.updatedAt),
    content: mapJobContent(row.content, row.position),
  };
}

function mapTask(row: DashboardTaskRow): DashboardPublishTaskSummary {
  return {
    id: row.id,
    jobDescriptionId: row.jobDescriptionId,
    platform: toPublishPlatform(row.platform),
    status: row.status as PublishTaskStatus,
    errorMessage: row.errorMessage,
    createdAt: iso(row.createdAt),
    updatedAt: iso(row.updatedAt),
  };
}

export function parseDashboardFilters(searchParams: URLSearchParams): DashboardFilters {
  const statusParam = searchParams.get('status');
  if (statusParam && !JD_STATUSES.includes(statusParam as JDStatus)) {
    throw new Error('status is invalid');
  }

  const platformParam = searchParams.get('platform');
  let platform: DashboardPlatformFilter | undefined;
  if (platformParam) {
    if (!isDashboardPlatformFilter(platformParam)) {
      throw new Error('platform is invalid');
    }
    platform = platformParam;
  }

  return {
    status: statusParam ? (statusParam as JDStatus) : undefined,
    platform,
    limit: parseLimit(searchParams.get('limit')),
  };
}

export function isActiveDashboardCandidate(signal: DashboardCandidateSignal): boolean {
  return (
    signal.interviewStage !== 'rejected' &&
    signal.interviewStage !== 'withdrawn' &&
    signal.interviewStage !== 'onboarded' &&
    signal.interviewStage !== 'not_joined' &&
    (signal.decisionAction !== 'skip' || isInterviewingDashboardCandidate(signal))
  );
}

export function isInterviewingDashboardCandidate(signal: DashboardCandidateSignal): boolean {
  return (
    signal.interviewStage === 'phone_screen' ||
    signal.interviewStage === 'interviewing' ||
    signal.interviewStage === 'interview_completed' ||
    signal.interviewStage === 'offer'
  );
}

function emptyStats(): DashboardCandidateStats {
  return {
    totalCandidates: 0,
    activeCandidates: 0,
    interviewingCandidates: 0,
    highPriorityCandidates: 0,
    followUpCandidates: 0,
    onboardedCount: 0,
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
    const current = statsByJob.get(signal.jobDescriptionId) ?? emptyStats();
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
      onboardedCount: current.onboardedCount + (signal.interviewStage === 'onboarded' ? 1 : 0),
    });
  }

  return statsByJob;
}

function aggregateCandidateCountStats(
  rows: DashboardCandidateCountRow[],
): Map<string, DashboardCandidateStats> {
  const statsByJob = new Map<string, DashboardCandidateStats>();

  for (const row of rows) {
    const signal: DashboardCandidateSignal = {
      jobDescriptionId: row.jobDescriptionId,
      decisionAction: row.decisionAction as DashboardCandidateSignal['decisionAction'],
      decisionPriority: row.decisionPriority as DashboardCandidateSignal['decisionPriority'],
      interviewStage: row.interviewStage as DashboardCandidateSignal['interviewStage'],
    };
    const count = row._count._all;
    const current = statsByJob.get(signal.jobDescriptionId) ?? emptyStats();
    const isActive = isActiveDashboardCandidate(signal);

    statsByJob.set(signal.jobDescriptionId, {
      totalCandidates: current.totalCandidates + count,
      activeCandidates: current.activeCandidates + (isActive ? count : 0),
      interviewingCandidates:
        current.interviewingCandidates + (isInterviewingDashboardCandidate(signal) ? count : 0),
      highPriorityCandidates:
        current.highPriorityCandidates + (signal.decisionPriority === 'high' ? count : 0),
      followUpCandidates:
        current.followUpCandidates +
        (isActive && (signal.decisionAction === 'chat' || signal.decisionAction === 'collect')
          ? count
          : 0),
      onboardedCount: current.onboardedCount + (signal.interviewStage === 'onboarded' ? count : 0),
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

function countForStatus(rows: DashboardStatusCountRow[], status: JDStatus): number {
  return rows.find((row) => row.status === status)?._count._all ?? 0;
}

function groupTasksByJob(
  tasks: DashboardPublishTaskSummary[],
): Map<string, DashboardPublishTaskSummary[]> {
  const tasksByJob = new Map<string, DashboardPublishTaskSummary[]>();

  for (const task of tasks) {
    const current = tasksByJob.get(task.jobDescriptionId) ?? [];
    current.push(task);
    tasksByJob.set(task.jobDescriptionId, current);
  }

  return tasksByJob;
}

function applyPlatformFilter(
  jobs: DashboardJobDto[],
  platform: DashboardPlatformFilter | undefined,
): DashboardJobDto[] {
  if (!platform || platform === DASHBOARD_PLATFORM_ALL) {
    return jobs;
  }

  return jobs.filter((job) => job.platform.platform === platform);
}

function aggregatePlatformSummaries(jobs: DashboardJobDto[]): DashboardPlatformSummary[] {
  const byPlatform = new Map<
    DashboardPlatformKey,
    Pick<DashboardPlatformSummary, 'recruitingJobs' | 'failedJobs'>
  >();
  let recruitingJobs = 0;
  let failedJobs = 0;

  for (const job of jobs) {
    if (job.platform.platform === DASHBOARD_PLATFORM_ALL) {
      continue;
    }

    recruitingJobs += job.platform.recruitingJobs;
    failedJobs += job.platform.failedJobs;

    const current = byPlatform.get(job.platform.platform) ?? {
      recruitingJobs: 0,
      failedJobs: 0,
    };
    byPlatform.set(job.platform.platform, {
      recruitingJobs: current.recruitingJobs + job.platform.recruitingJobs,
      failedJobs: current.failedJobs + job.platform.failedJobs,
    });
  }

  return dashboardPlatformFilters.map((platform) => {
    if (platform === DASHBOARD_PLATFORM_ALL) {
      return {
        platform,
        label: labelForPlatform(platform),
        recruitingJobs,
        failedJobs,
      };
    }

    const stats = byPlatform.get(platform) ?? { recruitingJobs: 0, failedJobs: 0 };
    return {
      platform,
      label: labelForPlatform(platform),
      recruitingJobs: stats.recruitingJobs,
      failedJobs: stats.failedJobs,
    };
  });
}

function buildStatusCounts(rows: DashboardStatusCountRow[]): DashboardStatusSummary[] {
  return JD_STATUSES.map((status) => ({
    status,
    label: labelForStatus(status),
    count: countForStatus(rows, status),
  }));
}

export async function getDashboardOverview(params: {
  userId: string;
  filters: DashboardFilters;
}): Promise<DashboardOverviewDto> {
  const jobWhere = {
    userId: params.userId,
    ...(params.filters.status ? { status: params.filters.status } : {}),
  };

  const [statusRows, jobRows] = await Promise.all([
    prisma.jobDescription.groupBy({
      by: ['status'],
      where: { userId: params.userId },
      _count: { _all: true },
    }),
    prisma.jobDescription.findMany({
      where: jobWhere,
      orderBy: { updatedAt: 'desc' },
      select: dashboardJobSelect,
    }),
  ]);

  const jobs = jobRows as DashboardJobRow[];
  const jobIds = jobs.map((job) => job.id);
  const [taskRows, candidateRows] =
    jobIds.length > 0
      ? await Promise.all([
          prisma.jobPublishTask.findMany({
            where: {
              userId: params.userId,
              jobDescriptionId: { in: jobIds },
              status: { in: ['success', 'failed', 'running'] },
            },
            orderBy: { createdAt: 'desc' },
            select: dashboardTaskSelect,
          }),
          prisma.candidateScreeningResult.groupBy({
            by: ['jobDescriptionId', 'decisionAction', 'decisionPriority', 'interviewStage'],
            where: { userId: params.userId, jobDescriptionId: { in: jobIds } },
            _count: { _all: true },
          }),
        ])
      : [[], []];

  const taskSummaries = (taskRows as DashboardTaskRow[]).map(mapTask);
  const tasksByJob = groupTasksByJob(taskSummaries);
  const statsByJob = aggregateCandidateCountStats(candidateRows as DashboardCandidateCountRow[]);

  const dashboardJobs = jobs.map((job): DashboardJobDto => {
    const source = mapJobSource(job);
    const jobTasks = tasksByJob.get(job.id) ?? [];

    return {
      id: source.id,
      department: source.department,
      position: source.position,
      title: readDashboardJobTitle(source),
      status: source.status,
      hiringTarget: source.hiringTarget,
      salaryRange: source.salaryRange,
      workLocations: source.workLocations,
      updatedAt: source.updatedAt,
      platform: inferDashboardPlatform(source.status, jobTasks),
      candidateStats: statsByJob.get(job.id) ?? emptyStats(),
      latestTask: jobTasks[0] ?? null,
    };
  });
  const filteredJobs = applyPlatformFilter(dashboardJobs, params.filters.platform);
  const returnedJobs = filteredJobs.slice(0, params.filters.limit);
  const filteredJobIds = new Set(filteredJobs.map((job) => job.id));
  const statusCountRows = statusRows as DashboardStatusCountRow[];
  const statusCounts = buildStatusCounts(statusCountRows);

  return {
    summary: {
      recruitingJobs: countForStatus(statusCountRows, 'published'),
      readyToPublishJobs: countForStatus(statusCountRows, 'ready_to_publish'),
      publishingJobs: countForStatus(statusCountRows, 'publishing'),
      publishFailedJobs: countForStatus(statusCountRows, 'publish_failed'),
      activeCandidates: filteredJobs.reduce(
        (total, job) => total + job.candidateStats.activeCandidates,
        0,
      ),
    },
    statusCounts,
    platforms: aggregatePlatformSummaries(dashboardJobs),
    jobs: returnedJobs,
    recentTasks: taskSummaries
      .filter((task) => filteredJobIds.has(task.jobDescriptionId))
      .slice(0, RECENT_TASK_LIMIT),
    filters: params.filters,
  };
}
