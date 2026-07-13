import { Prisma } from '@prisma/client';
import { prisma } from '@/lib/prisma';

export type JobDescriptionPublishRunStatus = 'pending' | 'running' | 'success' | 'failed';
export type JobDescriptionPublishRunStage = 'queued' | 'publishing' | 'completed';
export type JobDescriptionPublishRunEventLevel = 'info' | 'success' | 'warning' | 'error';

type PublishRunRecord = {
  id: string;
  userId: string;
  jobDescriptionId: string;
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
  platform: string;
};

export type UpdatePublishRunParams = {
  userId: string;
  runId: string;
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
  if (value === 'publishing' || value === 'completed') return value;
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
    where: { id: params.runId, userId: params.userId },
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
