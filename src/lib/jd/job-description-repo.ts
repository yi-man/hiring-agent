import { Prisma } from '@prisma/client';
import {
  STALE_CANDIDATE_ACTION_ERROR_MESSAGE,
  STALE_CANDIDATE_ACTION_TIMEOUT_MS,
} from '@/lib/candidate-screening/repo';
import { prisma } from '@/lib/prisma';
import { getJobDescriptionPublishConflict } from '@/lib/jd-publishing/publish-eligibility';
import type {
  EvaluationResult,
  JD,
  JDAgentResponse,
  JobDescriptionLifecycleRequest,
  JDStatus,
  JDTone,
  JobDescriptionDto,
} from '@/types';
import { normalizeInterviewProcess } from '@/lib/interviews/process';
import type { InterviewProcess } from '@/lib/interviews/types';

type JobDescriptionRecord = {
  id: string;
  userId: string;
  department: string;
  position: string;
  positionDescription: string;
  salaryRange: string | null;
  workLocations: unknown | null;
  hiringTarget: number | null;
  activePublishBatchId: string | null;
  publishLeaseExpiresAt: Date | null;
  tone: string;
  status: string;
  content: unknown;
  evaluation: unknown | null;
  generationMeta: unknown | null;
  interviewProcess: unknown | null;
  createdAt: Date;
  updatedAt: Date;
  _count?: { candidateScreeningResults: number };
};

type JobDescriptionDbClient = Pick<
  Prisma.TransactionClient,
  'jobDescription' | 'jobDescriptionPublishRun' | 'jobDescriptionPublishRunEvent' | 'jobPublishTask'
>;

export const JOB_DESCRIPTION_PUBLISH_LEASE_MS = 10 * 60 * 1000;
export const JOB_DESCRIPTION_PUBLISH_HEARTBEAT_MS = 30 * 1000;
export const STALE_JOB_DESCRIPTION_PUBLISH_ERROR_MESSAGE =
  '发布服务中断，发布结果可能不确定。请先到对应招聘平台核对，再重新发布。';

const onboardedCountInclude = {
  _count: {
    select: {
      candidateScreeningResults: { where: { interviewStage: 'onboarded' } },
    },
  },
} satisfies Prisma.JobDescriptionInclude;

type CreateJobDescriptionParams = {
  userId: string;
  department: string;
  position: string;
  positionDescription: string;
  salaryRange?: string | null;
  workLocations?: string[] | null;
  hiringTarget?: number;
  tone: JDTone;
  status?: JDStatus;
  content: JD;
  evaluation: EvaluationResult | null;
  generationMeta: JDAgentResponse['meta'] | null;
  interviewProcess?: InterviewProcess | null;
};

export type UpdateJobDescriptionParams = {
  userId: string;
  id: string;
  department?: string;
  position?: string;
  positionDescription?: string;
  salaryRange?: string | null;
  workLocations?: string[];
  hiringTarget?: number;
  tone?: JDTone;
  status?: JDStatus;
  content?: JD;
  evaluation?: EvaluationResult | null;
  generationMeta?: JDAgentResponse['meta'] | null;
  interviewProcess?: InterviewProcess | null;
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
    hiringTarget: row.hiringTarget ?? null,
    onboardedCount: row._count?.candidateScreeningResults ?? 0,
    tone: row.tone as JDTone,
    status: row.status as JDStatus,
    content: row.content as JD,
    evaluation: row.evaluation ? (row.evaluation as EvaluationResult) : null,
    generationMeta: row.generationMeta ? (row.generationMeta as JDAgentResponse['meta']) : null,
    interviewProcess: normalizeInterviewProcess(row.interviewProcess),
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
      ...(params.hiringTarget === undefined ? {} : { hiringTarget: params.hiringTarget }),
      tone: params.tone,
      status: params.status ?? 'created',
      content: toJson(params.content),
      evaluation: toNullableJson(params.evaluation),
      generationMeta: toNullableJson(params.generationMeta),
      interviewProcess: toNullableJson(params.interviewProcess ?? null),
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
    include: onboardedCountInclude,
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
  return getJobDescriptionByIdWithClient(prisma, userId, id);
}

async function getJobDescriptionByIdWithClient(
  client: JobDescriptionDbClient,
  userId: string,
  id: string,
): Promise<JobDescriptionDto | null> {
  const row = await getJobDescriptionRecordWithClient(client, userId, id);
  return row ? mapRow(row) : null;
}

