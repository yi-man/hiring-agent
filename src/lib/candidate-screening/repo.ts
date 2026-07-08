import { randomUUID } from 'node:crypto';
import { Prisma } from '@prisma/client';
import { prisma } from '@/lib/prisma';
import { vectorToPgLiteral } from '@/lib/rag/knowledge-repo';
import type { JDStatus } from '@/types';
import type {
  CandidateActionPlan,
  CandidateActionStatus,
  CandidateDecisionAction,
  CandidateDecisionPriority,
  CandidateInterviewFeedbackDecision,
  CandidateInterviewFeedbackStage,
  CandidateInterviewStage,
  CandidateScreeningMode,
  CandidateScreeningRunEventLevel,
  CandidateScreeningPlatform,
  CandidateScreeningRunStage,
  CandidateScreeningRunStatus,
  CandidateScreeningSource,
  CandidateTags,
  EvaluationSchema,
  ScoreDetail,
  ScreeningRunStats,
  SearchPlan,
} from './types';
export type { CandidateDecisionResultDto } from './hiring-decision';

export { vectorToPgLiteral } from '@/lib/rag/knowledge-repo';

type NullableDate = Date | null;

type CandidateScreeningRunRecord = {
  id: string;
  userId: string;
  jobDescriptionId: string;
  platform: string;
  mode: string;
  status: string;
  currentStage: string | null;
  searchPlan: unknown | null;
  evaluationSchema: unknown | null;
  stats: unknown | null;
  errorMessage: string | null;
  startedAt: NullableDate;
  finishedAt: NullableDate;
  createdAt: Date;
  updatedAt: Date;
};

type CandidateScreeningRunEventRecord = {
  id: string;
  userId: string;
  runId: string;
  jobDescriptionId: string;
  candidateId: string | null;
  stage: string;
  level: string;
  message: string;
  detail: unknown | null;
  createdAt: Date;
};

type CandidateRecord = {
  id: string;
  userId: string;
  displayName: string;
  currentTitle: string | null;
  currentCompany: string | null;
  location: string | null;
  experienceYears: number | null;
  sourcePlatform: string;
  platformCandidateId: string | null;
  profileUrl: string | null;
  identityKey: string;
  identityHash: string;
  lastActiveAt: NullableDate;
  contacted: boolean;
  replied: boolean;
  lastContactAt: NullableDate;
  createdAt: Date;
  updatedAt: Date;
};

type CandidateResumeRecord = {
  id: string;
  userId: string;
  candidateId: string;
  sourcePlatform: string;
  profileUrl: string | null;
  rawText: string;
  structuredSummary: unknown | null;
  resumeHash: string;
  fetchedAt: Date;
  createdAt: Date;
};

type CandidateScreeningResultRecord = {
  id: string;
  userId: string;
  runId: string;
  jobDescriptionId: string;
  candidateId: string;
  resumeId: string | null;
  source: string;
  tags: unknown;
  scoreDetail: unknown;
  finalScore: number;
  rank: number;
  decisionAction: string;
  decisionPriority: string;
  decisionReason: string;
  actionPlan: unknown | null;
  actionStatus: string;
  interviewStage: string;
  notes: string | null;
  createdAt: Date;
  updatedAt: Date;
};

type CandidateActionLogRecord = {
  id: string;
  userId: string;
  runId: string;
  screeningResultId: string;
  candidateId: string;
  jobDescriptionId: string;
  platform: string;
  mode: string;
  action: string;
  message: string | null;
  status: string;
  idempotencyKey: string;
  browserTrace: unknown | null;
  errorMessage: string | null;
  createdAt: Date;
  updatedAt: Date;
};

type CandidateInterviewFeedbackRecord = {
  id: string;
  userId: string;
  jobDescriptionId: string;
  candidateId: string;
  stage: string;
  interviewer: string;
  rating: number;
  pros: unknown;
  cons: unknown;
  decision: string;
  notes: string | null;
  createdAt: Date;
  updatedAt: Date;
};

type TrackingJobDescriptionRecord = {
  id: string;
  userId: string;
  department: string;
  position: string;
  status: string;
  content: unknown;
  updatedAt: Date;
};

type CandidateWithRelationsRecord = CandidateScreeningResultRecord & {
  candidate: CandidateRecord;
  resume: CandidateResumeRecord | null;
  actionLogs?: CandidateActionLogRecord[];
};

type CandidateTrackingRecord = CandidateWithRelationsRecord & {
  jobDescription: TrackingJobDescriptionRecord;
};

type CandidateResumeLibraryRecord = CandidateResumeRecord & {
  candidate: CandidateRecord;
};

type ResumeMountedScreeningRecord = CandidateScreeningResultRecord & {
  jobDescription: TrackingJobDescriptionRecord;
};

type CandidateInterviewRecordRow = CandidateInterviewFeedbackRecord & {
  candidate: CandidateRecord;
  jobDescription: TrackingJobDescriptionRecord;
};

export type CandidateScreeningRunDto = {
  id: string;
  userId: string;
  jobDescriptionId: string;
  platform: CandidateScreeningPlatform;
  mode: CandidateScreeningMode;
  status: CandidateScreeningRunStatus;
  currentStage: CandidateScreeningRunStage | null;
  searchPlan: SearchPlan | null;
  evaluationSchema: EvaluationSchema | null;
  stats: ScreeningRunStats | null;
  errorMessage: string | null;
  startedAt: string | null;
  finishedAt: string | null;
  createdAt: string;
  updatedAt: string;
};

export type CandidateScreeningRunEventDto = {
  id: string;
  userId: string;
  runId: string;
  jobDescriptionId: string;
  candidateId: string | null;
  stage: CandidateScreeningRunStage;
  level: CandidateScreeningRunEventLevel;
  message: string;
  detail: Record<string, unknown> | null;
  createdAt: string;
};

export type CandidateDto = {
  id: string;
  userId: string;
  displayName: string;
  currentTitle: string | null;
  currentCompany: string | null;
  location: string | null;
  experienceYears: number | null;
  sourcePlatform: CandidateScreeningPlatform;
  platformCandidateId: string | null;
  profileUrl: string | null;
  identityKey: string;
  identityHash: string;
  lastActiveAt: string | null;
  contacted: boolean;
  replied: boolean;
  lastContactAt: string | null;
  createdAt: string;
  updatedAt: string;
};

