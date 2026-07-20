/** @jest-environment node */
import './chat/test-env';

import { randomUUID } from 'node:crypto';
import {
  assertPostgresReachable,
  ensureIntegrationSchema,
  requireIntegrationEnv,
} from './chat/test-env';
import {
  CandidateActionInProgressError,
  STALE_CANDIDATE_ACTION_ERROR_MESSAGE,
  STALE_CANDIDATE_ACTION_TIMEOUT_MS,
  claimCandidateActionLog,
  updateCandidateActionLog,
  updateCandidateInterviewProgress,
} from '@/lib/candidate-screening/repo';
import {
  applyJobDescriptionLifecycle,
  claimJobDescriptionForPublishing,
  createJobDescription,
  getJobDescriptionById,
} from '@/lib/jd/job-description-repo';
import { prisma } from '@/lib/prisma';
import type { CandidateInterviewStage } from '@/lib/candidate-screening/types';
import type { JD, JDStatus } from '@/types';

const sampleJd: JD = {
  title: '高级后端工程师',
  summary: '负责招聘系统核心服务建设',
  responsibilities: ['建设招聘流程服务', '保障核心链路稳定性'],
  requirements: ['TypeScript', 'PostgreSQL'],
  bonus: ['招聘系统经验'],
  highlights: ['完整招聘闭环'],
};

const createdUserIds = new Set<string>();

async function createHiringFixture(params: {
  hiringTarget: number;
  jobStatus: JDStatus;
  interviewStage: CandidateInterviewStage;
}) {
  const fixtureId = randomUUID();
  const user = await prisma.user.create({
    data: {
      username: `jd-hiring-lifecycle-${fixtureId}`,
      passwordHash: 'pbkdf2_sha256$fixture',
      name: 'JD Hiring Lifecycle Integration User',
      email: `jd-hiring-lifecycle-${fixtureId}@example.com`,
    },
  });
  createdUserIds.add(user.id);

  const jobDescription = await createJobDescription({
    userId: user.id,
    department: '技术部',
    position: '高级后端工程师',
    positionDescription: '负责招聘系统核心服务建设',
    hiringTarget: params.hiringTarget,
    tone: 'tech',
    status: params.jobStatus,
    content: sampleJd,
    evaluation: null,
    generationMeta: null,
  });
  const candidate = await prisma.candidate.create({
    data: {
      userId: user.id,
      displayName: 'Ada Lovelace',
      sourcePlatform: 'boss',
      identityKey: `candidate-${fixtureId}`,
      identityHash: fixtureId,
    },
  });
  const run = await prisma.candidateScreeningRun.create({
    data: {
      userId: user.id,
      jobDescriptionId: jobDescription.id,
      platform: 'boss',
      mode: 'dry_run',
      status: 'success',
    },
  });
  const screeningResult = await prisma.candidateScreeningResult.create({
    data: {
      userId: user.id,
      runId: run.id,
      jobDescriptionId: jobDescription.id,
      candidateId: candidate.id,
      source: 'live_search',
      tags: {
        skills: ['TypeScript', 'PostgreSQL'],
        domainKnowledge: ['招聘系统'],
        generalAbility: ['ownership'],
        risk: [],
        activity: ['active'],
        custom: [],
      },
      scoreDetail: {
        skill: 90,
        domain: 88,
        ability: 86,
        risk: 90,
        llmBonus: 0,
        total: 89,
      },
      finalScore: 89,
      rank: 1,
      decisionAction: 'chat',
      decisionPriority: 'high',
      decisionReason: 'integration fixture',
      actionStatus: 'success',
      interviewStage: params.interviewStage,
    },
  });

  return {
    userId: user.id,
    jobDescriptionId: jobDescription.id,
    candidateId: candidate.id,
    runId: run.id,
    screeningResultId: screeningResult.id,
  };
}

async function createPlannedActionLog(fixture: Awaited<ReturnType<typeof createHiringFixture>>) {
  return prisma.candidateActionLog.create({
    data: {
      userId: fixture.userId,
      runId: fixture.runId,
      screeningResultId: fixture.screeningResultId,
      candidateId: fixture.candidateId,
      jobDescriptionId: fixture.jobDescriptionId,
      platform: 'boss',
      mode: 'execution',
      action: 'chat',
      message: 'integration fixture greeting',
      status: 'planned',
      idempotencyKey: `jd-hiring-action-${randomUUID()}`,
    },
  });
}