async function getJobDescriptionRecordWithClient(
  client: JobDescriptionDbClient,
  userId: string,
  id: string,
): Promise<JobDescriptionRecord | null> {
  return client.jobDescription.findFirst({
    where: { id, userId },
    include: onboardedCountInclude,
  });
}

function buildUpdateData(
  params: UpdateJobDescriptionParams,
): Prisma.JobDescriptionUpdateManyMutationInput {
  const data: Prisma.JobDescriptionUpdateManyMutationInput = {};
  if (params.department !== undefined) data.department = params.department;
  if (params.position !== undefined) data.position = params.position;
  if (params.positionDescription !== undefined) {
    data.positionDescription = params.positionDescription;
  }
  if (params.salaryRange !== undefined) data.salaryRange = params.salaryRange;
  if (params.workLocations !== undefined) data.workLocations = toJson(params.workLocations);
  if (params.hiringTarget !== undefined) data.hiringTarget = params.hiringTarget;
  if (params.tone !== undefined) data.tone = params.tone;
  if (params.status !== undefined) data.status = params.status;
  if (params.content !== undefined) data.content = toJson(params.content);
  if (params.evaluation !== undefined) data.evaluation = toNullableJson(params.evaluation);
  if (params.generationMeta !== undefined) {
    data.generationMeta = toNullableJson(params.generationMeta);
  }
  if (params.interviewProcess !== undefined) {
    data.interviewProcess = toNullableJson(params.interviewProcess);
  }
  return data;
}

export async function updateJobDescription(
  params: UpdateJobDescriptionParams,
): Promise<JobDescriptionDto | null> {
  const result = await prisma.jobDescription.updateMany({
    where: { id: params.id, userId: params.userId },
    data: buildUpdateData(params),
  });
  if (result.count === 0) {
    return null;
  }
  return getJobDescriptionById(params.userId, params.id);
}

export async function updateMutableJobDescription(
  params: UpdateJobDescriptionParams,
): Promise<JobDescriptionDto | null> {
  const result = await prisma.jobDescription.updateMany({
    where: {
      id: params.id,
      userId: params.userId,
      status: { in: ['created', 'ready_to_publish', 'publish_failed'] },
    },
    data: buildUpdateData(params),
  });
  if (result.count === 0) {
    return null;
  }
  return getJobDescriptionById(params.userId, params.id);
}

export type UpdateJobDescriptionLifecycleParams = {
  userId: string;
  id: string;
  expectedStatus: JDStatus;
  status: JDStatus;
  hiringTarget?: number;
  activePublishBatchId?: string | null;
  publishLeaseExpiresAt?: Date | null;
};

async function updateJobDescriptionLifecycleWithClient(
  client: JobDescriptionDbClient,
  params: UpdateJobDescriptionLifecycleParams,
): Promise<JobDescriptionDto | null> {
  const data: Prisma.JobDescriptionUpdateManyMutationInput = { status: params.status };
  if (params.hiringTarget !== undefined) {
    data.hiringTarget = params.hiringTarget;
  }
  if (params.activePublishBatchId !== undefined) {
    data.activePublishBatchId = params.activePublishBatchId;
  }
  if (params.publishLeaseExpiresAt !== undefined) {
    data.publishLeaseExpiresAt = params.publishLeaseExpiresAt;
  }
  const result = await client.jobDescription.updateMany({
    where: { id: params.id, userId: params.userId, status: params.expectedStatus },
    data,
  });
  if (result.count === 0) {
    return null;
  }
  return getJobDescriptionByIdWithClient(client, params.userId, params.id);
}

export async function updateJobDescriptionLifecycle(
  params: UpdateJobDescriptionLifecycleParams,
): Promise<JobDescriptionDto | null> {
  return updateJobDescriptionLifecycleWithClient(prisma, params);
}

function publishLeaseExpiry(now: Date): Date {
  return new Date(now.getTime() + JOB_DESCRIPTION_PUBLISH_LEASE_MS);
}

function isPublishLeaseExpired(record: JobDescriptionRecord, now: Date): boolean {
  return !record.publishLeaseExpiresAt || record.publishLeaseExpiresAt.getTime() <= now.getTime();
}

