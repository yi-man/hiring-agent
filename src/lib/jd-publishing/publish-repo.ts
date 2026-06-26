import { Prisma } from '@prisma/client';
import { prisma } from '@/lib/prisma';
import type {
  PublishPlatform,
  PublishSkill,
  PublishSkillMeta,
  PublishStep,
  PublishTaskDto,
  PublishTaskStatus,
  PublishTrace,
  PublishTraceStep,
} from './types';

type PublishSkillRecord = {
  id: string;
  name: string;
  platform: string;
  description: string;
  version: number;
  isActive: boolean;
  inputSchema: unknown;
  variables: unknown;
  steps: unknown;
  meta: unknown | null;
  createdAt: Date;
  updatedAt: Date;
};

type PublishTraceRecord = {
  taskId: string;
  skillId: string;
  status: string;
  steps: unknown;
  createdAt: Date;
};

type PublishTaskRecord = {
  id: string;
  userId: string;
  jobDescriptionId: string;
  skillId: string;
  platform: string;
  input: unknown;
  currentStep: string | null;
  status: string;
  errorMessage: string | null;
  trace: PublishTraceRecord | null;
  createdAt: Date;
  updatedAt: Date;
};

function toJson(value: unknown): Prisma.InputJsonValue {
  return value as Prisma.InputJsonValue;
}

function toRecord(value: unknown): Record<string, unknown> {
  return value && typeof value === 'object' && !Array.isArray(value)
    ? (value as Record<string, unknown>)
    : {};
}

function toSkillMeta(value: unknown): PublishSkillMeta | undefined {
  const record = toRecord(value);
  return Object.keys(record).length > 0 ? (record as PublishSkillMeta) : undefined;
}

function mapSkill(row: PublishSkillRecord): PublishSkill {
  return {
    id: row.id,
    name: row.name,
    platform: row.platform as PublishPlatform,
    description: row.description,
    version: row.version,
    isActive: row.isActive,
    inputSchema: toRecord(row.inputSchema),
    variables: toRecord(row.variables),
    steps: Array.isArray(row.steps) ? (row.steps as PublishSkill['steps']) : [],
    meta: toSkillMeta(row.meta),
  };
}

function skillCreateData(skill: PublishSkill): Prisma.PublishSkillCreateInput {
  return {
    id: skill.id,
    name: skill.name,
    platform: skill.platform,
    description: skill.description,
    version: skill.version,
    isActive: skill.isActive,
    inputSchema: toJson(skill.inputSchema),
    variables: toJson(skill.variables),
    steps: toJson(skill.steps),
    meta: toJson(skill.meta ?? {}),
  };
}

function mapTrace(row: PublishTraceRecord | null): PublishTrace | null {
  if (!row) return null;
  return {
    taskId: row.taskId,
    skillId: row.skillId,
    status: row.status as 'success' | 'failed',
    steps: Array.isArray(row.steps) ? (row.steps as PublishTraceStep[]) : [],
    createdAt: row.createdAt.toISOString(),
  };
}

function mapTask(row: PublishTaskRecord): PublishTaskDto {
  return {
    id: row.id,
    userId: row.userId,
    jobDescriptionId: row.jobDescriptionId,
    skillId: row.skillId,
    platform: row.platform as PublishPlatform,
    input: toRecord(row.input),
    currentStep: row.currentStep,
    status: row.status as PublishTaskStatus,
    errorMessage: row.errorMessage,
    trace: mapTrace(row.trace),
    createdAt: row.createdAt.toISOString(),
    updatedAt: row.updatedAt.toISOString(),
  };
}

export async function upsertDefaultPublishSkill(skill: PublishSkill): Promise<PublishSkill> {
  const row = await prisma.publishSkill.upsert({
    where: {
      name_platform_version: {
        name: skill.name,
        platform: skill.platform,
        version: skill.version,
      },
    },
    create: {
      id: skill.id,
      name: skill.name,
      platform: skill.platform,
      description: skill.description,
      version: skill.version,
      isActive: skill.isActive,
      inputSchema: toJson(skill.inputSchema),
      variables: toJson(skill.variables),
      steps: toJson(skill.steps),
      meta: toJson({ success_rate: 0, usage_count: 0, created_from: 'agent' }),
    },
    update: {
      description: skill.description,
      isActive: skill.isActive,
      inputSchema: toJson(skill.inputSchema),
      variables: toJson(skill.variables),
      steps: toJson(skill.steps),
    },
  });
  return mapSkill(row);
}