async function cleanupFixtureUsers(): Promise<void> {
  const userIds = [...createdUserIds];
  if (userIds.length === 0) return;

  await prisma.candidateScreeningResult.deleteMany({ where: { userId: { in: userIds } } });
  await prisma.candidateScreeningRun.deleteMany({ where: { userId: { in: userIds } } });
  await prisma.candidate.deleteMany({ where: { userId: { in: userIds } } });
  await prisma.jobDescription.deleteMany({ where: { userId: { in: userIds } } });
  await prisma.session.deleteMany({ where: { userId: { in: userIds } } });
  await prisma.user.deleteMany({ where: { id: { in: userIds } } });
  createdUserIds.clear();
}

describe('JD hiring lifecycle with real PostgreSQL', () => {
  beforeAll(async () => {
    requireIntegrationEnv('POSTGRES_HOST');
    requireIntegrationEnv('POSTGRES_PORT');
    requireIntegrationEnv('POSTGRES_USER');
    requireIntegrationEnv('POSTGRES_DATABASE');
    await ensureIntegrationSchema();
    await assertPostgresReachable();
  }, 60_000);

  afterEach(async () => {
    await cleanupFixtureUsers();
  });

  afterAll(async () => {
    await prisma.$disconnect();
  });

  it('persists the target, counts onboarded candidates live, and requires an explicit reopen', async () => {
    const fixture = await createHiringFixture({
      hiringTarget: 1,
      jobStatus: 'published',
      interviewStage: 'offer',
    });

    await expect(
      getJobDescriptionById(fixture.userId, fixture.jobDescriptionId),
    ).resolves.toMatchObject({
      hiringTarget: 1,
      onboardedCount: 0,
      status: 'published',
    });

    const onboarded = await updateCandidateInterviewProgress({
      ...fixture,
      expectedInterviewStage: 'offer',
      interviewStage: 'onboarded',
    });
    expect(onboarded?.interviewStage).toBe('onboarded');
    await expect(
      getJobDescriptionById(fixture.userId, fixture.jobDescriptionId),
    ).resolves.toMatchObject({
      hiringTarget: 1,
      onboardedCount: 1,
      status: 'filled',
    });

    const corrected = await updateCandidateInterviewProgress({
      ...fixture,
      expectedInterviewStage: 'onboarded',
      interviewStage: 'not_joined',
    });
    expect(corrected?.interviewStage).toBe('not_joined');
    await expect(
      getJobDescriptionById(fixture.userId, fixture.jobDescriptionId),
    ).resolves.toMatchObject({
      hiringTarget: 1,
      onboardedCount: 0,
      status: 'filled',
    });

    const targetUpdated = await applyJobDescriptionLifecycle({
      userId: fixture.userId,
      id: fixture.jobDescriptionId,
      request: { action: 'set_hiring_target', hiringTarget: 2 },
    });
    expect(targetUpdated).toMatchObject({
      ok: true,
      changed: true,
      jobDescription: {
        hiringTarget: 2,
        onboardedCount: 0,
        status: 'filled',
      },
    });

    const reopened = await applyJobDescriptionLifecycle({
      userId: fixture.userId,
      id: fixture.jobDescriptionId,
      request: { action: 'reopen' },
    });
    expect(reopened).toMatchObject({
      ok: true,
      changed: true,
      jobDescription: {
        hiringTarget: 2,
        onboardedCount: 0,
        status: 'published',
      },
    });
  });

  it('atomically rejects a publish claim when the persisted onboarded count reached the target', async () => {
    const fixture = await createHiringFixture({
      hiringTarget: 1,
      jobStatus: 'ready_to_publish',
      interviewStage: 'onboarded',
    });

    const claimed = await claimJobDescriptionForPublishing({
      userId: fixture.userId,
      id: fixture.jobDescriptionId,
      batchId: randomUUID(),
    });

    expect(claimed).toMatchObject({
      ok: false,
      reason: 'conflict',
      conflict: 'hiring target has already been reached',
      jobDescription: {
        hiringTarget: 1,
        onboardedCount: 1,
        status: 'filled',
      },
    });
    await expect(
      getJobDescriptionById(fixture.userId, fixture.jobDescriptionId),
    ).resolves.toMatchObject({
      hiringTarget: 1,
      onboardedCount: 1,
      status: 'filled',
    });
  });

  it.each(['offline', 'publish_failed'] as const)(
    'marks a %s JD filled when a late onboarding reaches the target',
    async (jobStatus) => {
      const fixture = await createHiringFixture({
        hiringTarget: 1,
        jobStatus,
        interviewStage: 'offer',
      });

      const onboarded = await updateCandidateInterviewProgress({
        ...fixture,
        expectedInterviewStage: 'offer',
        interviewStage: 'onboarded',
      });

      expect(onboarded?.interviewStage).toBe('onboarded');
      await expect(
        getJobDescriptionById(fixture.userId, fixture.jobDescriptionId),
      ).resolves.toMatchObject({
        hiringTarget: 1,
        onboardedCount: 1,
        status: 'filled',
      });
    },
  );

  it('blocks a final outcome after a worker claim and allows it after the action finishes', async () => {
    const fixture = await createHiringFixture({
      hiringTarget: 2,
      jobStatus: 'published',
      interviewStage: 'offer',
    });
    const actionLog = await createPlannedActionLog(fixture);

    const claimed = await claimCandidateActionLog({
      userId: fixture.userId,
      id: actionLog.id,
      expectedInterviewStage: 'offer',
    });
    expect(claimed?.status).toBe('running');

    await expect(
      updateCandidateInterviewProgress({
        ...fixture,
        expectedInterviewStage: 'offer',
        interviewStage: 'onboarded',
      }),
    ).rejects.toBeInstanceOf(CandidateActionInProgressError);
    await expect(
      prisma.candidateScreeningResult.findUniqueOrThrow({
        where: { id: fixture.screeningResultId },
        select: { interviewStage: true },
      }),
    ).resolves.toEqual({ interviewStage: 'offer' });

    await updateCandidateActionLog({
      userId: fixture.userId,
      id: actionLog.id,
      status: 'success',
    });
    const onboarded = await updateCandidateInterviewProgress({
      ...fixture,
      expectedInterviewStage: 'offer',
      interviewStage: 'onboarded',
    });

    expect(onboarded?.interviewStage).toBe('onboarded');
    await expect(
      getJobDescriptionById(fixture.userId, fixture.jobDescriptionId),
    ).resolves.toMatchObject({ onboardedCount: 1, status: 'published' });
  });

  it('recovers an orphaned running action before applying a final outcome', async () => {
    const fixture = await createHiringFixture({
      hiringTarget: 2,
      jobStatus: 'published',
      interviewStage: 'offer',
    });
    const actionLog = await createPlannedActionLog(fixture);

    const claimed = await claimCandidateActionLog({
      userId: fixture.userId,
      id: actionLog.id,
      expectedInterviewStage: 'offer',
    });
    expect(claimed?.status).toBe('running');

    await prisma.candidateActionLog.update({
      where: { id: actionLog.id },
      data: {
        updatedAt: new Date(Date.now() - STALE_CANDIDATE_ACTION_TIMEOUT_MS - 1_000),
      },
    });

    await expect(
      updateCandidateInterviewProgress({
        ...fixture,
        expectedInterviewStage: 'offer',
        interviewStage: 'onboarded',
      }),
    ).resolves.toMatchObject({ interviewStage: 'onboarded' });
    await expect(
      prisma.candidateActionLog.findUniqueOrThrow({
        where: { id: actionLog.id },
        select: { status: true, errorMessage: true },
      }),
    ).resolves.toEqual({
      status: 'failed',
      errorMessage: STALE_CANDIDATE_ACTION_ERROR_MESSAGE,
    });
  });

  it('rejects a stale worker claim after the final outcome commits first', async () => {
    const fixture = await createHiringFixture({
      hiringTarget: 2,
      jobStatus: 'published',
      interviewStage: 'offer',
    });
    const actionLog = await createPlannedActionLog(fixture);

    const onboarded = await updateCandidateInterviewProgress({
      ...fixture,
      expectedInterviewStage: 'offer',
      interviewStage: 'onboarded',
    });
    expect(onboarded?.interviewStage).toBe('onboarded');

    const claimed = await claimCandidateActionLog({
      userId: fixture.userId,
      id: actionLog.id,
      expectedInterviewStage: 'offer',
    });

    expect(claimed).toBeNull();
    await expect(
      prisma.candidateActionLog.findUniqueOrThrow({
        where: { id: actionLog.id },
        select: { status: true },
      }),
    ).resolves.toEqual({ status: 'planned' });
  });
});