async function recoverLockedJobDescriptionPublishing(
  tx: Prisma.TransactionClient,
  record: JobDescriptionRecord,
  now: Date,
): Promise<JobDescriptionDto> {
  const current = mapRow(record);
  if (current.status !== 'publishing') return current;

  const batchId = record.activePublishBatchId;
  let runs = batchId
    ? await tx.jobDescriptionPublishRun.findMany({
        where: {
          userId: record.userId,
          jobDescriptionId: record.id,
          batchId,
        },
        select: { id: true, userId: true, platform: true, status: true, updatedAt: true },
      })
    : [];
  const tasks = batchId
    ? await tx.jobPublishTask.findMany({
        where: {
          userId: record.userId,
          jobDescriptionId: record.id,
          batchId,
        },
        select: {
          id: true,
          platform: true,
          skillId: true,
          status: true,
          errorMessage: true,
          updatedAt: true,
        },
      })
    : [];

  if (batchId) {
    const repairEvents: Array<{
      userId: string;
      runId: string;
      stage: string;
      level: string;
      message: string;
      detail: { taskId: string };
    }> = [];
    for (const task of tasks) {
      if (task.status !== 'success' && task.status !== 'failed') continue;
      const matchingRunIds = runs
        .filter(
          (run) =>
            run.platform === task.platform &&
            (run.status === 'pending' || run.status === 'running'),
        )
        .map((run) => run.id);
      if (matchingRunIds.length === 0) continue;
      const repaired = await tx.jobDescriptionPublishRun.updateMany({
        where: {
          id: { in: matchingRunIds },
          userId: record.userId,
          jobDescriptionId: record.id,
          batchId,
          status: { in: ['pending', 'running'] },
        },
        data: {
          status: task.status,
          currentStage: 'completed',
          publishTaskId: task.id,
          skillId: task.skillId,
          errorMessage: task.status === 'failed' ? task.errorMessage : null,
          finishedAt: now,
        },
      });
      if (repaired.count > 0) {
        repairEvents.push(
          ...matchingRunIds.map((runId) => ({
            userId: record.userId,
            runId,
            stage: 'completed',
            level: task.status === 'success' ? 'success' : 'error',
            message: task.status === 'success' ? '发布成功（已恢复）' : '发布失败（已恢复）',
            detail: { taskId: task.id },
          })),
        );
      }
    }
    if (repairEvents.length > 0) {
      await tx.jobDescriptionPublishRunEvent.createMany({ data: repairEvents });
      runs = await tx.jobDescriptionPublishRun.findMany({
        where: {
          userId: record.userId,
          jobDescriptionId: record.id,
          batchId,
        },
        select: { id: true, userId: true, platform: true, status: true, updatedAt: true },
      });
    }
  }
  const evidence = [...runs, ...tasks];
  const hasSuccess = evidence.some((item) => item.status === 'success');
  const hasNonTerminal = evidence.some(
    (item) => item.status === 'pending' || item.status === 'running',
  );

  const allEvidenceTerminal = evidence.length > 0 && !hasNonTerminal;
  if (!allEvidenceTerminal && !isPublishLeaseExpired(record, now)) return current;

  if (batchId && hasNonTerminal) {
    const activeRunIds = runs
      .filter((run) => run.status === 'pending' || run.status === 'running')
      .map((run) => run.id);
    await tx.jobDescriptionPublishRun.updateMany({
      where: {
        userId: record.userId,
        jobDescriptionId: record.id,
        batchId,
        status: { in: ['pending', 'running'] },
      },
      data: {
        status: 'failed',
        currentStage: 'completed',
        errorMessage: STALE_JOB_DESCRIPTION_PUBLISH_ERROR_MESSAGE,
        finishedAt: now,
      },
    });
    await tx.jobPublishTask.updateMany({
      where: {
        userId: record.userId,
        jobDescriptionId: record.id,
        batchId,
        status: 'running',
      },
      data: {
        status: 'failed',
        currentStep: null,
        errorMessage: STALE_JOB_DESCRIPTION_PUBLISH_ERROR_MESSAGE,
      },
    });
    if (activeRunIds.length > 0) {
      await tx.jobDescriptionPublishRunEvent.createMany({
        data: activeRunIds.map((runId) => ({
          userId: record.userId,
          runId,
          stage: 'completed',
          level: 'error',
          message: '发布任务因服务中断已停止',
          detail: { error: STALE_JOB_DESCRIPTION_PUBLISH_ERROR_MESSAGE },
        })),
      });
    }
  }

  return (
    (await updateJobDescriptionLifecycleWithClient(tx, {
      userId: record.userId,
      id: record.id,
      expectedStatus: 'publishing',
      status: hasSuccess
        ? current.hiringTarget !== null && current.onboardedCount >= current.hiringTarget
          ? 'filled'
          : 'published'
        : 'publish_failed',
      activePublishBatchId: null,
      publishLeaseExpiresAt: null,
    })) ?? current
  );
}

