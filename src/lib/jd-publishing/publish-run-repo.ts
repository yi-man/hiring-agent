import { Prisma } from '@prisma/client';
import { prisma } from '@/lib/prisma';
import { reconcileJobDescriptionPublishResult } from '@/lib/jd/job-description-repo';

export type JobDescriptionPublishRunStatus = 'pending' | 'running' | 'success' | 'failed';
export type JobDescriptionPublishRunStage = 'queued' | 'publishing' | 'completed';
export type JobDescriptionPublishRunEventLevel = 'info' | 'success' | 'warning' | 'error';

type PublishRunRecord = {
  id: string;
  userId: string;
  jobDescriptionId: string;
  batchId: string;
  platform: string;
  status: string;
  currentStage: string | null;
  errorMessage: string | null;
  publishTaskId: string | null;
  skillId: string | null;
  startedAt: Date | null;
  finishedAt: Date | null;
  createdAt: Date;
  updatedAt: Date;
};

type PublishRunEventRecord = {
  id: string;
  userId: string;
  runId: string;
  stage: string;
  level: string;
  message: string;
  detail: unknown | null;
  createdAt: Date;
};

export type JobDescriptionPublishRunDto = {
  id: string;
  userId: string;
  jobDescriptionId: string;
  batchId: string;
  platform: string;
  status: JobDescriptionPublishRunStatus;
  currentStage: JobDescriptionPublishRunStage | null;
  errorMessage: string | null;
  publishTaskId: string | null;
  skillId: string | null;
  startedAt: string | null;
  finishedAt: string | null;
  createdAt: string;
  updatedAt: string;
};

export type JobDescriptionPublishRunEventDto = {
  id: string;
  userId: string;
  runId: string;
  stage: JobDescriptionPublishRunStage;
  level: JobDescriptionPublishRunEventLevel;
  message: string;
  detail: Record<string, unknown> | null;
  createdAt: string;
};

export type CreatePublishRunParams = {
  userId: string;
  jobDescriptionId: string;
  batchId: string;
  platform: string;
};

export type UpdatePublishRunParams = {
  userId: string;
  runId: string;
  expectedStatus: JobDescriptionPublishRunStatus | readonly JobDescriptionPublishRunStatus[];
  status?: JobDescriptionPublishRunStatus;
  currentStage?: JobDescriptionPublishRunStage | null;
  errorMessage?: string | null;
  publishTaskId?: string | null;
  skillId?: string | null;
  startedAt?: Date | null;
  finishedAt?: Date | null;
};

export type CreatePublishRunEventParams = {
  userId: string;
  runId: string;
  stage: JobDescriptionPublishRunStage;
  level?: JobDescriptionPublishRunEventLevel;
  message: string;
  detail?: Record<string, unknown> | null;
};

function toNullableJson(value: unknown | null): Prisma.InputJsonValue | typeof Prisma.JsonNull {
  return value === null ? Prisma.JsonNull : (value as Prisma.InputJsonValue);
}

function normalizeStatus(value: string): JobDescriptionPublishRunStatus {
  if (value === 'running' || value === 'success' || value === 'failed') return value;
  return 'pending';
}

function normalizeStage(value: string | null): JobDescriptionPublishRunStage | null {
  if (value === 'queued' || value === 'publishing' || value === 'completed') return value;
  return null;
}

function normalizeEventLevel(value: string): JobDescriptionPublishRunEventLevel {
  if (value === 'success' || value === 'warning' || value === 'error') return value;
  return 'info';
}

function normalizeDetail(value: unknown | null): Record<string, unknown> | null {
  if (!value || typeof value !== 'object' || Array.isArray(value)) return null;
  return value as Record<string, unknown>;
}

function mapRun(row: PublishRunRecord): JobDescriptionPublishRunDto {
  return {
    id: row.id,
    userId: row.userId,
    jobDescriptionId: row.jobDescriptionId,
    batchId: row.batchId,
    platform: row.platform,
    status: normalizeStatus(row.status),
    currentStage: normalizeStage(row.currentStage),
    errorMessage: row.errorMessage,
    publishTaskId: row.publishTaskId,
    skillId: row.skillId,
    startedAt: row.startedAt?.toISOString() ?? null,
    finishedAt: row.finishedAt?.toISOString() ?? null,
    createdAt: row.createdAt.toISOString(),
    updatedAt: row.updatedAt.toISOString(),
  };
}

function mapEvent(row: PublishRunEventRecord): JobDescriptionPublishRunEventDto {
  return {
    id: row.id,
    userId: row.userId,
    runId: row.runId,
    stage: normalizeStage(row.stage) ?? 'queued',
    level: normalizeEventLevel(row.level),
    message: row.message,
    detail: normalizeDetail(row.detail),
    createdAt: row.createdAt.toISOString(),
  };
}