export type CandidateResumeDto = {
  id: string;
  userId: string;
  candidateId: string;
  sourcePlatform: CandidateScreeningPlatform;
  profileUrl: string | null;
  rawText: string;
  structuredSummary: Record<string, unknown> | null;
  resumeHash: string;
  fetchedAt: string;
  createdAt: string;
};

export type CandidateScreeningResultDto = {
  id: string;
  userId: string;
  runId: string;
  jobDescriptionId: string;
  candidateId: string;
  resumeId: string | null;
  source: CandidateScreeningSource;
  tags: CandidateTags;
  scoreDetail: ScoreDetail;
  finalScore: number;
  rank: number;
  decisionAction: CandidateDecisionAction;
  decisionPriority: CandidateDecisionPriority;
  decisionReason: string;
  actionPlan: CandidateActionPlan | null;
  actionStatus: CandidateActionStatus;
  interviewStage: CandidateInterviewStage;
  notes: string | null;
  createdAt: string;
  updatedAt: string;
};

export type CandidateActionLogDto = {
  id: string;
  userId: string;
  runId: string;
  screeningResultId: string;
  candidateId: string;
  jobDescriptionId: string;
  platform: CandidateScreeningPlatform;
  mode: CandidateScreeningMode;
  action: CandidateDecisionAction;
  message: string | null;
  status: CandidateActionStatus;
  idempotencyKey: string;
  browserTrace: Record<string, unknown> | null;
  errorMessage: string | null;
  createdAt: string;
  updatedAt: string;
};

export type CandidateInterviewFeedbackDto = {
  id: string;
  userId: string;
  jobDescriptionId: string;
  candidateId: string;
  stage: CandidateInterviewFeedbackStage;
  interviewer: string;
  rating: number;
  pros: string[];
  cons: string[];
  decision: CandidateInterviewFeedbackDecision;
  notes: string | null;
  createdAt: string;
  updatedAt: string;
};

export type CandidateInterviewRecordDto = CandidateInterviewFeedbackDto & {
  candidate: CandidateDto;
  jobDescription: CandidateTrackingJobDescriptionDto;
};

export type CandidateVectorChunkInsert = {
  id?: string;
  chunkIndex: number;
  content: string;
  tokenEstimate?: number | null;
  embedding: number[];
};

export type CandidateVectorSearchResult = {
  id: string;
  candidateId: string;
  resumeId: string;
  userId: string;
  chunkIndex: number;
  content: string;
  displayName: string;
  currentTitle: string | null;
  currentCompany: string | null;
  profileUrl: string | null;
  contacted: boolean;
  score: number;
};

export type CandidateScreeningResultListItem = CandidateScreeningResultDto & {
  candidate: CandidateDto;
  resume: CandidateResumeDto | null;
};

export type CandidateScreeningDetailDto = CandidateScreeningResultListItem & {
  actionLogs: CandidateActionLogDto[];
};

export type CandidateTrackingJobDescriptionDto = {
  id: string;
  department: string;
  position: string;
  status: JDStatus;
  title: string;
  updatedAt: string;
};

export type CandidateTrackingJobSummaryDto = {
  jobDescription: CandidateTrackingJobDescriptionDto;
  totalCandidates: number;
  activeCandidates: number;
  interviewingCandidates: number;
  skippedCandidates: number;
  latestCandidateUpdatedAt: string;
};

export type CandidateTrackingCandidateDto = CandidateScreeningResultListItem & {
  jobDescription: CandidateTrackingJobDescriptionDto;
};

export type CandidateTrackingOverviewDto = {
  jobs: CandidateTrackingJobSummaryDto[];
  candidates: CandidateTrackingCandidateDto[];
};

export type CandidateResumeMountedJobDto = {
  screeningResultId: string;
  candidateId: string;
  resumeId: string | null;
  finalScore: number;
  interviewStage: CandidateInterviewStage;
  decisionAction: CandidateDecisionAction;
  updatedAt: string;
  jobDescription: CandidateTrackingJobDescriptionDto;
};

export type CandidateResumeLibraryItemDto = {
  resume: CandidateResumeDto;
  candidate: CandidateDto;
  mountedJobs: CandidateResumeMountedJobDto[];
};

export type CreateRunParams = {
  userId: string;
  jobDescriptionId: string;
  platform: CandidateScreeningPlatform;
  mode: CandidateScreeningMode;
  status?: CandidateScreeningRunStatus;
  currentStage?: CandidateScreeningRunStage | null;
  searchPlan?: SearchPlan | null;
  evaluationSchema?: EvaluationSchema | null;
  stats?: ScreeningRunStats | null;
  errorMessage?: string | null;
  startedAt?: Date | null;
  finishedAt?: Date | null;
};

export type UpdateRunParams = {
  userId: string;
  runId: string;
  jobDescriptionId?: string;
  status?: CandidateScreeningRunStatus;
  currentStage?: CandidateScreeningRunStage | null;
  searchPlan?: SearchPlan | null;
  evaluationSchema?: EvaluationSchema | null;
  stats?: ScreeningRunStats | null;
  errorMessage?: string | null;
  startedAt?: Date | null;
  finishedAt?: Date | null;
};

export type CreateRunEventParams = {
  userId: string;
  runId: string;
  jobDescriptionId: string;
  candidateId?: string | null;
  stage: CandidateScreeningRunStage;
  level?: CandidateScreeningRunEventLevel;
  message: string;
  detail?: Record<string, unknown> | null;
};

export type ListRunEventsParams = {
  userId: string;
  runId: string;
  limit?: number;
};

export type UpsertCandidateParams = {
  userId: string;
  displayName: string;
  currentTitle?: string | null;
  currentCompany?: string | null;
  location?: string | null;
  experienceYears?: number | null;
  sourcePlatform: CandidateScreeningPlatform;
  platformCandidateId?: string | null;
  profileUrl?: string | null;
  identityKey: string;
  identityHash: string;
  lastActiveAt?: Date | null;
  contacted?: boolean;
  replied?: boolean;
  lastContactAt?: Date | null;
};

export type CreateResumeParams = {
  userId: string;
  candidateId: string;
  sourcePlatform: CandidateScreeningPlatform;
  profileUrl?: string | null;
  rawText: string;
  structuredSummary?: Record<string, unknown> | null;
  resumeHash: string;
  fetchedAt: Date;
};

export type ReplaceCandidateChunksParams = {
  userId: string;
  candidateId: string;
  resumeId: string;
  embeddingModel: string;
  chunks: CandidateVectorChunkInsert[];
};