export async function createExploredPublishSkill(skill: PublishSkill): Promise<PublishSkill> {
  await prisma.publishSkill.updateMany({
    where: { name: skill.name, platform: skill.platform, isActive: true },
    data: { isActive: false },
  });
  const latest = await prisma.publishSkill.findFirst({
    where: { name: skill.name, platform: skill.platform },
    orderBy: [{ version: 'desc' }, { updatedAt: 'desc' }],
  });
  const nextVersion = latest ? Math.max(skill.version, latest.version + 1) : skill.version;
  const row = await prisma.publishSkill.create({
    data: skillCreateData({
      ...skill,
      version: nextVersion,
      isActive: true,
      meta: skill.meta ?? { success_rate: 0, usage_count: 0, created_from: 'explore' },
    }),
  });
  return mapSkill(row);
}

export async function createNextActivePublishSkillVersion(params: {
  previousSkill: PublishSkill;
  steps: PublishStep[];
  meta?: PublishSkillMeta;
}): Promise<PublishSkill> {
  const { previousSkill, steps } = params;
  await prisma.publishSkill.updateMany({
    where: { name: previousSkill.name, platform: previousSkill.platform, isActive: true },
    data: { isActive: false },
  });
  const nextSkill: PublishSkill = {
    ...previousSkill,
    id: `${previousSkill.name}-${previousSkill.platform}-v${previousSkill.version + 1}`,
    version: previousSkill.version + 1,
    isActive: true,
    steps,
    meta: params.meta ?? { success_rate: 0, usage_count: 0, created_from: 'agent' },
  };
  const row = await prisma.publishSkill.create({ data: skillCreateData(nextSkill) });
  return mapSkill(row);
}

export async function getActivePublishSkillFromDb(
  platform: PublishPlatform,
): Promise<PublishSkill | null> {
  const row = await prisma.publishSkill.findFirst({
    where: { name: 'publish_jd', platform, isActive: true },
    orderBy: [{ version: 'desc' }, { updatedAt: 'desc' }],
  });
  return row ? mapSkill(row) : null;
}

export async function createPublishTask(params: {
  userId: string;
  jobDescriptionId: string;
  skillId: string;
  platform: PublishPlatform;
  input: Record<string, unknown>;
  currentStep: string | null;
}): Promise<PublishTaskDto> {
  const row = await prisma.jobPublishTask.create({
    data: {
      userId: params.userId,
      jobDescriptionId: params.jobDescriptionId,
      skillId: params.skillId,
      platform: params.platform,
      input: toJson(params.input),
      currentStep: params.currentStep,
      status: 'running',
    },
    include: { trace: true },
  });
  return mapTask(row);
}

export async function completePublishTask(params: {
  taskId: string;
  skillId: string;
  status: 'success' | 'failed';
  steps: PublishTraceStep[];
  errorMessage?: string | null;
}): Promise<void> {
  await prisma.jobPublishTask.update({
    where: { id: params.taskId },
    data: {
      status: params.status,
      currentStep: null,
      errorMessage: params.errorMessage ?? null,
    },
  });
  await prisma.jobPublishTrace.create({
    data: {
      taskId: params.taskId,
      skillId: params.skillId,
      status: params.status,
      steps: toJson(params.steps),
    },
  });
}

export async function listPublishTasksForJobDescription(params: {
  userId: string;
  jobDescriptionId: string;
  limit: number;
}): Promise<PublishTaskDto[]> {
  const rows = await prisma.jobPublishTask.findMany({
    where: { userId: params.userId, jobDescriptionId: params.jobDescriptionId },
    orderBy: { createdAt: 'desc' },
    take: params.limit,
    include: { trace: true },
  });
  return rows.map(mapTask);
}