export async function recoverStaleJobDescriptionPublishing(params: {
  userId: string;
  id: string;
  now?: Date;
}): Promise<JobDescriptionDto | null> {
  return prisma.$transaction(async (tx) => {
    await tx.$queryRaw`SELECT "id" FROM "job_descriptions" WHERE "id" = ${params.id} AND "user_id" = ${params.userId} FOR UPDATE`;
    const record = await getJobDescriptionRecordWithClient(tx, params.userId, params.id);
    if (!record) return null;
    return recoverLockedJobDescriptionPublishing(tx, record, params.now ?? new Date());
  });
}

export async function reconcileJobDescriptionPublishingForUser(params: {
  userId: string;
  now?: Date;
}): Promise<number> {
  const now = params.now ?? new Date();
  const stale = await prisma.jobDescription.findMany({
    where: {
      userId: params.userId,
      status: 'publishing',
    },
    select: { id: true },
    orderBy: { publishLeaseExpiresAt: 'asc' },
    take: 20,
  });
  const recovered = await Promise.all(
    stale.map((item) =>
      recoverStaleJobDescriptionPublishing({ userId: params.userId, id: item.id, now }),
    ),
  );
  return recovered.filter((item) => item && item.status !== 'publishing').length;
}

export async function renewJobDescriptionPublishLease(params: {
  userId: string;
  id: string;
  batchId: string;
  now?: Date;
}): Promise<boolean> {
  const expiresAt = publishLeaseExpiry(params.now ?? new Date());
  const updated = await prisma.$executeRaw`
    UPDATE "job_descriptions"
    SET "publish_lease_expires_at" = ${expiresAt}
    WHERE "id" = ${params.id}
      AND "user_id" = ${params.userId}
      AND "status" = 'publishing'
      AND "active_publish_batch_id" = ${params.batchId}
  `;
  return updated === 1;
}

export async function runWithJobDescriptionPublishLease<T>(params: {
  userId: string;
  id: string;
  batchId: string;
  operation: () => Promise<T>;
}): Promise<T> {
  const renewed = await renewJobDescriptionPublishLease(params);
  if (!renewed) throw new Error('job description publish lease is no longer active');

  const heartbeat = setInterval(() => {
    void renewJobDescriptionPublishLease(params).catch((error) => {
      console.error('Failed to renew JD publish lease', {
        id: params.id,
        batchId: params.batchId,
        error,
      });
    });
  }, JOB_DESCRIPTION_PUBLISH_HEARTBEAT_MS);
  heartbeat.unref?.();
  try {
    return await params.operation();
  } finally {
    clearInterval(heartbeat);
  }
}

export type ClaimJobDescriptionForPublishingResult =
  | { ok: true; jobDescription: JobDescriptionDto }
  | {
      ok: false;
      reason: 'not_found' | 'conflict' | 'concurrent_update';
      conflict?: string;
      jobDescription?: JobDescriptionDto;
    };

export async function claimJobDescriptionForPublishing(params: {
  userId: string;
  id: string;
  batchId: string;
  now?: Date;
}): Promise<ClaimJobDescriptionForPublishingResult> {
  return prisma.$transaction(async (tx): Promise<ClaimJobDescriptionForPublishingResult> => {
    await tx.$queryRaw`SELECT "id" FROM "job_descriptions" WHERE "id" = ${params.id} AND "user_id" = ${params.userId} FOR UPDATE`;
    const record = await getJobDescriptionRecordWithClient(tx, params.userId, params.id);
    if (!record) return { ok: false, reason: 'not_found' };

    let current = mapRow(record);
    if (current.status === 'publishing') {
      current = await recoverLockedJobDescriptionPublishing(tx, record, params.now ?? new Date());
    }
    const conflict = getJobDescriptionPublishConflict(current);
    if (conflict) {
      if (conflict !== 'hiring target has already been reached') {
        return { ok: false, reason: 'conflict', conflict, jobDescription: current };
      }

      const filled = await updateJobDescriptionLifecycleWithClient(tx, {
        userId: params.userId,
        id: params.id,
        expectedStatus: current.status,
        status: 'filled',
        activePublishBatchId: null,
        publishLeaseExpiresAt: null,
      });
      if (!filled) return { ok: false, reason: 'concurrent_update' };
      return { ok: false, reason: 'conflict', conflict, jobDescription: filled };
    }

    const claimed = await updateJobDescriptionLifecycleWithClient(tx, {
      userId: params.userId,
      id: params.id,
      expectedStatus: current.status,
      status: 'publishing',
      activePublishBatchId: params.batchId,
      publishLeaseExpiresAt: publishLeaseExpiry(params.now ?? new Date()),
    });
    return claimed
      ? { ok: true, jobDescription: claimed }
      : { ok: false, reason: 'concurrent_update' };
  });
}