export type CandidateVectorSearchParams = {
  userId: string;
  queryVector: number[];
  embeddingModel: string;
  topK: number;
  allowAlreadyContacted: boolean;
  candidateId?: string | null;
};

export type UpsertScreeningResultParams = {
  userId: string;
  runId: string;
  jobDescriptionId: string;
  candidateId: string;
  resumeId?: string | null;
  source: CandidateScreeningSource;
  tags: CandidateTags;
  scoreDetail: ScoreDetail;
  finalScore: number;
  rank: number;
  decisionAction: CandidateDecisionAction;
  decisionPriority: CandidateDecisionPriority;
  decisionReason: string;
  actionPlan?: CandidateActionPlan | null;
  actionStatus?: CandidateActionStatus;
  interviewStage?: CandidateInterviewStage;
  notes?: string | null;
};

export type ListCandidateResultsParams = {
  userId: string;
  jobDescriptionId: string;
  candidateIds?: string[];
  runId?: string;
  plannedActions?: CandidateDecisionAction[];
  limit: number;
  offset?: number;
  interviewStage?: CandidateInterviewStage;
  minScore?: number;
};

export type UpdateCandidateProgressRepoParams = {
  userId: string;
  jobDescriptionId: string;
  candidateId: string;
  interviewStage?: CandidateInterviewStage;
  notes?: string | null;
};

export type UpsertCandidateInterviewFeedbackParams = {
  userId: string;
  jobDescriptionId: string;
  candidateId: string;
  stage: CandidateInterviewFeedbackStage;
  interviewer: string;
  rating: number;
  pros: string[];
  cons: string[];
  decision: CandidateInterviewFeedbackDecision;
  notes?: string | null;
};

export type CreateActionLogParams = {
  userId: string;
  runId: string;
  screeningResultId: string;
  candidateId: string;
  jobDescriptionId: string;
  platform: CandidateScreeningPlatform;
  mode: CandidateScreeningMode;
  action: CandidateDecisionAction;
  message?: string | null;
  status: CandidateActionStatus;
  idempotencyKey: string;
  browserTrace?: Record<string, unknown> | null;
  errorMessage?: string | null;
};

export type UpdateActionLogParams = {
  userId: string;
  id: string;
  status?: CandidateActionStatus;
  browserTrace?: Record<string, unknown> | null;
  errorMessage?: string | null;
};

function toJson(value: unknown): Prisma.InputJsonValue {
  return value as Prisma.InputJsonValue;
}

function toNullableJson(value: unknown | null): Prisma.InputJsonValue | typeof Prisma.JsonNull {
  return value === null ? Prisma.JsonNull : toJson(value);
}

function isUniqueConstraintError(error: unknown): boolean {
  return (
    typeof error === 'object' &&
    error !== null &&
    'code' in error &&
    (error as { code?: unknown }).code === 'P2002'
  );
}

function toRecordOrNull(value: unknown | null): Record<string, unknown> | null {
  return value && typeof value === 'object' && !Array.isArray(value)
    ? (value as Record<string, unknown>)
    : null;
}

function toStringArray(value: unknown): string[] {
  return Array.isArray(value)
    ? value.filter((item): item is string => typeof item === 'string')
    : [];
}

function iso(date: Date): string;
function iso(date: NullableDate): string | null;
function iso(date: NullableDate): string | null {
  return date ? date.toISOString() : null;
}

const DEFAULT_LIST_LIMIT = 200;
const MAX_LIST_LIMIT = 500;
const DEFAULT_EVENT_LIMIT = 300;
const MAX_EVENT_LIMIT = 1000;

function clampListLimit(value: number | undefined): number {
  if (value === undefined || !Number.isFinite(value)) return DEFAULT_LIST_LIMIT;
  return Math.max(1, Math.min(MAX_LIST_LIMIT, Math.trunc(value)));
}

function clampEventLimit(value: number | undefined): number {
  if (value === undefined || !Number.isFinite(value)) return DEFAULT_EVENT_LIMIT;
  return Math.max(1, Math.min(MAX_EVENT_LIMIT, Math.trunc(value)));
}

function mapRun(row: CandidateScreeningRunRecord): CandidateScreeningRunDto {
  return {
    id: row.id,
    userId: row.userId,
    jobDescriptionId: row.jobDescriptionId,
    platform: row.platform as CandidateScreeningPlatform,
    mode: row.mode as CandidateScreeningMode,
    status: row.status as CandidateScreeningRunStatus,
    currentStage: row.currentStage as CandidateScreeningRunStage | null,
    searchPlan: row.searchPlan ? (row.searchPlan as SearchPlan) : null,
    evaluationSchema: row.evaluationSchema ? (row.evaluationSchema as EvaluationSchema) : null,
    stats: row.stats ? (row.stats as ScreeningRunStats) : null,
    errorMessage: row.errorMessage,
    startedAt: iso(row.startedAt),
    finishedAt: iso(row.finishedAt),
    createdAt: iso(row.createdAt),
    updatedAt: iso(row.updatedAt),
  };
}

function mapRunEvent(row: CandidateScreeningRunEventRecord): CandidateScreeningRunEventDto {
  return {
    id: row.id,
    userId: row.userId,
    runId: row.runId,
    jobDescriptionId: row.jobDescriptionId,
    candidateId: row.candidateId,
    stage: row.stage as CandidateScreeningRunStage,
    level: row.level as CandidateScreeningRunEventLevel,
    message: row.message,
    detail: toRecordOrNull(row.detail),
    createdAt: iso(row.createdAt),
  };
}

function mapCandidate(row: CandidateRecord): CandidateDto {
  return {
    id: row.id,
    userId: row.userId,
    displayName: row.displayName,
    currentTitle: row.currentTitle,
    currentCompany: row.currentCompany,
    location: row.location,
    experienceYears: row.experienceYears,
    sourcePlatform: row.sourcePlatform as CandidateScreeningPlatform,
    platformCandidateId: row.platformCandidateId,
    profileUrl: row.profileUrl,
    identityKey: row.identityKey,
    identityHash: row.identityHash,
    lastActiveAt: iso(row.lastActiveAt),
    contacted: row.contacted,
    replied: row.replied,
    lastContactAt: iso(row.lastContactAt),
    createdAt: iso(row.createdAt),
    updatedAt: iso(row.updatedAt),
  };
}

