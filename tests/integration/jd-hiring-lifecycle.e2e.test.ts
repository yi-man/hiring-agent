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
  getCandidateTrackingOverview,
  updateCandidateActionLog,
  updateCandidateInterviewProgress,
} from '@/lib/candidate-screening/repo';
import { prismaCandidateConversationRepository } from '@/lib/candidate-communication/repo';
import {
  JOB_DESCRIPTION_PUBLISH_LEASE_MS,
  STALE_JOB_DESCRIPTION_PUBLISH_ERROR_MESSAGE,
  applyJobDescriptionLifecycle,
  claimJobDescriptionForPublishing,
  createJobDescription,
  getJobDescriptionById,
  recoverStaleJobDescriptionPublishing,
  reconcileJobDescriptionPublishResult,
} from '@/lib/jd/job-description-repo';
import {
  completePublishTask,
  updatePublishTaskCurrentStep,
} from '@/lib/jd-publishing/publish-repo';
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

  it('uses the PostgreSQL default hiring target for a new JD', async () => {
    const fixtureId = randomUUID();
    const user = await prisma.user.create({
      data: {
        username: `jd-default-hiring-target-${fixtureId}`,
        passwordHash: 'pbkdf2_sha256$fixture',
        name: 'JD Default Hiring Target User',
        email: `jd-default-hiring-target-${fixtureId}@example.com`,
      },
    });
    createdUserIds.add(user.id);

    const jobDescription = await createJobDescription({
      userId: user.id,
      department: '技术部',
      position: '高级后端工程师',
      positionDescription: '负责招聘系统核心服务建设',
      tone: 'tech',
      content: sampleJd,
      evaluation: null,
      generationMeta: null,
    });

    expect(jobDescription.hiringTarget).toBe(1);
    await expect(
      prisma.jobDescription.findUniqueOrThrow({
        where: { id: jobDescription.id },
        select: { hiringTarget: true },
      }),
    ).resolves.toEqual({ hiringTarget: 1 });
  });

  it('includes onboarded counts and recruiting jobs without candidates in the tracking overview', async () => {
    const fixture = await createHiringFixture({
      hiringTarget: 2,
      jobStatus: 'published',
      interviewStage: 'onboarded',
    });
    const emptyJob = await createJobDescription({
      userId: fixture.userId,
      department: '数据部',
      position: '数据工程师',
      positionDescription: '负责招聘数据平台建设',
      hiringTarget: 2,
      tone: 'tech',
      status: 'published',
      content: { ...sampleJd, title: '数据工程师' },
      evaluation: null,
      generationMeta: null,
    });

    const overview = await getCandidateTrackingOverview({ userId: fixture.userId });

    expect(overview.jobs).toEqual(
      expect.arrayContaining([
        expect.objectContaining({
          jobDescription: expect.objectContaining({
            id: fixture.jobDescriptionId,
            onboardedCount: 1,
          }),
          hiringGap: 1,
          totalCandidates: 1,
        }),
        expect.objectContaining({
          jobDescription: expect.objectContaining({
            id: emptyJob.id,
            onboardedCount: 0,
          }),
          hiringGap: 2,
          totalCandidates: 0,
        }),
      ]),
    );
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

  it('recovers an expired publish claim that crashed before creating a run', async () => {
    const fixture = await createHiringFixture({
      hiringTarget: 2,
      jobStatus: 'ready_to_publish',
      interviewStage: 'screened',
    });
    const claimedAt = new Date(Date.now() - JOB_DESCRIPTION_PUBLISH_LEASE_MS - 1_000);

    await expect(
      claimJobDescriptionForPublishing({
        userId: fixture.userId,
        id: fixture.jobDescriptionId,
        batchId: 'expired-zero-run-batch',
        now: claimedAt,
      }),
    ).resolves.toMatchObject({ ok: true, jobDescription: { status: 'publishing' } });

    await expect(
      recoverStaleJobDescriptionPublishing({
        userId: fixture.userId,
        id: fixture.jobDescriptionId,
      }),
    ).resolves.toMatchObject({ status: 'publish_failed' });
  });

  it('fails an orphaned pending publish run when its JD lease expires', async () => {
    const fixture = await createHiringFixture({
      hiringTarget: 2,
      jobStatus: 'ready_to_publish',
      interviewStage: 'screened',
    });
    const batchId = 'expired-pending-run-batch';
    const claimedAt = new Date(Date.now() - JOB_DESCRIPTION_PUBLISH_LEASE_MS - 1_000);
    await claimJobDescriptionForPublishing({
      userId: fixture.userId,
      id: fixture.jobDescriptionId,
      batchId,
      now: claimedAt,
    });
    const run = await prisma.jobDescriptionPublishRun.create({
      data: {
        userId: fixture.userId,
        jobDescriptionId: fixture.jobDescriptionId,
        batchId,
        platform: 'boss',
        status: 'pending',
        currentStage: 'queued',
      },
    });

    await recoverStaleJobDescriptionPublishing({
      userId: fixture.userId,
      id: fixture.jobDescriptionId,
    });

    await expect(
      prisma.jobDescriptionPublishRun.findUniqueOrThrow({
        where: { id: run.id },
        select: { status: true, currentStage: true, errorMessage: true },
      }),
    ).resolves.toEqual({
      status: 'failed',
      currentStage: 'completed',
      errorMessage: STALE_JOB_DESCRIPTION_PUBLISH_ERROR_MESSAGE,
    });
  });

  it('keeps sibling platform fences active until every publish run is terminal', async () => {
    const fixture = await createHiringFixture({
      hiringTarget: 2,
      jobStatus: 'ready_to_publish',
      interviewStage: 'screened',
    });
    const batchId = `multi-platform-${randomUUID()}`;
    const skillId = `multi-platform-skill-${randomUUID()}`;
    await claimJobDescriptionForPublishing({
      userId: fixture.userId,
      id: fixture.jobDescriptionId,
      batchId,
    });
    await prisma.jobDescriptionPublishRun.createMany({
      data: [
        {
          userId: fixture.userId,
          jobDescriptionId: fixture.jobDescriptionId,
          batchId,
          platform: 'boss-like',
          status: 'success',
          currentStage: 'completed',
          finishedAt: new Date(),
        },
        {
          userId: fixture.userId,
          jobDescriptionId: fixture.jobDescriptionId,
          batchId,
          platform: 'zhilian',
          status: 'running',
          currentStage: 'publishing',
          startedAt: new Date(),
        },
      ],
    });
    await prisma.publishSkill.create({
      data: {
        id: skillId,
        name: 'publish_jd_multi_platform_fixture',
        platform: 'zhilian',
        siteFingerprint: skillId,
        description: 'Multi-platform publish integration fixture',
        version: 1,
        isActive: false,
        inputSchema: {},
        variables: {},
        steps: [],
        meta: {},
      },
    });

    try {
      const task = await prisma.jobPublishTask.create({
        data: {
          userId: fixture.userId,
          jobDescriptionId: fixture.jobDescriptionId,
          batchId,
          skillId,
          platform: 'zhilian',
          input: {},
          currentStep: 'open_new_job',
          status: 'running',
        },
      });

      await expect(
        reconcileJobDescriptionPublishResult({
          userId: fixture.userId,
          id: fixture.jobDescriptionId,
          batchId,
          mode: 'batch',
          result: 'success',
        }),
      ).resolves.toMatchObject({ status: 'publishing' });
      await expect(
        prisma.jobDescription.findUniqueOrThrow({
          where: { id: fixture.jobDescriptionId },
          select: { status: true, activePublishBatchId: true },
        }),
      ).resolves.toEqual({ status: 'publishing', activePublishBatchId: batchId });
      await expect(
        updatePublishTaskCurrentStep({
          taskId: task.id,
          userId: fixture.userId,
          jobDescriptionId: fixture.jobDescriptionId,
          batchId,
          expectedCurrentStep: 'open_new_job',
          currentStep: 'fill_title',
        }),
      ).resolves.toBe(true);

      await prisma.jobPublishTask.update({
        where: { id: task.id },
        data: { status: 'failed', currentStep: null },
      });
      await prisma.jobDescriptionPublishRun.updateMany({
        where: {
          userId: fixture.userId,
          jobDescriptionId: fixture.jobDescriptionId,
          batchId,
          platform: 'zhilian',
        },
        data: { status: 'failed', currentStage: 'completed', finishedAt: new Date() },
      });

      await expect(
        reconcileJobDescriptionPublishResult({
          userId: fixture.userId,
          id: fixture.jobDescriptionId,
          batchId,
          mode: 'batch',
          result: 'failed',
        }),
      ).resolves.toMatchObject({ status: 'published' });
      await expect(
        prisma.jobDescription.findUniqueOrThrow({
          where: { id: fixture.jobDescriptionId },
          select: {
            status: true,
            activePublishBatchId: true,
            publishLeaseExpiresAt: true,
          },
        }),
      ).resolves.toEqual({
        status: 'published',
        activePublishBatchId: null,
        publishLeaseExpiresAt: null,
      });
    } finally {
      await prisma.jobPublishTask.deleteMany({ where: { skillId } });
      await prisma.publishSkill.deleteMany({ where: { id: skillId } });
    }
  });

  it('fences publish steps by the active batch, lease expiry, and recovered task status', async () => {
    const fixture = await createHiringFixture({
      hiringTarget: 2,
      jobStatus: 'ready_to_publish',
      interviewStage: 'screened',
    });
    const batchId = `publish-fence-${randomUUID()}`;
    const skillId = `publish-fence-skill-${randomUUID()}`;
    await claimJobDescriptionForPublishing({
      userId: fixture.userId,
      id: fixture.jobDescriptionId,
      batchId,
    });
    await prisma.publishSkill.create({
      data: {
        id: skillId,
        name: 'publish_jd_fence_fixture',
        platform: 'boss-like',
        siteFingerprint: skillId,
        description: 'Publish fence integration fixture',
        version: 1,
        isActive: false,
        inputSchema: {},
        variables: {},
        steps: [],
        meta: {},
      },
    });
    const task = await prisma.jobPublishTask.create({
      data: {
        userId: fixture.userId,
        jobDescriptionId: fixture.jobDescriptionId,
        batchId,
        skillId,
        platform: 'boss-like',
        input: {},
        currentStep: 'open_new_job',
        status: 'running',
      },
    });

    try {
      await expect(
        updatePublishTaskCurrentStep({
          taskId: task.id,
          userId: fixture.userId,
          jobDescriptionId: fixture.jobDescriptionId,
          batchId,
          expectedCurrentStep: 'open_new_job',
          currentStep: 'fill_title',
        }),
      ).resolves.toBe(true);

      await prisma.jobDescription.update({
        where: { id: fixture.jobDescriptionId },
        data: { activePublishBatchId: 'replacement-batch' },
      });
      await expect(
        updatePublishTaskCurrentStep({
          taskId: task.id,
          userId: fixture.userId,
          jobDescriptionId: fixture.jobDescriptionId,
          batchId,
          expectedCurrentStep: 'fill_title',
          currentStep: 'submit_job',
        }),
      ).resolves.toBe(false);

      await prisma.jobDescription.update({
        where: { id: fixture.jobDescriptionId },
        data: {
          activePublishBatchId: batchId,
          publishLeaseExpiresAt: new Date(Date.now() - 1_000),
        },
      });
      await expect(
        updatePublishTaskCurrentStep({
          taskId: task.id,
          userId: fixture.userId,
          jobDescriptionId: fixture.jobDescriptionId,
          batchId,
          expectedCurrentStep: 'fill_title',
          currentStep: 'submit_job',
        }),
      ).resolves.toBe(false);

      await prisma.jobPublishTask.update({
        where: { id: task.id },
        data: { currentStep: null },
      });
      await expect(
        completePublishTask({
          taskId: task.id,
          userId: fixture.userId,
          jobDescriptionId: fixture.jobDescriptionId,
          batchId,
          skillId,
          status: 'success',
          steps: [],
        }),
      ).resolves.toBe(false);
      await expect(
        prisma.jobPublishTask.findUniqueOrThrow({
          where: { id: task.id },
          select: { status: true, trace: { select: { id: true } } },
        }),
      ).resolves.toEqual({ status: 'running', trace: null });

      await recoverStaleJobDescriptionPublishing({
        userId: fixture.userId,
        id: fixture.jobDescriptionId,
      });
      await expect(
        updatePublishTaskCurrentStep({
          taskId: task.id,
          userId: fixture.userId,
          jobDescriptionId: fixture.jobDescriptionId,
          batchId,
          expectedCurrentStep: 'fill_title',
          currentStep: 'submit_job',
        }),
      ).resolves.toBe(false);
      await expect(
        prisma.jobPublishTask.findUniqueOrThrow({
          where: { id: task.id },
          select: { status: true },
        }),
      ).resolves.toEqual({ status: 'failed' });
    } finally {
      await prisma.jobPublishTask.deleteMany({ where: { id: task.id } });
      await prisma.publishSkill.deleteMany({ where: { id: skillId } });
    }
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

  it('blocks closing or filling a JD while an unscreened message owner is active', async () => {
    const fixture = await createHiringFixture({
      hiringTarget: 1,
      jobStatus: 'published',
      interviewStage: 'offer',
    });
    const now = new Date();
    const conversation = await prisma.candidateConversation.create({
      data: {
        userId: fixture.userId,
        jobDescriptionId: fixture.jobDescriptionId,
        candidateId: fixture.candidateId,
        platform: 'boss',
        stage: 'new',
        status: 'active',
        lastActiveAt: now,
        lastCandidateMessageAt: now,
      },
    });
    const incoming = await prisma.candidateConversationMessage.create({
      data: {
        conversationId: conversation.id,
        userId: fixture.userId,
        jobDescriptionId: fixture.jobDescriptionId,
        candidateId: fixture.candidateId,
        platform: 'boss',
        role: 'candidate',
        content: '你好，还在招聘吗？',
        externalMessageId: `active-outreach-${randomUUID()}`,
        deliveryStatus: 'received',
        processingClaimId: 'active-claim',
        processingLeaseExpiresAt: new Date(now.getTime() + 10 * 60 * 1000),
        processingOutcome: 'in_flight',
        occurredAt: now,
      },
    });

    await expect(
      applyJobDescriptionLifecycle({
        userId: fixture.userId,
        id: fixture.jobDescriptionId,
        request: { action: 'take_offline' },
      }),
    ).resolves.toEqual({ ok: false, reason: 'operation_in_progress' });
    const storedActiveIncoming = await prisma.candidateConversationMessage.findUniqueOrThrow({
      where: { id: incoming.id },
      select: {
        processingClaimId: true,
        processingLeaseExpiresAt: true,
        processingOutcome: true,
        processedAt: true,
      },
    });
    expect(storedActiveIncoming).toMatchObject({
      processingClaimId: 'active-claim',
      processingOutcome: 'in_flight',
      processedAt: null,
      processingLeaseExpiresAt: expect.any(Date),
    });
    expect(storedActiveIncoming.processingLeaseExpiresAt?.getTime()).toBeGreaterThan(Date.now());
    const [leaseDiagnostic] = await prisma.$queryRaw<
      Array<{
        userId: string;
        jobDescriptionId: string;
        role: string;
        processingOutcome: string | null;
        processedAt: Date | null;
        processingLeaseExpiresAt: Date | null;
        leaseActive: boolean;
      }>
    >`
      SELECT
        user_id AS "userId",
        job_description_id AS "jobDescriptionId",
        role,
        processing_outcome AS "processingOutcome",
        processed_at AS "processedAt",
        processing_lease_expires_at AS "processingLeaseExpiresAt",
        processing_lease_expires_at >
          (CURRENT_TIMESTAMP AT TIME ZONE 'UTC') AS "leaseActive"
      FROM public.candidate_conversation_messages
      WHERE id = ${incoming.id}
    `;
    expect(leaseDiagnostic).toMatchObject({
      userId: fixture.userId,
      jobDescriptionId: fixture.jobDescriptionId,
      role: 'candidate',
      processingOutcome: 'in_flight',
      processedAt: null,
      processingLeaseExpiresAt: expect.any(Date),
      leaseActive: true,
    });
    const [activeCommunication] = await prisma.$queryRaw<
      Array<{ hasActiveCandidateCommunication: boolean }>
    >`
      SELECT EXISTS (
        SELECT 1
        FROM public.candidate_conversation_messages AS incoming_message
        WHERE incoming_message.user_id = ${fixture.userId}
          AND incoming_message.job_description_id = ${fixture.jobDescriptionId}
          AND incoming_message.role = 'candidate'
          AND incoming_message.processing_outcome = 'in_flight'
          AND incoming_message.processed_at IS NULL
          AND incoming_message.processing_lease_expires_at >
            (CURRENT_TIMESTAMP AT TIME ZONE 'UTC')
      ) AS "hasActiveCandidateCommunication"
    `;
    expect(activeCommunication?.hasActiveCandidateCommunication).toBe(true);
    await expect(
      updateCandidateInterviewProgress({
        ...fixture,
        expectedInterviewStage: 'offer',
        interviewStage: 'onboarded',
      }),
    ).rejects.toBeInstanceOf(CandidateActionInProgressError);

    await prisma.candidateConversationMessage.update({
      where: { id: incoming.id },
      data: {
        processingClaimId: null,
        processingLeaseExpiresAt: null,
        processingOutcome: 'processed_ackable',
        processedAt: new Date(),
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
      getJobDescriptionById(fixture.userId, fixture.jobDescriptionId),
    ).resolves.toMatchObject({ onboardedCount: 1, status: 'filled' });
  });

  it('routes communication withdrawal through the same running-action fence', async () => {
    const fixture = await createHiringFixture({
      hiringTarget: 2,
      jobStatus: 'published',
      interviewStage: 'offer',
    });
    const actionLog = await createPlannedActionLog(fixture);
    await claimCandidateActionLog({
      userId: fixture.userId,
      id: actionLog.id,
      expectedInterviewStage: 'offer',
    });

    await expect(
      prismaCandidateConversationRepository.syncCandidateInterviewStage({
        userId: fixture.userId,
        jobDescriptionId: fixture.jobDescriptionId,
        candidateId: fixture.candidateId,
        interviewStage: 'withdrawn',
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
    await prismaCandidateConversationRepository.syncCandidateInterviewStage({
      userId: fixture.userId,
      jobDescriptionId: fixture.jobDescriptionId,
      candidateId: fixture.candidateId,
      interviewStage: 'withdrawn',
    });
    await expect(
      prisma.candidateScreeningResult.findUniqueOrThrow({
        where: { id: fixture.screeningResultId },
        select: { interviewStage: true },
      }),
    ).resolves.toEqual({ interviewStage: 'withdrawn' });
  });

  it('does not fill a JD while its publish claim is active', async () => {
    const fixture = await createHiringFixture({
      hiringTarget: 1,
      jobStatus: 'ready_to_publish',
      interviewStage: 'offer',
    });
    await claimJobDescriptionForPublishing({
      userId: fixture.userId,
      id: fixture.jobDescriptionId,
      batchId: randomUUID(),
    });

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
    await expect(
      getJobDescriptionById(fixture.userId, fixture.jobDescriptionId),
    ).resolves.toMatchObject({ onboardedCount: 0, status: 'publishing' });
  });

  it('does not fill a JD while another candidate external action is running', async () => {
    const fixture = await createHiringFixture({
      hiringTarget: 1,
      jobStatus: 'published',
      interviewStage: 'offer',
    });
    const otherCandidateId = randomUUID();
    const otherCandidate = await prisma.candidate.create({
      data: {
        id: otherCandidateId,
        userId: fixture.userId,
        displayName: 'Grace Hopper',
        sourcePlatform: 'boss',
        identityKey: `candidate-${otherCandidateId}`,
        identityHash: otherCandidateId,
      },
    });
    const otherResult = await prisma.candidateScreeningResult.create({
      data: {
        userId: fixture.userId,
        runId: fixture.runId,
        jobDescriptionId: fixture.jobDescriptionId,
        candidateId: otherCandidate.id,
        source: 'live_search',
        tags: {
          skills: [],
          domainKnowledge: [],
          generalAbility: [],
          risk: [],
          activity: [],
          custom: [],
        },
        scoreDetail: { skill: 80, domain: 80, ability: 80, risk: 90, llmBonus: 0, total: 82 },
        finalScore: 82,
        rank: 2,
        decisionAction: 'chat',
        decisionPriority: 'medium',
        decisionReason: 'integration fixture',
        actionStatus: 'planned',
        interviewStage: 'to_contact',
      },
    });
    const otherAction = await createPlannedActionLog({
      ...fixture,
      candidateId: otherCandidate.id,
      screeningResultId: otherResult.id,
    });
    await claimCandidateActionLog({
      userId: fixture.userId,
      id: otherAction.id,
      expectedInterviewStage: 'to_contact',
    });

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
    await expect(
      getJobDescriptionById(fixture.userId, fixture.jobDescriptionId),
    ).resolves.toMatchObject({ onboardedCount: 0, status: 'published' });

    await updateCandidateActionLog({
      userId: fixture.userId,
      id: otherAction.id,
      status: 'success',
    });
    await expect(
      updateCandidateInterviewProgress({
        ...fixture,
        expectedInterviewStage: 'offer',
        interviewStage: 'onboarded',
      }),
    ).resolves.toMatchObject({ interviewStage: 'onboarded' });
    await expect(
      getJobDescriptionById(fixture.userId, fixture.jobDescriptionId),
    ).resolves.toMatchObject({ onboardedCount: 1, status: 'filled' });
  });

  it.each(['offline', 'filled'] as const)(
    'does not claim a planned candidate action after the JD becomes %s',
    async (jobStatus) => {
      const fixture = await createHiringFixture({
        hiringTarget: 2,
        jobStatus,
        interviewStage: 'to_contact',
      });
      const actionLog = await createPlannedActionLog(fixture);

      await expect(
        claimCandidateActionLog({
          userId: fixture.userId,
          id: actionLog.id,
          expectedInterviewStage: 'to_contact',
        }),
      ).resolves.toBeNull();
      await expect(
        prisma.candidateActionLog.findUniqueOrThrow({
          where: { id: actionLog.id },
          select: { status: true },
        }),
      ).resolves.toEqual({ status: 'planned' });
    },
  );

  it('allows a planned candidate action while the JD is ready to publish', async () => {
    const fixture = await createHiringFixture({
      hiringTarget: 2,
      jobStatus: 'ready_to_publish',
      interviewStage: 'to_contact',
    });
    const actionLog = await createPlannedActionLog(fixture);

    await expect(
      claimCandidateActionLog({
        userId: fixture.userId,
        id: actionLog.id,
        expectedInterviewStage: 'to_contact',
      }),
    ).resolves.toMatchObject({ status: 'running' });
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
