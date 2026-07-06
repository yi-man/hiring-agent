import type { JDStatus, JobDescriptionDto } from '@/types';
import type {
  CandidateDecisionAction,
  CandidateDecisionPriority,
  CandidateInterviewStage,
} from '@/lib/candidate-screening/types';
import type { PublishPlatform, PublishTaskStatus } from '@/lib/jd-publishing/types';

export const DASHBOARD_PLATFORM_ALL = 'all';
export const DASHBOARD_PLATFORM_UNTRACKED = 'untracked';

export type DashboardPlatformKey = PublishPlatform | typeof DASHBOARD_PLATFORM_UNTRACKED;

export type DashboardPlatformFilter = typeof DASHBOARD_PLATFORM_ALL | DashboardPlatformKey;

export type DashboardFilters = {
  status?: JDStatus;
  platform?: DashboardPlatformFilter;
  limit: number;
};

export type DashboardCandidateSignal = {
  jobDescriptionId: string;
  decisionAction: CandidateDecisionAction;
  decisionPriority: CandidateDecisionPriority;
  interviewStage: CandidateInterviewStage;
};

export type DashboardCandidateStats = {
  totalCandidates: number;
  activeCandidates: number;
  interviewingCandidates: number;
  highPriorityCandidates: number;
  followUpCandidates: number;
};

export type DashboardPublishTaskSummary = {
  id: string;
  jobDescriptionId: string;
  platform: PublishPlatform;
  status: PublishTaskStatus;
  errorMessage: string | null;
  createdAt: string;
  updatedAt: string;
};

export type DashboardPlatformSummary = {
  platform: DashboardPlatformKey | typeof DASHBOARD_PLATFORM_ALL;
  label: string;
  recruitingJobs: number;
  failedJobs: number;
};

export type DashboardStatusSummary = {
  status: JDStatus;
  label: string;
  count: number;
};

export type DashboardJobDto = {
  id: string;
  department: string;
  position: string;
  title: string;
  status: JDStatus;
  salaryRange: string | null;
  workLocations: string[];
  updatedAt: string;
  platform: DashboardPlatformSummary;
  candidateStats: DashboardCandidateStats;
  latestTask: DashboardPublishTaskSummary | null;
};

export type DashboardOverviewDto = {
  summary: {
    recruitingJobs: number;
    readyToPublishJobs: number;
    publishingJobs: number;
    publishFailedJobs: number;
    activeCandidates: number;
  };
  statusCounts: DashboardStatusSummary[];
  platforms: DashboardPlatformSummary[];
  jobs: DashboardJobDto[];
  recentTasks: DashboardPublishTaskSummary[];
  filters: DashboardFilters;
};

export type DashboardJobSource = Pick<
  JobDescriptionDto,
  | 'id'
  | 'department'
  | 'position'
  | 'status'
  | 'salaryRange'
  | 'workLocations'
  | 'updatedAt'
  | 'content'
>;