export type ApplyJobDescriptionLifecycleResult =
  | { ok: true; changed: boolean; jobDescription: JobDescriptionDto }
  | {
      ok: false;
      reason:
        | 'not_found'
        | 'invalid_transition'
        | 'hiring_target_required'
        | 'hiring_target_reached'
        | 'operation_in_progress'
        | 'concurrent_update';
    };

async function hasRunningCandidateOutreach(
  tx: Prisma.TransactionClient,
  params: { userId: string; jobDescriptionId: string },
): Promise<boolean> {
  const activeMessageProcessing = await tx.candidateConversationMessage.findFirst({
    where: {
      userId: params.userId,
      jobDescriptionId: params.jobDescriptionId,
      role: 'candidate',
      processingOutcome: 'in_flight',
      processedAt: null,
      processingLeaseExpiresAt: { gt: new Date() },
    },
    select: { id: true },
  });
  if (activeMessageProcessing) return true;

  const staleBefore = new Date(Date.now() - STALE_CANDIDATE_ACTION_TIMEOUT_MS);
  await tx.candidateActionLog.updateMany({
    where: {
      userId: params.userId,
      jobDescriptionId: params.jobDescriptionId,
      status: 'running',
      updatedAt: { lt: staleBefore },
    },
    data: {
      status: 'failed',
      errorMessage: STALE_CANDIDATE_ACTION_ERROR_MESSAGE,
    },
  });
  return Boolean(
    await tx.candidateActionLog.findFirst({
      where: {
        userId: params.userId,
        jobDescriptionId: params.jobDescriptionId,
        status: 'running',
      },
      select: { id: true },
    }),
  );
}

export async function applyJobDescriptionLifecycle(params: {
  userId: string;
  id: string;
  request: JobDescriptionLifecycleRequest;
}): Promise<ApplyJobDescriptionLifecycleResult> {
  return prisma.$transaction(async (tx): Promise<ApplyJobDescriptionLifecycleResult> => {
    await tx.$queryRaw`SELECT "id" FROM "job_descriptions" WHERE "id" = ${params.id} AND "user_id" = ${params.userId} FOR UPDATE`;
    const record = await getJobDescriptionRecordWithClient(tx, params.userId, params.id);
    if (!record) {
      return { ok: false, reason: 'not_found' };
    }
    const current = mapRow(record);

    let status = current.status;
    let hiringTarget: number | undefined;
    let activePublishBatchId: string | null | undefined;
    let publishLeaseExpiresAt: Date | null | undefined;

    if (params.request.action === 'take_offline') {
      activePublishBatchId = null;
      publishLeaseExpiresAt = null;
      if (
        current.status === 'offline' &&
        record.activePublishBatchId === null &&
        record.publishLeaseExpiresAt === null
      ) {
        return { ok: true, changed: false, jobDescription: current };
      }
      if (
        current.status !== 'published' &&
        current.status !== 'filled' &&
        current.status !== 'offline'
      ) {
        return { ok: false, reason: 'invalid_transition' };
      }
      status = 'offline';
    } else if (params.request.action === 'archive') {
      activePublishBatchId = null;
      publishLeaseExpiresAt = null;
      if (
        current.status === 'archived' &&
        record.activePublishBatchId === null &&
        record.publishLeaseExpiresAt === null
      ) {
        return { ok: true, changed: false, jobDescription: current };
      }
      if (current.status !== 'offline' && current.status !== 'archived') {
        return { ok: false, reason: 'invalid_transition' };
      }
      status = 'archived';
    } else if (params.request.action === 'set_hiring_target') {
      if (!['published', 'filled', 'offline'].includes(current.status)) {
        return { ok: false, reason: 'invalid_transition' };
      }
      hiringTarget = params.request.hiringTarget;
      if (current.status === 'published' && current.onboardedCount >= hiringTarget) {
        status = 'filled';
        activePublishBatchId = null;
        publishLeaseExpiresAt = null;
      }
    } else {
      activePublishBatchId = null;
      publishLeaseExpiresAt = null;
      if (!['published', 'filled', 'offline'].includes(current.status)) {
        return { ok: false, reason: 'invalid_transition' };
      }
      const nextHiringTarget = params.request.hiringTarget ?? current.hiringTarget;
      if (nextHiringTarget === null) {
        return { ok: false, reason: 'hiring_target_required' };
      }
      if (current.onboardedCount >= nextHiringTarget) {
        return { ok: false, reason: 'hiring_target_reached' };
      }
      if (
        current.status === 'published' &&
        nextHiringTarget === current.hiringTarget &&
        record.activePublishBatchId === null &&
        record.publishLeaseExpiresAt === null
      ) {
        return { ok: true, changed: false, jobDescription: current };
      }
      status = 'published';
      hiringTarget = nextHiringTarget;
    }

    if (
      status !== current.status &&
      (status === 'filled' || status === 'offline' || status === 'archived') &&
      (await hasRunningCandidateOutreach(tx, {
        userId: params.userId,
        jobDescriptionId: params.id,
      }))
    ) {
      return { ok: false, reason: 'operation_in_progress' };
    }

    const updated = await updateJobDescriptionLifecycleWithClient(tx, {
      userId: params.userId,
      id: params.id,
      expectedStatus: current.status,
      status,
      ...(hiringTarget === undefined ? {} : { hiringTarget }),
      ...(activePublishBatchId === undefined ? {} : { activePublishBatchId }),
      ...(publishLeaseExpiresAt === undefined ? {} : { publishLeaseExpiresAt }),
    });
    if (!updated) {
      return { ok: false, reason: 'concurrent_update' };
    }
    return { ok: true, changed: true, jobDescription: updated };
  });
}