export async function createPublishRun(
  params: CreatePublishRunParams,
): Promise<JobDescriptionPublishRunDto> {
  const row = await prisma.jobDescriptionPublishRun.create({
    data: {
      userId: params.userId,
      jobDescriptionId: params.jobDescriptionId,
      batchId: params.batchId,
      platform: params.platform,
      status: 'pending',
      currentStage: 'queued',
    },
  });
  return mapRun(row);
}

export async function getPublishRun(params: {
  userId: string;
  runId: string;
}): Promise<JobDescriptionPublishRunDto | null> {
  const row = await prisma.jobDescriptionPublishRun.findFirst({
    where: { id: params.runId, userId: params.userId },
  });
  return row ? mapRun(row) : null;
}

export async function listPublishRunsForJobDescription(params: {
  userId: string;
  jobDescriptionId: string;
  limit?: number;
}): Promise<JobDescriptionPublishRunDto[]> {
  const rows = await prisma.jobDescriptionPublishRun.findMany({
    where: { userId: params.userId, jobDescriptionId: params.jobDescriptionId },
    orderBy: { createdAt: 'desc' },
    take: Math.max(1, Math.min(20, Math.trunc(params.limit ?? 5))),
  });
  return rows.map(mapRun);
}

export async function updatePublishRun(
  params: UpdatePublishRunParams,
): Promise<JobDescriptionPublishRunDto | null> {
  const data: Prisma.JobDescriptionPublishRunUncheckedUpdateManyInput = {};
  if (params.status !== undefined) data.status = params.status;
  if (params.currentStage !== undefined) data.currentStage = params.currentStage;
  if (params.errorMessage !== undefined) data.errorMessage = params.errorMessage;
  if (params.publishTaskId !== undefined) data.publishTaskId = params.publishTaskId;
  if (params.skillId !== undefined) data.skillId = params.skillId;
  if (params.startedAt !== undefined) data.startedAt = params.startedAt;
  if (params.finishedAt !== undefined) data.finishedAt = params.finishedAt;

  const result = await prisma.jobDescriptionPublishRun.updateMany({
    where: {
      id: params.runId,
      userId: params.userId,
      status:
        typeof params.expectedStatus === 'string'
          ? params.expectedStatus
          : { in: [...params.expectedStatus] },
    },
    data,
  });
  if (result.count === 0) return null;
  return getPublishRun({ userId: params.userId, runId: params.runId });
}

export async function createPublishRunEvent(
  params: CreatePublishRunEventParams,
): Promise<JobDescriptionPublishRunEventDto> {
  const row = await prisma.jobDescriptionPublishRunEvent.create({
    data: {
      userId: params.userId,
      runId: params.runId,
      stage: params.stage,
      level: params.level ?? 'info',
      message: params.message,
      detail: params.detail === undefined ? Prisma.JsonNull : toNullableJson(params.detail),
    },
  });
  return mapEvent(row);
}

export async function listPublishRunEvents(params: {
  userId: string;
  runId: string;
  limit?: number;
}): Promise<JobDescriptionPublishRunEventDto[]> {
  const rows = await prisma.jobDescriptionPublishRunEvent.findMany({
    where: { userId: params.userId, runId: params.runId },
    orderBy: { createdAt: 'asc' },
    take: Math.max(1, Math.min(500, Math.trunc(params.limit ?? 200))),
  });
  return rows.map(mapEvent);
}

type PublishBatchReconcileParams = Parameters<typeof reconcileJobDescriptionPublishResult>[0];

type PublishBatchReconcileRetryOptions = {
  maxAttempts?: number;
  wait?: (delayMs: number) => Promise<void>;
};

function wait(delayMs: number): Promise<void> {
  return new Promise((resolve) => setTimeout(resolve, delayMs));
}

export async function reconcilePublishBatchWithRetry(
  params: PublishBatchReconcileParams,
  options: PublishBatchReconcileRetryOptions = {},
): ReturnType<typeof reconcileJobDescriptionPublishResult> {
  const maxAttempts = Math.max(1, Math.min(5, Math.trunc(options.maxAttempts ?? 3)));
  const waitForRetry = options.wait ?? wait;
  let lastError: unknown;

  for (let attempt = 1; attempt <= maxAttempts; attempt += 1) {
    try {
      return await reconcileJobDescriptionPublishResult(params);
    } catch (error) {
      lastError = error;
      if (attempt === maxAttempts) break;
      await waitForRetry(25 * 2 ** (attempt - 1));
    }
  }

  throw lastError;
}

export async function reconcileTerminalPublishRunWithRetry(
  run: JobDescriptionPublishRunDto,
  options?: PublishBatchReconcileRetryOptions,
): Promise<boolean> {
  if (run.status !== 'success' && run.status !== 'failed') return false;

  await reconcilePublishBatchWithRetry(
    {
      userId: run.userId,
      id: run.jobDescriptionId,
      batchId: run.batchId,
      mode: 'batch',
      result: run.status,
    },
    options,
  );
  return true;
}
