/** @jest-environment node */
import '../chat/test-env';

import { randomBytes } from 'crypto';
import { createServer } from 'http';
import type { AddressInfo } from 'net';
import {
  assertPostgresReachable,
  ensureIntegrationSchema,
  requireIntegrationEnv,
} from '../chat/test-env';
import { createJobDescription } from '@/lib/jd/job-description-repo';
import { upsertCompanyProfileForUser } from '@/lib/company-profile/repo';
import { resolveRecruitmentPlatformRuntimeConfig } from '@/lib/recruitment-platform-config';
import { PlaywrightBrowserExecutor } from '@/lib/browser/executors/playwright-executor';
import { createExploredPublishSkill } from '@/lib/jd-publishing/publish-repo';
import { publishJobDescriptionToBossLike } from '@/lib/jd-publishing/service';
import { bossLikePublishSkill } from '@/lib/jd-publishing/skill-registry';
import type {
  PublishJobDescriptionSettings,
  PublishSkill,
  PublishTraceStep,
} from '@/lib/jd-publishing/types';
import { prisma } from '@/lib/prisma';
import type { JobDescriptionDto, JD } from '@/types';

type BossLikeServer = {
  baseUrl: string;
  requests: string[];
  close: () => Promise<void>;
};

const originalBossLikeEnv = {
  baseUrl: process.env.BOSS_LIKE_BASE_URL,
  username: process.env.BOSS_LIKE_EMPLOYER_USERNAME,
  password: process.env.BOSS_LIKE_EMPLOYER_PASSWORD,
  encryptionKey: process.env.PLATFORM_CREDENTIALS_ENCRYPTION_KEY,
};

const sampleJd: JD = {
  title: '高级前端工程师',
  summary: '负责招聘产品前端体验',
  responsibilities: ['建设 JD 发布链路'],
  requirements: ['熟悉 TypeScript'],
  bonus: ['有自动化发布经验'],
  highlights: ['核心业务'],
};

function restoreBossLikeEnv(): void {
  if (originalBossLikeEnv.baseUrl === undefined) {
    delete process.env.BOSS_LIKE_BASE_URL;
  } else {
    process.env.BOSS_LIKE_BASE_URL = originalBossLikeEnv.baseUrl;
  }
  if (originalBossLikeEnv.username === undefined) {
    delete process.env.BOSS_LIKE_EMPLOYER_USERNAME;
  } else {
    process.env.BOSS_LIKE_EMPLOYER_USERNAME = originalBossLikeEnv.username;
  }
  if (originalBossLikeEnv.password === undefined) {
    delete process.env.BOSS_LIKE_EMPLOYER_PASSWORD;
  } else {
    process.env.BOSS_LIKE_EMPLOYER_PASSWORD = originalBossLikeEnv.password;
  }
  if (originalBossLikeEnv.encryptionKey === undefined) {
    delete process.env.PLATFORM_CREDENTIALS_ENCRYPTION_KEY;
  } else {
    process.env.PLATFORM_CREDENTIALS_ENCRYPTION_KEY = originalBossLikeEnv.encryptionKey;
  }
}

