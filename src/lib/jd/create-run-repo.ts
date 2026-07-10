import { Prisma } from '@prisma/client';
import { prisma } from '@/lib/prisma';
import type { CreateJobDescriptionRequest, JDTone } from '@/types';

export type JobDescriptionCreateRunStatus = 'pending' | 'running' | 'success' | 'failed';
export type JobDescriptionCreateRunStage =
  | 'queued'
  | 'input_preparation'
  | 'llm_generation'
  | 'saving'
  | 'completed';
export type JobDescriptionCreateRunEventLevel = 'info' | 'success' | 'warning' | 'error';

type JobDescriptionCreateRunRecord = {
  id: string;
  userId: string;
  jobDescriptionId: string | null;
  department: string;
  position: string;
  positionDescription: string;
  salaryRange: string;
  workLocations: unknown;
  tone: string;
  status: string;
  currentStage: string | null;
  errorMessage: string | null;
  startedAt: Date | null;
  finishedAt: Date | null;
  createdAt: Date;
  updatedAt: Date;
};

type JobDescriptionCreateRunEventRecord = {
  id: string;
  userId: string;
  runId: string;
  stage: string;
  level: string;
  message: string;
  detail: unknown | null;
  createdAt: Date;
};

export type JobDescriptionCreateRunDto = {
  id: string;
  userId: string;
  jobDescriptionId: string | null;
  department: string;
  position: string;
  positionDescription: string;
  salaryRange: string;
  workLocations: string[];
  tone: JDTone;
  status: JobDescriptionCreateRunStatus;
  currentStage: JobDescriptionCreateRunStage | null;
  errorMessage: string | null;
  startedAt: string | null;
  finishedAt: string | null;
  createdAt: string;
  updatedAt: string;
};

export type JobDescriptionCreateRunEventDto = {
  id: string;
  userId: string;
  runId: string;
  stage: JobDescriptionCreateRunStage;
  level: JobDescriptionCreateRunEventLevel;
  message: string;
  detail: Record<string, unknown> | null;
  createdAt: string;
};

export type CreateJobDescriptionCreateRunParams = {
  userId: string;
  request: CreateJobDescriptionRequest;
  status?: JobDescriptionCreateRunStatus;
  currentStage?: JobDescriptionCreateRunStage | null;
};

export type UpdateJobDescriptionCreateRunParams = {
  userId: string;
  runId: string;
  jobDescriptionId?: string | null;
  status?: JobDescriptionCreateRunStatus;
  currentStage?: JobDescriptionCreateRunStage | null;
  errorMessage?: string | null;
  startedAt?: Date | null;
  finishedAt?: Date | null;
};

export type CreateJobDescriptionCreateRunEventParams = {
  userId: string;
  runId: string;
  stage: JobDescriptionCreateRunStage;
  level?: JobDescriptionCreateRunEventLevel;
  message: string;
  detail?: Record<string, unknown> | null;
};

function toJson(value: unknown): Prisma.InputJsonValue {
  return value as Prisma.InputJsonValue;
}

function toNullableJson(value: unknown | null): Prisma.InputJsonValue | typeof Prisma.JsonNull {
  return value === null ? Prisma.JsonNull : toJson(value);
}

function normalizeWorkLocations(value: unknown): string[] {
  if (!Array.isArray(value)) return [];
  return value.filter((item): item is string => typeof item === 'string');
}

function normalizeTone(value: string): JDTone {
  return value === 'startup' || value === 'formal' ? value : 'tech';
}

function normalizeStatus(value: string): JobDescriptionCreateRunStatus {
  if (value === 'running' || value === 'success' || value === 'failed') return value;
  return 'pending';
}

function normalizeStage(value: string | null): JobDescriptionCreateRunStage | null {
  if (
    value === 'queued' ||
    value === 'input_preparation' ||
    value === 'llm_generation' ||
    value === 'saving' ||
    value === 'completed'
  ) {
    return value;
  }
  return null;
}

function normalizeEventLevel(value: string): JobDescriptionCreateRunEventLevel {
  if (value === 'success' || value === 'warning' || value === 'error') return value;
  return 'info';
}

function normalizeDetail(value: unknown | null): Record<string, unknown> | null {
  if (!value || typeof value !== 'object' || Array.isArray(value)) return null;
  return value as Record<string, unknown>;
}