function mapResume(row: CandidateResumeRecord): CandidateResumeDto {
  return {
    id: row.id,
    userId: row.userId,
    candidateId: row.candidateId,
    sourcePlatform: row.sourcePlatform as CandidateScreeningPlatform,
    profileUrl: row.profileUrl,
    rawText: row.rawText,
    structuredSummary: toRecordOrNull(row.structuredSummary),
    resumeHash: row.resumeHash,
    fetchedAt: iso(row.fetchedAt),
    createdAt: iso(row.createdAt),
  };
}

function mapScreeningResult(row: CandidateScreeningResultRecord): CandidateScreeningResultDto {
  return {
    id: row.id,
    userId: row.userId,
    runId: row.runId,
    jobDescriptionId: row.jobDescriptionId,
    candidateId: row.candidateId,
    resumeId: row.resumeId,
    source: row.source as CandidateScreeningSource,
    tags: row.tags as CandidateTags,
    scoreDetail: row.scoreDetail as ScoreDetail,
    finalScore: row.finalScore,
    rank: row.rank,
    decisionAction: row.decisionAction as CandidateDecisionAction,
    decisionPriority: row.decisionPriority as CandidateDecisionPriority,
    decisionReason: row.decisionReason,
    actionPlan: row.actionPlan ? (row.actionPlan as CandidateActionPlan) : null,
    actionStatus: row.actionStatus as CandidateActionStatus,
    interviewStage: row.interviewStage as CandidateInterviewStage,
    notes: row.notes,
    createdAt: iso(row.createdAt),
    updatedAt: iso(row.updatedAt),
  };
}

function mapActionLog(row: CandidateActionLogRecord): CandidateActionLogDto {
  return {
    id: row.id,
    userId: row.userId,
    runId: row.runId,
    screeningResultId: row.screeningResultId,
    candidateId: row.candidateId,
    jobDescriptionId: row.jobDescriptionId,
    platform: row.platform as CandidateScreeningPlatform,
    mode: row.mode as CandidateScreeningMode,
    action: row.action as CandidateDecisionAction,
    message: row.message,
    status: row.status as CandidateActionStatus,
    idempotencyKey: row.idempotencyKey,
    browserTrace: toRecordOrNull(row.browserTrace),
    errorMessage: row.errorMessage,
    createdAt: iso(row.createdAt),
    updatedAt: iso(row.updatedAt),
  };
}

function mapInterviewFeedback(
  row: CandidateInterviewFeedbackRecord,
): CandidateInterviewFeedbackDto {
  return {
    id: row.id,
    userId: row.userId,
    jobDescriptionId: row.jobDescriptionId,
    candidateId: row.candidateId,
    stage: row.stage as CandidateInterviewFeedbackStage,
    interviewer: row.interviewer,
    rating: row.rating,
    pros: toStringArray(row.pros),
    cons: toStringArray(row.cons),
    decision: row.decision as CandidateInterviewFeedbackDecision,
    notes: row.notes,
    createdAt: iso(row.createdAt),
    updatedAt: iso(row.updatedAt),
  };
}

function mapInterviewRecord(row: CandidateInterviewRecordRow): CandidateInterviewRecordDto {
  return {
    ...mapInterviewFeedback(row),
    candidate: mapCandidate(row.candidate),
    jobDescription: mapTrackingJobDescription(row.jobDescription),
  };
}

function mapListItem(row: CandidateWithRelationsRecord): CandidateScreeningResultListItem {
  return {
    ...mapScreeningResult(row),
    candidate: mapCandidate(row.candidate),
    resume: row.resume ? mapResume(row.resume) : null,
  };
}

function mapDetail(row: CandidateWithRelationsRecord): CandidateScreeningDetailDto {
  return {
    ...mapListItem(row),
    actionLogs: (row.actionLogs ?? []).map(mapActionLog),
  };
}

function readJobTitle(content: unknown, fallback: string): string {
  if (content && typeof content === 'object' && 'title' in content) {
    const title = (content as { title?: unknown }).title;
    if (typeof title === 'string' && title.trim()) {
      return title;
    }
  }
  return fallback;
}

function mapTrackingJobDescription(
  row: TrackingJobDescriptionRecord,
): CandidateTrackingJobDescriptionDto {
  return {
    id: row.id,
    department: row.department,
    position: row.position,
    status: row.status as JDStatus,
    title: readJobTitle(row.content, row.position),
    updatedAt: iso(row.updatedAt),
  };
}

function mapTrackingCandidate(row: CandidateTrackingRecord): CandidateTrackingCandidateDto {
  return {
    ...mapListItem(row),
    jobDescription: mapTrackingJobDescription(row.jobDescription),
  };
}

function mapResumeMountedJob(row: ResumeMountedScreeningRecord): CandidateResumeMountedJobDto {
  return {
    screeningResultId: row.id,
    candidateId: row.candidateId,
    resumeId: row.resumeId,
    finalScore: row.finalScore,
    interviewStage: row.interviewStage as CandidateInterviewStage,
    decisionAction: row.decisionAction as CandidateDecisionAction,
    updatedAt: iso(row.updatedAt),
    jobDescription: mapTrackingJobDescription(row.jobDescription),
  };
}

function isActiveCandidate(row: CandidateScreeningResultDto): boolean {
  return (
    row.decisionAction !== 'skip' &&
    row.interviewStage !== 'rejected' &&
    row.interviewStage !== 'withdrawn'
  );
}

function isInterviewingCandidate(row: CandidateScreeningResultDto): boolean {
  return (
    row.interviewStage === 'phone_screen' ||
    row.interviewStage === 'interviewing' ||
    row.interviewStage === 'offer'
  );
}

export async function createCandidateScreeningRun(
  params: CreateRunParams,
): Promise<CandidateScreeningRunDto> {
  const row = await prisma.candidateScreeningRun.create({
    data: {
      userId: params.userId,
      jobDescriptionId: params.jobDescriptionId,
      platform: params.platform,
      mode: params.mode,
      status: params.status ?? 'pending',
      currentStage: params.currentStage ?? null,
      searchPlan:
        params.searchPlan === undefined ? Prisma.JsonNull : toNullableJson(params.searchPlan),
      evaluationSchema:
        params.evaluationSchema === undefined
          ? Prisma.JsonNull
          : toNullableJson(params.evaluationSchema),
      stats: params.stats === undefined ? Prisma.JsonNull : toNullableJson(params.stats),
      errorMessage: params.errorMessage ?? null,
      startedAt: params.startedAt ?? null,
      finishedAt: params.finishedAt ?? null,
    },
  });
  return mapRun(row);
}

