import { Prisma } from '@prisma/client';
import { prisma } from '@/lib/prisma';
import {
  getWorkflowExecutionStatsBySkillId,
  isEffectiveWorkflowVersion,
} from '@/lib/workflows/execution-stats';
import { BROWSER_WORKFLOW_DSL_VERSION } from './types';
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
  siteFingerprint: string;
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
  batchId: string | null;
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
    siteFingerprint: row.siteFingerprint,
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
    siteFingerprint: skill.siteFingerprint ?? 'default',
    description: skill.description,
    version: skill.version,
    isActive: skill.isActive,
    inputSchema: toJson(skill.inputSchema),
    variables: toJson(skill.variables),
    steps: toJson(skill.steps),
    meta: toJson(skill.meta ?? {}),
  };
}

const PUBLISH_SKILL_VERSION_WRITE_MAX_ATTEMPTS = 3;

function isRetryablePublishSkillVersionWriteError(error: unknown): boolean {
  const code = (error as { code?: unknown } | null)?.code;
  return code === 'P2002' || code === 'P2034';
}

async function retryPublishSkillVersionWrite<T>(operation: () => Promise<T>): Promise<T> {
  for (let attempt = 0; attempt < PUBLISH_SKILL_VERSION_WRITE_MAX_ATTEMPTS; attempt += 1) {
    try {
      return await operation();
    } catch (error) {
      const isLastAttempt = attempt === PUBLISH_SKILL_VERSION_WRITE_MAX_ATTEMPTS - 1;
      if (isLastAttempt || !isRetryablePublishSkillVersionWriteError(error)) {
        throw error;
      }
    }
  }

  throw new Error('publish_skill_version_write_retry_exhausted');
}

async function lockPublishSkillVersion(
  tx: Prisma.TransactionClient,
  skill: Pick<PublishSkill, 'name' | 'platform' | 'siteFingerprint'>,
): Promise<void> {
  const scope = `${skill.platform}:${skill.siteFingerprint ?? 'default'}`;
  await tx.$executeRaw`
    SELECT pg_advisory_xact_lock(hashtext(${skill.name}), hashtext(${scope}))
  `;
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
    batchId: row.batchId,
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
  const meta = skill.meta ?? { success_rate: 0, usage_count: 0, created_from: 'agent' };
  const row = await prisma.publishSkill.upsert({
    where: {
      name_platform_siteFingerprint_version: {
        name: skill.name,
        platform: skill.platform,
        siteFingerprint: skill.siteFingerprint ?? 'default',
        version: skill.version,
      },
    },
    create: {
      id: skill.id,
      name: skill.name,
      platform: skill.platform,
      siteFingerprint: skill.siteFingerprint ?? 'default',
      description: skill.description,
      version: skill.version,
      isActive: skill.isActive,
      inputSchema: toJson(skill.inputSchema),
      variables: toJson(skill.variables),
      steps: toJson(skill.steps),
      meta: toJson(meta),
    },
    update: {
      description: skill.description,
      isActive: skill.isActive,
      inputSchema: toJson(skill.inputSchema),
      variables: toJson(skill.variables),
      steps: toJson(skill.steps),
      meta: toJson(meta),
    },
  });
  return mapSkill(row);
}

export async function createExploredPublishSkill(skill: PublishSkill): Promise<PublishSkill> {
  return retryPublishSkillVersionWrite(() =>
    prisma.$transaction(async (tx) => {
      await lockPublishSkillVersion(tx, skill);
      const latest = await tx.publishSkill.findFirst({
        where: {
          name: skill.name,
          platform: skill.platform,
          siteFingerprint: skill.siteFingerprint ?? 'default',
        },
        orderBy: [{ version: 'desc' }, { updatedAt: 'desc' }],
      });
      const nextVersion = latest ? Math.max(skill.version, latest.version + 1) : skill.version;
      const row = await tx.publishSkill.create({
        data: skillCreateData({
          ...skill,
          version: nextVersion,
          isActive: true,
          meta: skill.meta ?? { success_rate: 0, usage_count: 0, created_from: 'explore' },
        }),
      });
      await tx.publishSkill.updateMany({
        where: {
          name: skill.name,
          platform: skill.platform,
          siteFingerprint: skill.siteFingerprint ?? 'default',
          isActive: true,
          id: { not: row.id },
        },
        data: { isActive: false },
      });
      return mapSkill(row);
    }),
  );
}