function clampLimit(limit: number | undefined): number {
  return Math.max(1, Math.min(100, Math.trunc(limit ?? 20)));
}

function mapRun(row: JobDescriptionCreateRunRecord): JobDescriptionCreateRunDto {
  return {
    id: row.id,
    userId: row.userId,
    jobDescriptionId: row.jobDescriptionId,
    department: row.department,
    position: row.position,
    positionDescription: row.positionDescription,
    salaryRange: row.salaryRange,
    workLocations: normalizeWorkLocations(row.workLocations),
    tone: normalizeTone(row.tone),
    status: normalizeStatus(row.status),
    currentStage: normalizeStage(row.currentStage),
    errorMessage: row.errorMessage,
    startedAt: row.startedAt?.toISOString() ?? null,
    finishedAt: row.finishedAt?.toISOString() ?? null,
    createdAt: row.createdAt.toISOString(),
    updatedAt: row.updatedAt.toISOString(),
  };
}

function mapEvent(row: JobDescriptionCreateRunEventRecord): JobDescriptionCreateRunEventDto {
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

export async function createJobDescriptionCreateRun(
  params: CreateJobDescriptionCreateRunParams,
): Promise<JobDescriptionCreateRunDto> {
  const row = await prisma.jobDescriptionCreateRun.create({
    data: {
      userId: params.userId,
      department: params.request.department,
      position: params.request.position,
      positionDescription: params.request.positionDescription,
      salaryRange: params.request.salaryRange,
      workLocations: toJson(params.request.workLocations),
      tone: params.request.tone ?? 'tech',
      status: params.status ?? 'pending',
      currentStage: params.currentStage ?? null,
    },
  });
  return mapRun(row);
}

export async function getJobDescriptionCreateRun(params: {
  userId: string;
  runId: string;
}): Promise<JobDescriptionCreateRunDto | null> {
  const row = await prisma.jobDescriptionCreateRun.findFirst({
    where: { id: params.runId, userId: params.userId },
  });
  return row ? mapRun(row) : null;
}

export async function listJobDescriptionCreateRuns(params: {
  userId: string;
  jobDescriptionId?: string;
  limit?: number;
}): Promise<JobDescriptionCreateRunDto[]> {
  const rows = await prisma.jobDescriptionCreateRun.findMany({
    where: {
      userId: params.userId,
      ...(params.jobDescriptionId ? { jobDescriptionId: params.jobDescriptionId } : {}),
    },
    orderBy: { createdAt: 'desc' },
    take: clampLimit(params.limit),
  });
  return rows.map(mapRun);
}

export async function updateJobDescriptionCreateRun(
  params: UpdateJobDescriptionCreateRunParams,
): Promise<JobDescriptionCreateRunDto | null> {
  const data: Prisma.JobDescriptionCreateRunUncheckedUpdateManyInput = {};
  if (params.jobDescriptionId !== undefined) data.jobDescriptionId = params.jobDescriptionId;
  if (params.status !== undefined) data.status = params.status;
  if (params.currentStage !== undefined) data.currentStage = params.currentStage;
  if (params.errorMessage !== undefined) data.errorMessage = params.errorMessage;
  if (params.startedAt !== undefined) data.startedAt = params.startedAt;
  if (params.finishedAt !== undefined) data.finishedAt = params.finishedAt;

  const result = await prisma.jobDescriptionCreateRun.updateMany({
    where: { id: params.runId, userId: params.userId },
    data,
  });
  if (result.count === 0) {
    return null;
  }
  return getJobDescriptionCreateRun({ userId: params.userId, runId: params.runId });
}

export async function createJobDescriptionCreateRunEvent(
  params: CreateJobDescriptionCreateRunEventParams,
): Promise<JobDescriptionCreateRunEventDto> {
  const row = await prisma.jobDescriptionCreateRunEvent.create({
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

export async function listJobDescriptionCreateRunEvents(params: {
  userId: string;
  runId: string;
  limit?: number;
}): Promise<JobDescriptionCreateRunEventDto[]> {
  const rows = await prisma.jobDescriptionCreateRunEvent.findMany({
    where: { userId: params.userId, runId: params.runId },
    orderBy: { createdAt: 'asc' },
    take: clampLimit(params.limit),
  });
  return rows.map(mapEvent);
}