export async function listCandidateScreeningRuns(params: {
  userId: string;
  jobDescriptionId: string;
  limit: number;
}): Promise<CandidateScreeningRunDto[]> {
  const rows = await prisma.candidateScreeningRun.findMany({
    where: { userId: params.userId, jobDescriptionId: params.jobDescriptionId },
    orderBy: { createdAt: 'desc' },
    take: params.limit,
  });
  return rows.map(mapRun);
}

export async function getCandidateScreeningRun(params: {
  userId: string;
  runId: string;
}): Promise<CandidateScreeningRunDto | null> {
  const row = await prisma.candidateScreeningRun.findFirst({
    where: { id: params.runId, userId: params.userId },
  });
  return row ? mapRun(row) : null;
}

export async function updateCandidateScreeningRun(
  params: UpdateRunParams,
): Promise<CandidateScreeningRunDto | null> {
  const data: Prisma.CandidateScreeningRunUpdateManyMutationInput = {};
  if (params.status !== undefined) data.status = params.status;
  if (params.currentStage !== undefined) data.currentStage = params.currentStage;
  if (params.searchPlan !== undefined) data.searchPlan = toNullableJson(params.searchPlan);
  if (params.evaluationSchema !== undefined) {
    data.evaluationSchema = toNullableJson(params.evaluationSchema);
  }
  if (params.stats !== undefined) data.stats = toNullableJson(params.stats);
  if (params.errorMessage !== undefined) data.errorMessage = params.errorMessage;
  if (params.startedAt !== undefined) data.startedAt = params.startedAt;
  if (params.finishedAt !== undefined) data.finishedAt = params.finishedAt;

  const where = {
    id: params.runId,
    userId: params.userId,
    ...(params.jobDescriptionId ? { jobDescriptionId: params.jobDescriptionId } : {}),
  };
  const result = await prisma.candidateScreeningRun.updateMany({ where, data });
  if (result.count === 0) {
    return null;
  }
  return getCandidateScreeningRun({ userId: params.userId, runId: params.runId });
}

export async function createCandidateScreeningRunEvent(
  params: CreateRunEventParams,
): Promise<CandidateScreeningRunEventDto> {
  const row = await prisma.candidateScreeningRunEvent.create({
    data: {
      userId: params.userId,
      runId: params.runId,
      jobDescriptionId: params.jobDescriptionId,
      candidateId: params.candidateId ?? null,
      stage: params.stage,
      level: params.level ?? 'info',
      message: params.message,
      detail: params.detail === undefined ? Prisma.JsonNull : toNullableJson(params.detail),
    },
  });
  return mapRunEvent(row);
}

export async function listCandidateScreeningRunEvents(
  params: ListRunEventsParams,
): Promise<CandidateScreeningRunEventDto[]> {
  const rows = await prisma.candidateScreeningRunEvent.findMany({
    where: {
      userId: params.userId,
      runId: params.runId,
    },
    orderBy: { createdAt: 'asc' },
    take: clampEventLimit(params.limit),
  });
  return rows.map(mapRunEvent);
}

export async function upsertCandidateWithIdentity(
  params: UpsertCandidateParams,
): Promise<CandidateDto> {
  const createData = {
    displayName: params.displayName,
    currentTitle: params.currentTitle ?? null,
    currentCompany: params.currentCompany ?? null,
    location: params.location ?? null,
    experienceYears: params.experienceYears ?? null,
    platformCandidateId: params.platformCandidateId ?? null,
    profileUrl: params.profileUrl ?? null,
    identityKey: params.identityKey,
    lastActiveAt: params.lastActiveAt ?? null,
    contacted: params.contacted ?? false,
    replied: params.replied ?? false,
    lastContactAt: params.lastContactAt ?? null,
  };
  const updateData: Prisma.CandidateUpdateInput = {
    displayName: params.displayName,
    identityKey: params.identityKey,
  };
  if (params.currentTitle !== undefined) updateData.currentTitle = params.currentTitle;
  if (params.currentCompany !== undefined) updateData.currentCompany = params.currentCompany;
  if (params.location !== undefined) updateData.location = params.location;
  if (params.experienceYears !== undefined) updateData.experienceYears = params.experienceYears;
  if (params.platformCandidateId !== undefined) {
    updateData.platformCandidateId = params.platformCandidateId;
  }
  if (params.profileUrl !== undefined) updateData.profileUrl = params.profileUrl;
  if (params.lastActiveAt !== undefined) updateData.lastActiveAt = params.lastActiveAt;
  if (params.contacted !== undefined) updateData.contacted = params.contacted;
  if (params.replied !== undefined) updateData.replied = params.replied;
  if (params.lastContactAt !== undefined) updateData.lastContactAt = params.lastContactAt;

  const row = await prisma.candidate.upsert({
    where: {
      userId_sourcePlatform_identityHash: {
        userId: params.userId,
        sourcePlatform: params.sourcePlatform,
        identityHash: params.identityHash,
      },
    },
    create: {
      userId: params.userId,
      sourcePlatform: params.sourcePlatform,
      identityHash: params.identityHash,
      ...createData,
    },
    update: updateData,
  });
  return mapCandidate(row);
}

export async function findCandidateByIdentity(params: {
  userId: string;
  sourcePlatform: string;
  identityHash: string;
}): Promise<CandidateDto | null> {
  const row = await prisma.candidate.findFirst({
    where: {
      userId: params.userId,
      sourcePlatform: params.sourcePlatform,
      identityHash: params.identityHash,
    },
  });
  return row ? mapCandidate(row) : null;
}

export async function createOrReuseCandidateResume(
  params: CreateResumeParams,
): Promise<CandidateResumeDto> {
  const scopedWhere = {
    userId: params.userId,
    candidateId: params.candidateId,
    resumeHash: params.resumeHash,
  };
  const existing = await prisma.candidateResume.findFirst({
    where: scopedWhere,
  });
  if (existing) {
    return mapResume(existing);
  }

  try {
    const row = await prisma.candidateResume.create({
      data: {
        userId: params.userId,
        candidateId: params.candidateId,
        sourcePlatform: params.sourcePlatform,
        profileUrl: params.profileUrl ?? null,
        rawText: params.rawText,
        structuredSummary:
          params.structuredSummary === undefined
            ? Prisma.JsonNull
            : toNullableJson(params.structuredSummary),
        resumeHash: params.resumeHash,
        fetchedAt: params.fetchedAt,
      },
    });
    return mapResume(row);
  } catch (error) {
    if (!isUniqueConstraintError(error)) {
      throw error;
    }

    const raced = await prisma.candidateResume.findFirst({ where: scopedWhere });
    if (!raced) {
      throw new Error('Candidate resume unique conflict could not be resolved in user scope');
    }
    return mapResume(raced);
  }
}