export async function reconcileJobDescriptionPublishResult(params: {
  userId: string;
  id: string;
  batchId: string;
  mode: 'direct' | 'batch';
  result: 'success' | 'failed';
}): Promise<JobDescriptionDto | null> {
  return prisma.$transaction(async (tx) => {
    await tx.$queryRaw`SELECT "id" FROM "job_descriptions" WHERE "id" = ${params.id} AND "user_id" = ${params.userId} FOR UPDATE`;
    const record = await getJobDescriptionRecordWithClient(tx, params.userId, params.id);
    if (!record) return null;
    const current = mapRow(record);

    if (record.activePublishBatchId !== params.batchId) return current;

    if (
      current.status === 'filled' ||
      current.status === 'offline' ||
      current.status === 'archived'
    ) {
      return (
        (await updateJobDescriptionLifecycleWithClient(tx, {
          userId: params.userId,
          id: params.id,
          expectedStatus: current.status,
          status: current.status,
          activePublishBatchId: null,
          publishLeaseExpiresAt: null,
        })) ?? current
      );
    }

    let result = params.result;
    if (params.mode === 'batch') {
      const runs = await tx.jobDescriptionPublishRun.findMany({
        where: {
          userId: params.userId,
          jobDescriptionId: params.id,
          batchId: params.batchId,
        },
        select: { status: true },
      });
      if (runs.some((run) => run.status === 'pending' || run.status === 'running')) {
        if (current.status === 'publishing') return current;
        return (
          (await updateJobDescriptionLifecycleWithClient(tx, {
            userId: params.userId,
            id: params.id,
            expectedStatus: current.status,
            status: 'publishing',
            activePublishBatchId: params.batchId,
            publishLeaseExpiresAt: publishLeaseExpiry(new Date()),
          })) ?? current
        );
      } else if (runs.some((run) => run.status === 'success')) {
        result = 'success';
      } else if (runs.length > 0) {
        result = 'failed';
      }
    }

    const status: JDStatus =
      result === 'failed'
        ? 'publish_failed'
        : current.hiringTarget !== null && current.onboardedCount >= current.hiringTarget
          ? 'filled'
          : 'published';

    const updated = await updateJobDescriptionLifecycleWithClient(tx, {
      userId: params.userId,
      id: params.id,
      expectedStatus: current.status,
      status,
      activePublishBatchId: null,
      publishLeaseExpiresAt: null,
    });
    return updated ?? getJobDescriptionByIdWithClient(tx, params.userId, params.id);
  });
}