function escapeHtml(value: string): string {
  return value
    .replace(/&/g, '&amp;')
    .replace(/</g, '&lt;')
    .replace(/>/g, '&gt;')
    .replace(/"/g, '&quot;');
}

function renderNewJobPage(): string {
  return `<!doctype html>
<html lang="zh-CN">
  <head><meta charset="utf-8" /><title>发布职位</title></head>
  <body>
    <main>
      <h1>发布职位</h1>
      <form id="job-form">
        <label>职位名称 <input name="title" type="text" /></label>
        <label>公司名称 <input name="company" type="text" /></label>
        <label>薪资范围 <input name="salary" type="text" /></label>
        <label>工作地点 <input name="location" type="text" /></label>
        <label>职位描述 <textarea name="description"></textarea></label>
        <label>技能标签 <input name="keyword" type="text" /></label>
        <button type="button" id="add-keyword">添加</button>
        <button type="button" id="publish-job">发布职位</button>
      </form>
    </main>
    <script>
      document.querySelector('#publish-job').addEventListener('click', () => {
        const title = document.querySelector('input[name="title"]').value;
        window.location.href = '/employer/jobs?title=' + encodeURIComponent(title);
      });
    </script>
  </body>
</html>`;
}

function renderLoginPage(): string {
  return `<!doctype html>
<html lang="zh-CN">
  <head><meta charset="utf-8" /><title>招聘端登录</title></head>
  <body>
    <main>
      <h1>招聘端登录</h1>
      <label>用户名 <input name="username" type="text" /></label>
      <label>密码 <input name="password" type="password" /></label>
      <button type="button" id="login">登录</button>
    </main>
    <script>
      document.querySelector('#login').addEventListener('click', () => {
        window.location.href = '/employer/resumes';
      });
    </script>
  </body>
</html>`;
}

async function startBossLikeServer(): Promise<BossLikeServer> {
  const requests: string[] = [];
  const server = createServer((request, response) => {
    const url = new URL(request.url ?? '/', 'http://127.0.0.1');
    requests.push(`${request.method ?? 'GET'} ${url.pathname}`);
    response.setHeader('content-type', 'text/html; charset=utf-8');

    if (url.pathname === '/employer/login') {
      response.end(renderLoginPage());
      return;
    }
    if (url.pathname === '/employer/resumes') {
      response.end('<!doctype html><html><body><h1>简历管理</h1></body></html>');
      return;
    }
    if (url.pathname === '/employer/jobs/new') {
      response.end(renderNewJobPage());
      return;
    }
    if (url.pathname === '/employer/jobs') {
      const title = escapeHtml(url.searchParams.get('title') ?? '');
      response.end(
        `<!doctype html><html><body><h1>职位列表</h1><article>${title}</article></body></html>`,
      );
      return;
    }

    response.statusCode = 404;
    response.end('<!doctype html><html><body>Not Found</body></html>');
  });

  await new Promise<void>((resolve) => {
    server.listen(0, '127.0.0.1', resolve);
  });

  const address = server.address() as AddressInfo;
  return {
    baseUrl: `http://127.0.0.1:${address.port}`,
    requests,
    close: () =>
      new Promise<void>((resolve, reject) => {
        server.close((error) => {
          if (error) {
            reject(error);
            return;
          }
          resolve();
        });
      }),
  };
}

async function clearBossLikePublishingData(): Promise<void> {
  await prisma.jobPublishTrace.deleteMany({
    where: { skill: { platform: 'boss-like' } },
  });
  await prisma.jobPublishTask.deleteMany({ where: { platform: 'boss-like' } });
  await prisma.publishSkill.deleteMany({ where: { platform: 'boss-like' } });
}

async function createIntegrationUser(): Promise<string> {
  const fixtureId = `${Date.now()}-${randomBytes(4).toString('hex')}`;
  const user = await prisma.user.create({
    data: {
      username: `jd-publish-it-${fixtureId}`,
      passwordHash: 'pbkdf2_sha256$fixture',
      name: 'JD Publish Integration User',
      email: `jd-publish-it-${fixtureId}@example.com`,
    },
  });
  return user.id;
}

async function cleanupIntegrationUser(userId: string): Promise<void> {
  await prisma.jobPublishTrace.deleteMany({ where: { task: { userId } } });
  await prisma.jobPublishTask.deleteMany({ where: { userId } });
  await prisma.jobDescription.deleteMany({ where: { userId } });
  await prisma.session.deleteMany({ where: { userId } });
  await prisma.user.deleteMany({ where: { id: userId } });
}

async function createReadyJobDescription(
  userId: string,
  title: string,
): Promise<JobDescriptionDto> {
  return createJobDescription({
    userId,
    department: '技术部',
    position: title,
    positionDescription: '负责招聘产品前端体验',
    tone: 'tech',
    status: 'ready_to_publish',
    content: { ...sampleJd, title },
    evaluation: null,
    generationMeta: null,
  });
}

function publishSettings(): PublishJobDescriptionSettings {
  return {
    platform: 'boss-like',
    company: '星河智能',
    salary: '25-40K',
    location: '上海',
    keywords: ['TypeScript', 'React'],
  };
}

async function configureBossLikePlatform(userId: string, baseUrl: string): Promise<void> {
  await upsertCompanyProfileForUser({
    userId,
    name: 'JD Publish Integration Company',
    supportedPlatforms: ['boss-like'],
    platformConfigs: [
      {
        platformId: 'boss-like',
        baseUrl,
        username: 'admin',
        password: 'boss123',
        variables: {},
      },
    ],
    locations: [{ kind: 'remote', label: '远程', city: null, address: null }],
  });
}

async function publishWithBrowser(
  jobDescription: JobDescriptionDto,
  baseUrl: string,
): ReturnType<typeof publishJobDescriptionToBossLike> {
  await configureBossLikePlatform(jobDescription.userId, baseUrl);

  const executor = new PlaywrightBrowserExecutor({ headless: true, timeoutMs: 5_000 });
  try {
    return await publishJobDescriptionToBossLike({
      jobDescription,
      settings: publishSettings(),
      executor,
    });
  } finally {
    await executor.close();
  }
}

function brokenSkillWithRepair(): PublishSkill {
  const repairedSteps = bossLikePublishSkill.steps;
  return {
    ...bossLikePublishSkill,
    id: `boss-like-broken-${Date.now()}-${randomBytes(4).toString('hex')}`,
    version: 1,
    isActive: true,
    steps: bossLikePublishSkill.steps.map((step) => {
      if (step.type !== 'action' || step.id !== 'fill_title') return step;
      const legacyParams = { ...step.params };
      delete legacyParams.target;
      return {
        ...step,
        params: { ...legacyParams, locator: '旧版职位名称' },
        onFail: {
          type: 'fallback_agent',
          reason: 'title label changed',
          repairSteps: repairedSteps,
        },
      };
    }),
    meta: { success_rate: 0, usage_count: 0, created_from: 'explore' },
  };
}

function brokenSkillRequiringReExplore(): PublishSkill {
  return {
    ...bossLikePublishSkill,
    id: `boss-like-reexplore-${Date.now()}-${randomBytes(4).toString('hex')}`,
    version: 1,
    isActive: true,
    steps: bossLikePublishSkill.steps.map((step) => {
      if (step.type !== 'action' || step.id !== 'fill_title') return step;
      return {
        ...step,
        params: {
          ...step.params,
          target: {
            kind: 'field',
            role: 'textbox',
            name: '旧版职位名称',
            exact: true,
            valueHint: 'title',
            stableAttrs: { name: 'old_title' },
            scope: { kind: 'form', name: '发布职位' },
          },
        },
        onFail: {
          type: 'fallback_agent',
          reason: 'title target changed',
        },
      };
    }),
    meta: { success_rate: 0, usage_count: 0, created_from: 'explore' },
  };
}

describe('JD publishing integration flow with real postgres and browser UI', () => {
  beforeAll(async () => {
    process.env.PLATFORM_CREDENTIALS_ENCRYPTION_KEY =
      originalBossLikeEnv.encryptionKey || 'jd-publishing-integration-test-key';
    requireIntegrationEnv('POSTGRES_HOST');
    requireIntegrationEnv('POSTGRES_PORT');
    requireIntegrationEnv('POSTGRES_USER');
    requireIntegrationEnv('POSTGRES_DATABASE');
    await ensureIntegrationSchema();
    await assertPostgresReachable();
  }, 60000);

  afterAll(() => {
    restoreBossLikeEnv();
  });

  beforeEach(async () => {
    await clearBossLikePublishingData();
  });

  afterEach(async () => {
    await clearBossLikePublishingData();
    restoreBossLikeEnv();
  });

  it('explores when no active skill exists, then reuses the active skill on the next publish', async () => {
    const bossLike = await startBossLikeServer();
    const userId = await createIntegrationUser();
    try {
      const firstJd = await createReadyJobDescription(userId, '高级前端工程师');
      const secondJd = await createReadyJobDescription(userId, '资深前端工程师');

      const first = await publishWithBrowser(firstJd, bossLike.baseUrl);
      const skillsAfterExplore = await prisma.publishSkill.findMany({
        where: { name: 'publish_jd', platform: 'boss-like' },
        orderBy: { version: 'asc' },
      });

      const second = await publishWithBrowser(secondJd, bossLike.baseUrl);
      const skillsAfterReuse = await prisma.publishSkill.findMany({
        where: { name: 'publish_jd', platform: 'boss-like' },
        orderBy: { version: 'asc' },
      });
      const secondTask = await prisma.jobPublishTask.findUnique({
        where: { id: second.taskId },
        include: { trace: true },
      });

      expect(first.status).toBe('success');
      expect(skillsAfterExplore).toHaveLength(1);
      expect(skillsAfterExplore[0]?.isActive).toBe(true);
      expect(skillsAfterExplore[0]?.meta).toEqual(
        expect.objectContaining({ created_from: 'explore' }),
      );
      const exploredSteps = skillsAfterExplore[0]?.steps as PublishSkill['steps'];
      expect(exploredSteps).toEqual(
        expect.arrayContaining([
          expect.objectContaining({
            id: 'fill_title',
            params: expect.objectContaining({
              target: expect.objectContaining({
                kind: 'field',
                name: '职位名称',
                valueHint: 'title',
              }),
            }),
          }),
          expect.objectContaining({
            id: 'submit_job',
            params: expect.objectContaining({
              target: expect.objectContaining({ kind: 'button', name: '发布职位' }),
            }),
          }),
        ]),
      );
      expect(second.status).toBe('success');
      expect(second.skillId).toBe(skillsAfterExplore[0]?.id);
      expect(skillsAfterReuse.map((skill) => skill.id)).toEqual([skillsAfterExplore[0]?.id]);
      expect(secondTask?.status).toBe('success');
      expect(secondTask?.currentStep).toBeNull();
      expect(secondTask?.trace?.steps).toEqual(
        expect.arrayContaining([
          expect.objectContaining({ stepId: 'open_new_job', action: 'navigate' }),
          expect.objectContaining({ stepId: 'fill_title', action: 'fill' }),
          expect.objectContaining({ stepId: 'submit_job', action: 'click' }),
          expect.objectContaining({ stepId: 'verify_published', action: 'condition' }),
        ]),
      );
      const secondTraceSteps = (secondTask?.trace?.steps ?? []) as PublishTraceStep[];
      const domActionSteps = secondTraceSteps.filter((step) =>
        ['fill', 'click', 'add_keywords', 'wait_for_text'].includes(step.action),
      );
      expect(domActionSteps.length).toBeGreaterThan(0);
      expect(domActionSteps).toEqual(
        expect.arrayContaining([
          expect.objectContaining({
            stepId: 'fill_title',
            result: expect.objectContaining({
              match: expect.objectContaining({ status: 'unique' }),
            }),
          }),
          expect.objectContaining({
            stepId: 'submit_job',
            result: expect.objectContaining({
              match: expect.objectContaining({ status: 'unique' }),
            }),
          }),
        ]),
      );
      for (const step of domActionSteps) {
        expect(step.result.match).toEqual(
          expect.objectContaining({
            status: 'unique',
            candidateCount: expect.any(Number),
          }),
        );
      }
    } finally {
      await cleanupIntegrationUser(userId);
      await bossLike.close();
    }
  }, 60000);

  it('repairs a failing active skill, activates the repaired version, then publishes with it', async () => {
    const bossLike = await startBossLikeServer();
    const userId = await createIntegrationUser();
    try {
      const jobDescription = await createReadyJobDescription(userId, '自动修复前端工程师');
      await configureBossLikePlatform(userId, bossLike.baseUrl);
      const config = await resolveRecruitmentPlatformRuntimeConfig({
        userId,
        platform: 'boss-like',
      });
      const brokenSkill = await createExploredPublishSkill({
        ...brokenSkillWithRepair(),
        siteFingerprint: config.siteFingerprint,
      });

      const failed = await publishWithBrowser(jobDescription, bossLike.baseUrl);
      const skillsAfterRepair = await prisma.publishSkill.findMany({
        where: { name: 'publish_jd', platform: 'boss-like' },
        orderBy: { version: 'asc' },
      });
      const failedTask = await prisma.jobPublishTask.findUnique({
        where: { id: failed.taskId },
        include: { trace: true },
      });

      const repaired = await publishWithBrowser(jobDescription, bossLike.baseUrl);
      const skillsAfterRepairedPublish = await prisma.publishSkill.findMany({
        where: { name: 'publish_jd', platform: 'boss-like' },
        orderBy: { version: 'asc' },
      });

      expect(failed.status).toBe('failed');
      expect(failed.skillId).toBe(brokenSkill.id);
      expect(failedTask?.trace?.steps).toEqual(
        expect.arrayContaining([
          expect.objectContaining({
            stepId: 'fill_title',
            action: 'fill',
            result: expect.objectContaining({
              match: expect.objectContaining({ status: 'not_found' }),
            }),
          }),
          expect.objectContaining({ stepId: 'fallback_agent', action: 'fallback_agent' }),
          expect.objectContaining({ stepId: 'skill_upgrade', action: 'skill_upgrade' }),
        ]),
      );
      expect(skillsAfterRepair).toHaveLength(2);
      expect(skillsAfterRepair[0]).toEqual(
        expect.objectContaining({ version: 1, isActive: false }),
      );
      expect(skillsAfterRepair[1]).toEqual(expect.objectContaining({ version: 2, isActive: true }));
      expect(skillsAfterRepair[1]?.meta).toEqual(
        expect.objectContaining({
          created_from: 'agent',
          repaired_from_skill_id: brokenSkill.id,
          repaired_from_version: 1,
          failed_step_id: 'fill_title',
          repair_reason: 'title label changed',
        }),
      );

      expect(repaired.status).toBe('success');
      expect(repaired.skillId).toBe(skillsAfterRepair[1]?.id);
      expect(skillsAfterRepairedPublish).toHaveLength(2);
    } finally {
      await cleanupIntegrationUser(userId);
      await bossLike.close();
    }
  }, 60000);

  it('re-explores a failed structured target, activates the repaired version, then publishes with it', async () => {
    const bossLike = await startBossLikeServer();
    const userId = await createIntegrationUser();
    try {
      const jobDescription = await createReadyJobDescription(userId, '重探索修复前端工程师');
      await configureBossLikePlatform(userId, bossLike.baseUrl);
      const config = await resolveRecruitmentPlatformRuntimeConfig({
        userId,
        platform: 'boss-like',
      });
      const brokenSkill = await createExploredPublishSkill({
        ...brokenSkillRequiringReExplore(),
        siteFingerprint: config.siteFingerprint,
      });

      const failed = await publishWithBrowser(jobDescription, bossLike.baseUrl);
      const skillsAfterRepair = await prisma.publishSkill.findMany({
        where: { name: 'publish_jd', platform: 'boss-like' },
        orderBy: { version: 'asc' },
      });
      const failedTask = await prisma.jobPublishTask.findUnique({
        where: { id: failed.taskId },
        include: { trace: true },
      });

      const repaired = await publishWithBrowser(jobDescription, bossLike.baseUrl);

      expect(failed.status).toBe('failed');
      expect(failed.skillId).toBe(brokenSkill.id);
      expect(failedTask?.trace?.steps).toEqual(
        expect.arrayContaining([
          expect.objectContaining({
            stepId: 'fill_title',
            action: 'fill',
            result: expect.objectContaining({
              match: expect.objectContaining({ status: 'not_found' }),
            }),
          }),
          expect.objectContaining({
            stepId: 'fallback_agent',
            action: 'fallback_agent',
            result: expect.objectContaining({
              success: true,
              match: expect.objectContaining({
                status: 'unique',
                target: expect.objectContaining({
                  name: '职位名称',
                  valueHint: 'title',
                }),
              }),
            }),
          }),
          expect.objectContaining({ stepId: 'skill_upgrade', action: 'skill_upgrade' }),
        ]),
      );
      expect(skillsAfterRepair).toHaveLength(2);
      expect(skillsAfterRepair[0]).toEqual(
        expect.objectContaining({ version: 1, isActive: false }),
      );
      expect(skillsAfterRepair[1]).toEqual(expect.objectContaining({ version: 2, isActive: true }));
      expect(skillsAfterRepair[1]?.meta).toEqual(
        expect.objectContaining({
          created_from: 'agent',
          repaired_from_skill_id: brokenSkill.id,
          repaired_from_version: 1,
          failed_step_id: 'fill_title',
        }),
      );

      expect(repaired.status).toBe('success');
      expect(repaired.skillId).toBe(skillsAfterRepair[1]?.id);
    } finally {
      await cleanupIntegrationUser(userId);
      await bossLike.close();
    }
  }, 60000);
});