export async function findCandidateResumeByHash(params: {
  userId: string;
  candidateId: string;
  resumeHash: string;
}): Promise<CandidateResumeDto | null> {
  const row = await prisma.candidateResume.findFirst({
    where: {
      userId: params.userId,
      candidateId: params.candidateId,
      resumeHash: params.resumeHash,
    },
  });
  return row ? mapResume(row) : null;
}

export async function replaceCandidateResumeChunks(
  params: ReplaceCandidateChunksParams,
): Promise<number> {
  await prisma.$transaction(async (tx) => {
    await tx.candidateResumeChunk.deleteMany({
      where: {
        userId: params.userId,
        candidateId: params.candidateId,
        resumeId: params.resumeId,
      },
    });

    for (const chunk of params.chunks) {
      const id = chunk.id ?? randomUUID();
      const vectorLiteral = vectorToPgLiteral(chunk.embedding);
      await tx.$executeRaw`
        INSERT INTO "public"."candidate_resume_chunks"
          ("id", "user_id", "candidate_id", "resume_id", "chunk_index", "content", "token_estimate",
           "embedding_model", "embedding_dimension", "embedding", "created_at")
        VALUES
          (${id}, ${params.userId}, ${params.candidateId}, ${params.resumeId}, ${chunk.chunkIndex},
           ${chunk.content}, ${chunk.tokenEstimate ?? null}, ${params.embeddingModel},
           ${chunk.embedding.length}, ${vectorLiteral}::vector, CURRENT_TIMESTAMP)
      `;
    }
  });

  return params.chunks.length;
}

export async function searchCandidateResumeChunks(
  params: CandidateVectorSearchParams,
): Promise<CandidateVectorSearchResult[]> {
  if (params.topK <= 0 || params.queryVector.length === 0) {
    return [];
  }

  const vectorLiteral = vectorToPgLiteral(params.queryVector);
  const candidateFilter = params.candidateId
    ? Prisma.sql`AND c.candidate_id = ${params.candidateId}`
    : Prisma.empty;

  const rows = await prisma.$queryRaw<
    Array<{
      id: string;
      candidateId: string;
      resumeId: string;
      userId: string;
      chunkIndex: number;
      content: string;
      displayName: string;
      currentTitle: string | null;
      currentCompany: string | null;
      profileUrl: string | null;
      contacted: boolean;
      score: number | string;
    }>
  >(Prisma.sql`
    SELECT
      c.id,
      c.candidate_id AS "candidateId",
      c.resume_id AS "resumeId",
      c.user_id AS "userId",
      c.chunk_index AS "chunkIndex",
      c.content,
      candidate.display_name AS "displayName",
      candidate.current_title AS "currentTitle",
      candidate.current_company AS "currentCompany",
      candidate.profile_url AS "profileUrl",
      candidate.contacted AS "contacted",
      1 - (c.embedding <=> ${vectorLiteral}::vector) AS score
    FROM "public"."candidate_resume_chunks" c
    INNER JOIN "public"."candidate_resumes" r ON r.id = c.resume_id
    INNER JOIN "public"."candidates" candidate ON candidate.id = c.candidate_id
    WHERE c.user_id = ${params.userId}
      AND r.user_id = ${params.userId}
      AND candidate.user_id = ${params.userId}
      AND c.embedding IS NOT NULL
      AND c.embedding_model = ${params.embeddingModel}
      AND c.embedding_dimension = ${params.queryVector.length}
      AND (${params.allowAlreadyContacted} = true OR candidate.contacted = false)
      ${candidateFilter}
    ORDER BY c.embedding <=> ${vectorLiteral}::vector
    LIMIT ${params.topK}
  `);

  return rows.map((row) => ({
    ...row,
    score: typeof row.score === 'number' ? row.score : Number(row.score),
  }));
}

export async function upsertCandidateScreeningResult(
  params: UpsertScreeningResultParams,
): Promise<CandidateScreeningResultDto> {
  const createData: Prisma.CandidateScreeningResultUncheckedCreateInput = {
    userId: params.userId,
    runId: params.runId,
    jobDescriptionId: params.jobDescriptionId,
    candidateId: params.candidateId,
    resumeId: params.resumeId ?? null,
    source: params.source,
    tags: toJson(params.tags),
    scoreDetail: toJson(params.scoreDetail),
    finalScore: params.finalScore,
    rank: params.rank,
    decisionAction: params.decisionAction,
    decisionPriority: params.decisionPriority,
    decisionReason: params.decisionReason,
    actionPlan:
      params.actionPlan === undefined ? Prisma.JsonNull : toNullableJson(params.actionPlan),
    actionStatus: params.actionStatus ?? 'planned',
    interviewStage: params.interviewStage ?? 'screened',
    notes: params.notes ?? null,
  };
  const updateData: Prisma.CandidateScreeningResultUncheckedUpdateManyInput = {
    resumeId: params.resumeId ?? null,
    source: params.source,
    tags: toJson(params.tags),
    scoreDetail: toJson(params.scoreDetail),
    finalScore: params.finalScore,
    rank: params.rank,
    decisionAction: params.decisionAction,
    decisionPriority: params.decisionPriority,
    decisionReason: params.decisionReason,
    actionPlan:
      params.actionPlan === undefined ? Prisma.JsonNull : toNullableJson(params.actionPlan),
  };
  if (params.actionStatus !== undefined) updateData.actionStatus = params.actionStatus;
  if (params.interviewStage !== undefined) updateData.interviewStage = params.interviewStage;
  if (params.notes !== undefined) updateData.notes = params.notes;

  const scopedWhere = {
    userId: params.userId,
    jobDescriptionId: params.jobDescriptionId,
    candidateId: params.candidateId,
  };
  let existing = await prisma.candidateScreeningResult.findFirst({ where: scopedWhere });
  if (!existing) {
    try {
      const row = await prisma.candidateScreeningResult.create({ data: createData });
      return mapScreeningResult(row);
    } catch (error) {
      if (!isUniqueConstraintError(error)) {
        throw error;
      }

      existing = await prisma.candidateScreeningResult.findFirst({ where: scopedWhere });
      if (!existing) {
        throw new Error(
          'Candidate screening result unique conflict could not be resolved in user scope',
        );
      }
    }
  }

  const updated = await prisma.candidateScreeningResult.updateMany({
    where: { id: existing.id, userId: params.userId },
    data: updateData,
  });
  if (updated.count === 0) {
    throw new Error('Candidate screening result update lost user scope');
  }

  const row = await prisma.candidateScreeningResult.findFirst({
    where: { id: existing.id, userId: params.userId },
  });
  if (!row) {
    throw new Error('Candidate screening result not found after update');
  }
  return mapScreeningResult(row);
}

