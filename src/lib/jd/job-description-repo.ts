import { Prisma } from '@prisma/client';
import { prisma } from '@/lib/prisma';
import type {
  EvaluationResult,
  JD,
  JDAgentResponse,
  JDStatus,
  JDTone,
  JobDescriptionDto,
} from '@/types';

type JobDescriptionRecord = {
  id: string;
  userId: string;
  department: string;
  position: string;
  positionDescription: string;
  salaryRange: string | null;
  workLocations: unknown | null;
  tone: string;
  status: string;
  content: unknown;
  evaluation: unknown | null;
  generationMeta: unknown | null;
  createdAt: Date;
  updatedAt: Date;
};

type CreateJobDescriptionParams = {
  userId: string;
  department: string;
  position: string;
  positionDescription: string;
  salaryRange?: string | null;
  workLocations?: string[] | null;
  tone: JDTone;
  status?: JDStatus;
  content: JD;
  evaluation: EvaluationResult | null;
  generationMeta: JDAgentResponse['meta'] | null;
};

export type UpdateJobDescriptionParams = {
  userId: string;
  id: string;
  department?: string;
  position?: string;
  positionDescription?: string;
  salaryRange?: string | null;
  workLocations?: string[];
  tone?: JDTone;
  status?: JDStatus;
  content?: JD;
  evaluation?: EvaluationResult | null;
  generationMeta?: JDAgentResponse['meta'] | null;
};

function toJson(value: unknown): Prisma.InputJsonValue {
  return value as Prisma.InputJsonValue;
}

function toNullableJson(value: unknown | null): Prisma.InputJsonValue | typeof Prisma.JsonNull {
  return value === null ? Prisma.JsonNull : toJson(value);
}

function mapWorkLocations(value: unknown | null): string[] {
  if (!Array.isArray(value)) {
    return [];
  }

  return value.filter((item): item is string => typeof item === 'string' && item.trim().length > 0);
}

function mapRow(row: JobDescriptionRecord): JobDescriptionDto {
  return {
    id: row.id,
    userId: row.userId,
    department: row.department,
    position: row.position,
    positionDescription: row.positionDescription,
    salaryRange: row.salaryRange,
    workLocations: mapWorkLocations(row.workLocations),
    tone: row.tone as JDTone,
    status: row.status as JDStatus,
    content: row.content as JD,
    evaluation: row.evaluation ? (row.evaluation as EvaluationResult) : null,
    generationMeta: row.generationMeta ? (row.generationMeta as JDAgentResponse['meta']) : null,
    createdAt: row.createdAt.toISOString(),
    updatedAt: row.updatedAt.toISOString(),
  };
}

export async function createJobDescription(
  params: CreateJobDescriptionParams,
): Promise<JobDescriptionDto> {
  const row = await prisma.jobDescription.create({
    data: {
      userId: params.userId,
      department: params.department,
      position: params.position,
      positionDescription: params.positionDescription,
      salaryRange: params.salaryRange ?? null,
      workLocations:
        params.workLocations === undefined || params.workLocations === null
          ? Prisma.JsonNull
          : toJson(params.workLocations),
      tone: params.tone,
      status: params.status ?? 'created',
      content: toJson(params.content),
      evaluation: toNullableJson(params.evaluation),
      generationMeta: toNullableJson(params.generationMeta),
    },
  });
  return mapRow(row);
}

export async function listJobDescriptionsPaginated(params: {
  userId: string;
  limit: number;
  offset: number;
  status?: JDStatus;
}): Promise<JobDescriptionDto[]> {
  const rows = await prisma.jobDescription.findMany({
    where: { userId: params.userId, ...(params.status ? { status: params.status } : {}) },
    orderBy: { updatedAt: 'desc' },
    skip: params.offset,
    take: params.limit,
  });
  return rows.map(mapRow);
}

export async function countJobDescriptions(userId: string, status?: JDStatus): Promise<number> {
  return prisma.jobDescription.count({
    where: { userId, ...(status ? { status } : {}) },
  });
}

export async function getJobDescriptionById(
  userId: string,
  id: string,
): Promise<JobDescriptionDto | null> {
  const row = await prisma.jobDescription.findFirst({
    where: { id, userId },
  });
  return row ? mapRow(row) : null;
}

export async function updateJobDescription(
  params: UpdateJobDescriptionParams,
): Promise<JobDescriptionDto | null> {
  const data: Prisma.JobDescriptionUpdateManyMutationInput = {};
  if (params.department !== undefined) data.department = params.department;
  if (params.position !== undefined) data.position = params.position;
  if (params.positionDescription !== undefined) {
    data.positionDescription = params.positionDescription;
  }
  if (params.salaryRange !== undefined) data.salaryRange = params.salaryRange;
  if (params.workLocations !== undefined) data.workLocations = toJson(params.workLocations);
  if (params.tone !== undefined) data.tone = params.tone;
  if (params.status !== undefined) data.status = params.status;
  if (params.content !== undefined) data.content = toJson(params.content);
  if (params.evaluation !== undefined) data.evaluation = toNullableJson(params.evaluation);
  if (params.generationMeta !== undefined) {
    data.generationMeta = toNullableJson(params.generationMeta);
  }

  const result = await prisma.jobDescription.updateMany({
    where: { id: params.id, userId: params.userId },
    data,
  });
  if (result.count === 0) {
    return null;
  }
  return getJobDescriptionById(params.userId, params.id);
}