export async function createNextActivePublishSkillVersion(params: {
  previousSkill: PublishSkill;
  steps: PublishStep[];
  meta?: PublishSkillMeta;
}): Promise<PublishSkill> {
  const { previousSkill, steps } = params;
  return retryPublishSkillVersionWrite(() =>
    prisma.$transaction(async (tx) => {
      await lockPublishSkillVersion(tx, previousSkill);
      const latest = await tx.publishSkill.findFirst({
        where: {
          name: previousSkill.name,
          platform: previousSkill.platform,
          siteFingerprint: previousSkill.siteFingerprint ?? 'default',
        },
        orderBy: [{ version: 'desc' }, { updatedAt: 'desc' }],
      });
      const version = Math.max(previousSkill.version + 1, (latest?.version ?? 0) + 1);
      const nextSkill: PublishSkill = {
        ...previousSkill,
        id: `${previousSkill.name}-${previousSkill.platform}-${previousSkill.siteFingerprint ?? 'default'}-v${version}`,
        version,
        isActive: true,
        steps,
        meta: params.meta ?? { success_rate: 0, usage_count: 0, created_from: 'agent' },
      };
      const row = await tx.publishSkill.create({ data: skillCreateData(nextSkill) });
      await tx.publishSkill.updateMany({
        where: {
          name: previousSkill.name,
          platform: previousSkill.platform,
          siteFingerprint: previousSkill.siteFingerprint ?? 'default',
          isActive: true,
          id: { not: row.id },
        },
        data: { isActive: false },
      });
      return mapSkill(row);
    }),
  );
}

export async function getActivePublishSkillByName(params: {
  name: string;
  platform: PublishPlatform;
  siteFingerprint?: string;
}): Promise<PublishSkill | null> {
  const row = await prisma.publishSkill.findFirst({
    where: {
      name: params.name,
      platform: params.platform,
      siteFingerprint: params.siteFingerprint ?? 'default',
      isActive: true,
    },
    orderBy: [{ version: 'desc' }, { updatedAt: 'desc' }],
  });
  if (!row) return null;

  const statsBySkillId = await getWorkflowExecutionStatsBySkillId([row.id]);
  return isEffectiveWorkflowVersion(statsBySkillId.get(row.id)) ? mapSkill(row) : null;
}

export function isBrowserV2Skill(skill: Pick<PublishSkill, 'meta'>): boolean {
  return skill.meta?.dsl_version === BROWSER_WORKFLOW_DSL_VERSION;
}

export async function getActiveBrowserV2SkillByName(params: {
  name: string;
  platform: PublishPlatform;
  siteFingerprint?: string;
}): Promise<PublishSkill | null> {
  const active = await getActivePublishSkillByName(params);
  return active && isBrowserV2Skill(active) ? active : null;
}

export function getActivePublishSkillFromDb(
  platform: PublishPlatform,
  siteFingerprint = 'default',
): Promise<PublishSkill | null> {
  return getActivePublishSkillByName({ name: 'publish_jd', platform, siteFingerprint });
}

export async function createPublishTask(params: {
  userId: string;
  jobDescriptionId: string;
  batchId: string;
  skillId: string;
  platform: PublishPlatform;
  input: Record<string, unknown>;
  currentStep: string | null;
}): Promise<PublishTaskDto> {
  const row = await prisma.jobPublishTask.create({
    data: {
      userId: params.userId,
      jobDescriptionId: params.jobDescriptionId,
      batchId: params.batchId,
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

export async function updatePublishTaskCurrentStep(params: {
  taskId: string;
  userId: string;
  jobDescriptionId: string;
  batchId: string | null;
  expectedCurrentStep: string | null;
  currentStep: string | null;
  now?: Date;
}): Promise<boolean> {
  if (!params.batchId) return false;
  const result = await prisma.jobPublishTask.updateMany({
    where: {
      id: params.taskId,
      userId: params.userId,
      jobDescriptionId: params.jobDescriptionId,
      batchId: params.batchId,
      status: 'running',
      currentStep: params.expectedCurrentStep,
      jobDescription: {
        status: 'publishing',
        activePublishBatchId: params.batchId,
        publishLeaseExpiresAt: { gt: params.now ?? new Date() },
      },
    },
    data: { currentStep: params.currentStep },
  });
  return result.count === 1;
}

export async function completePublishTask(params: {
  taskId: string;
  userId: string;
  jobDescriptionId: string;
  batchId: string | null;
  skillId: string;
  status: 'success' | 'failed';
  steps: PublishTraceStep[];
  errorMessage?: string | null;
  now?: Date;
}): Promise<boolean> {
  if (!params.batchId) return false;
  const now = params.now ?? new Date();
  return prisma.$transaction(async (tx) => {
    const completed = await tx.jobPublishTask.updateMany({
      where: {
        id: params.taskId,
        userId: params.userId,
        jobDescriptionId: params.jobDescriptionId,
        batchId: params.batchId,
        skillId: params.skillId,
        status: 'running',
        currentStep: null,
        jobDescription: {
          status: 'publishing',
          activePublishBatchId: params.batchId,
          publishLeaseExpiresAt: { gt: now },
        },
      },
      data: {
        status: params.status,
        currentStep: null,
        errorMessage: params.errorMessage ?? null,
      },
    });
    if (completed.count === 0) return false;

    await tx.jobPublishTrace.create({
      data: {
        taskId: params.taskId,
        skillId: params.skillId,
        status: params.status,
        steps: toJson(params.steps),
      },
    });
    return true;
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