export async function listCandidateScreeningResults(
  params: ListCandidateResultsParams,
): Promise<CandidateScreeningResultListItem[]> {
  if (params.candidateIds && params.candidateIds.length === 0) {
    return [];
  }

  const hasCurrentRunActionFilter =
    params.runId !== undefined &&
    params.plannedActions !== undefined &&
    params.plannedActions.length > 0;
  const currentRunWhere: Prisma.CandidateScreeningResultWhereInput =
    params.runId === undefined || hasCurrentRunActionFilter
      ? {}
      : {
          OR: [
            { runId: params.runId },
            {
              actionLogs: {
                some: {
                  userId: params.userId,
                  runId: params.runId,
                },
              },
            },
          ],
        };
  const currentRunActionWhere: Prisma.CandidateScreeningResultWhereInput =
    hasCurrentRunActionFilter && params.runId
      ? {
          actionLogs: {
            some: {
              userId: params.userId,
              runId: params.runId,
              status: 'planned',
              action: { in: params.plannedActions },
            },
          },
        }
      : {};

  const rows = await prisma.candidateScreeningResult.findMany({
    where: {
      userId: params.userId,
      jobDescriptionId: params.jobDescriptionId,
      ...(params.candidateIds ? { candidateId: { in: params.candidateIds } } : {}),
      ...currentRunWhere,
      ...(params.interviewStage ? { interviewStage: params.interviewStage } : {}),
      ...(params.minScore !== undefined ? { finalScore: { gte: params.minScore } } : {}),
      ...currentRunActionWhere,
    },
    include: { candidate: true, resume: true },
    orderBy: [{ finalScore: 'desc' }, { rank: 'asc' }],
    skip: params.offset ?? 0,
    take: params.limit,
  });
  return rows.map(mapListItem);
}

export async function listCandidateResumeLibrary(params: {
  userId: string;
  limit?: number;
}): Promise<CandidateResumeLibraryItemDto[]> {
  const limit = clampListLimit(params.limit);
  const batchSize = limit * 3;
  const latestByCandidate = new Map<string, CandidateResumeLibraryRecord>();
  let offset = 0;

  while (latestByCandidate.size < limit) {
    const rows = (await prisma.candidateResume.findMany({
      where: { userId: params.userId },
      include: { candidate: true },
      orderBy: [{ fetchedAt: 'desc' }, { createdAt: 'desc' }, { id: 'desc' }],
      take: batchSize,
      ...(offset > 0 ? { skip: offset } : {}),
    })) as CandidateResumeLibraryRecord[];

    for (const row of rows) {
      if (!latestByCandidate.has(row.candidateId)) {
        latestByCandidate.set(row.candidateId, row);
      }
      if (latestByCandidate.size >= limit) {
        break;
      }
    }

    offset += rows.length;
    if (rows.length < batchSize) {
      break;
    }
  }

  const latestRows = [...latestByCandidate.values()];
  const resumeIds = latestRows.map((row) => row.id);
  const mountedRows =
    resumeIds.length === 0
      ? []
      : ((await prisma.candidateScreeningResult.findMany({
          where: { userId: params.userId, resumeId: { in: resumeIds } },
          include: { jobDescription: true },
          orderBy: [{ updatedAt: 'desc' }, { finalScore: 'desc' }],
        })) as ResumeMountedScreeningRecord[]);

  const mountedByResume = new Map<string, ResumeMountedScreeningRecord[]>();
  for (const mounted of mountedRows) {
    if (!mounted.resumeId) continue;
    const current = mountedByResume.get(mounted.resumeId) ?? [];
    current.push(mounted);
    mountedByResume.set(mounted.resumeId, current);
  }

  return latestRows.map((row) => ({
    resume: mapResume(row),
    candidate: mapCandidate(row.candidate),
    mountedJobs: (mountedByResume.get(row.id) ?? []).map(mapResumeMountedJob),
  }));
}

export async function getCandidateTrackingOverview(params: {
  userId: string;
  limit?: number;
}): Promise<CandidateTrackingOverviewDto> {
  const limit = clampListLimit(params.limit);
  const rows = await prisma.candidateScreeningResult.findMany({
    where: { userId: params.userId },
    include: { candidate: true, resume: true, jobDescription: true },
    orderBy: [{ updatedAt: 'desc' }, { finalScore: 'desc' }],
    take: limit,
  });
  const candidates = (rows as CandidateTrackingRecord[]).map(mapTrackingCandidate);
  const jobsById = new Map<string, CandidateTrackingJobSummaryDto>();

  for (const candidate of candidates) {
    const current = jobsById.get(candidate.jobDescription.id);
    const nextTotal = (current?.totalCandidates ?? 0) + 1;
    const nextActive = (current?.activeCandidates ?? 0) + (isActiveCandidate(candidate) ? 1 : 0);
    const nextInterviewing =
      (current?.interviewingCandidates ?? 0) + (isInterviewingCandidate(candidate) ? 1 : 0);
    const nextSkipped =
      (current?.skippedCandidates ?? 0) + (candidate.decisionAction === 'skip' ? 1 : 0);
    const latestCandidateUpdatedAt =
      !current || candidate.updatedAt > current.latestCandidateUpdatedAt
        ? candidate.updatedAt
        : current.latestCandidateUpdatedAt;

    jobsById.set(candidate.jobDescription.id, {
      jobDescription: candidate.jobDescription,
      totalCandidates: nextTotal,
      activeCandidates: nextActive,
      interviewingCandidates: nextInterviewing,
      skippedCandidates: nextSkipped,
      latestCandidateUpdatedAt,
    });
  }

  const jobs = [...jobsById.values()].sort((left, right) =>
    right.latestCandidateUpdatedAt.localeCompare(left.latestCandidateUpdatedAt),
  );

  return { jobs, candidates };
}

export async function getCandidateScreeningDetail(params: {
  userId: string;
  jobDescriptionId: string;
  candidateId: string;
}): Promise<CandidateScreeningDetailDto | null> {
  const row = await prisma.candidateScreeningResult.findFirst({
    where: {
      userId: params.userId,
      jobDescriptionId: params.jobDescriptionId,
      candidateId: params.candidateId,
    },
    include: {
      candidate: true,
      resume: true,
      actionLogs: { orderBy: { createdAt: 'desc' } },
    },
  });
  return row ? mapDetail(row) : null;
}

export async function updateCandidateInterviewProgress(
  params: UpdateCandidateProgressRepoParams,
): Promise<CandidateScreeningResultDto | null> {
  const data: Prisma.CandidateScreeningResultUpdateManyMutationInput = {};
  if (params.interviewStage !== undefined) data.interviewStage = params.interviewStage;
  if (params.notes !== undefined) data.notes = params.notes;

  const where = {
    userId: params.userId,
    jobDescriptionId: params.jobDescriptionId,
    candidateId: params.candidateId,
  };
  const result = await prisma.candidateScreeningResult.updateMany({ where, data });
  if (result.count === 0) {
    return null;
  }
  const row = await prisma.candidateScreeningResult.findFirst({ where });
  return row ? mapScreeningResult(row) : null;
}

const interviewFeedbackStageOrder: CandidateInterviewFeedbackStage[] = [
  'first_interview',
  'second_interview',
  'final_interview',
];

function sortInterviewFeedbacks(
  left: CandidateInterviewFeedbackDto,
  right: CandidateInterviewFeedbackDto,
): number {
  return (
    interviewFeedbackStageOrder.indexOf(left.stage) -
    interviewFeedbackStageOrder.indexOf(right.stage)
  );
}

export async function listCandidateInterviewFeedbacks(params: {
  userId: string;
  jobDescriptionId: string;
  candidateId: string;
}): Promise<CandidateInterviewFeedbackDto[]> {
  const rows = await prisma.candidateInterviewFeedback.findMany({
    where: {
      userId: params.userId,
      jobDescriptionId: params.jobDescriptionId,
      candidateId: params.candidateId,
    },
    orderBy: { updatedAt: 'asc' },
  });
  return rows.map(mapInterviewFeedback).sort(sortInterviewFeedbacks);
}

export async function listCandidateInterviewRecords(params: {
  userId: string;
  limit?: number;
}): Promise<CandidateInterviewRecordDto[]> {
  const limit = clampListLimit(params.limit);
  const rows = await prisma.candidateInterviewFeedback.findMany({
    where: { userId: params.userId },
    include: { candidate: true, jobDescription: true },
    orderBy: [{ updatedAt: 'desc' }, { createdAt: 'desc' }],
    take: limit,
  });
  return (rows as CandidateInterviewRecordRow[]).map(mapInterviewRecord);
}

export async function upsertCandidateInterviewFeedback(
  params: UpsertCandidateInterviewFeedbackParams,
): Promise<CandidateInterviewFeedbackDto> {
  const row = await prisma.candidateInterviewFeedback.upsert({
    where: {
      userId_jobDescriptionId_candidateId_stage: {
        userId: params.userId,
        jobDescriptionId: params.jobDescriptionId,
        candidateId: params.candidateId,
        stage: params.stage,
      },
    },
    create: {
      userId: params.userId,
      jobDescriptionId: params.jobDescriptionId,
      candidateId: params.candidateId,
      stage: params.stage,
      interviewer: params.interviewer,
      rating: params.rating,
      pros: toJson(params.pros),
      cons: toJson(params.cons),
      decision: params.decision,
      notes: params.notes ?? null,
    },
    update: {
      interviewer: params.interviewer,
      rating: params.rating,
      pros: toJson(params.pros),
      cons: toJson(params.cons),
      decision: params.decision,
      notes: params.notes ?? null,
    },
  });
  return mapInterviewFeedback(row);
}

export async function createCandidateActionLog(
  params: CreateActionLogParams,
): Promise<CandidateActionLogDto> {
  const row = await prisma.candidateActionLog.upsert({
    where: {
      userId_idempotencyKey: {
        userId: params.userId,
        idempotencyKey: params.idempotencyKey,
      },
    },
    create: {
      userId: params.userId,
      runId: params.runId,
      screeningResultId: params.screeningResultId,
      candidateId: params.candidateId,
      jobDescriptionId: params.jobDescriptionId,
      platform: params.platform,
      mode: params.mode,
      action: params.action,
      message: params.message ?? null,
      status: params.status,
      idempotencyKey: params.idempotencyKey,
      browserTrace:
        params.browserTrace === undefined ? Prisma.JsonNull : toNullableJson(params.browserTrace),
      errorMessage: params.errorMessage ?? null,
    },
    update: {},
  });
  return mapActionLog(row);
}

export async function updateCandidateActionLog(
  params: UpdateActionLogParams,
): Promise<CandidateActionLogDto | null> {
  const data: Prisma.CandidateActionLogUpdateManyMutationInput = {};
  if (params.status !== undefined) data.status = params.status;
  if (params.browserTrace !== undefined) data.browserTrace = toNullableJson(params.browserTrace);
  if (params.errorMessage !== undefined) data.errorMessage = params.errorMessage;

  const where = { id: params.id, userId: params.userId };
  const result = await prisma.candidateActionLog.updateMany({ where, data });
  if (result.count === 0) {
    return null;
  }
  const row = await prisma.candidateActionLog.findFirst({ where });
  return row ? mapActionLog(row) : null;
}

export async function claimCandidateActionLog(params: {
  userId: string;
  id: string;
}): Promise<CandidateActionLogDto | null> {
  const where = { id: params.id, userId: params.userId, status: 'planned' };
  const result = await prisma.candidateActionLog.updateMany({
    where,
    data: {
      status: 'running',
      browserTrace: Prisma.JsonNull,
      errorMessage: null,
    },
  });
  if (result.count === 0) {
    return null;
  }

  const row = await prisma.candidateActionLog.findFirst({
    where: { id: params.id, userId: params.userId },
  });
  return row ? mapActionLog(row) : null;
}
