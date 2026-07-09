/** @jest-environment node */
import '../chat/test-env';

import { randomBytes } from 'node:crypto';
import { createServer } from 'node:http';
import type { AddressInfo } from 'node:net';
import {
  assertPostgresReachable,
  ensureIntegrationSchema,
  requireIntegrationEnv,
} from '../chat/test-env';
import { BossLikeCandidateSourceAdapter } from '@/lib/candidate-screening/adapters/boss-like';
import { createCandidateScreeningRun } from '@/lib/candidate-screening/repo';
import {
  runCandidateScreening,
  type ScreeningRunnerDependencies,
} from '@/lib/candidate-screening/runner';
import { PlaywrightBrowserExecutor } from '@/lib/browser/executors/playwright-executor';
import { createJobDescription } from '@/lib/jd/job-description-repo';
import { prisma } from '@/lib/prisma';
import type { JD, JobDescriptionDto } from '@/types';

const embedDocumentsMock = jest.fn();
const embedQueryMock = jest.fn();

jest.mock('@/lib/rag/embed', () => ({
  embedDocuments: (...args: unknown[]) => embedDocumentsMock(...args),
  embedQuery: (...args: unknown[]) => embedQueryMock(...args),
  getConfiguredEmbeddingModel: () => 'text-embedding-3-small',
}));

type BossLikeServer = {
  baseUrl: string;
  requests: string[];
  close: () => Promise<void>;
};

const sampleJd: JD = {
  title: '高级后端工程师',
  summary: '负责核心系统和招聘产品服务端能力',
  responsibilities: ['建设 Java 微服务', '维护候选人筛选链路'],
  requirements: ['Java', '微服务', 'PostgreSQL'],
  bonus: ['招聘 SaaS 经验'],
  highlights: ['AI 招聘产品'],
};

const adaResumeId = '301';
const graceResumeId = '302';

function escapeHtml(value: string): string {
  return value
    .replace(/&/g, '&amp;')
    .replace(/</g, '&lt;')
    .replace(/>/g, '&gt;')
    .replace(/"/g, '&quot;');
}

function renderCandidateArticle(params: {
  id: string;
  name: string;
  title: string;
  company: string;
  experience: string;
  resume: string;
}): string {
  const profileUrl = `/employer/resumes/${escapeHtml(params.id)}`;
  return `<article data-candidate-id="${escapeHtml(params.id)}" data-profile-url="${profileUrl}">
    <h2>${escapeHtml(params.name)}</h2>
    <div data-field="title">${escapeHtml(params.title)}</div>
    <div data-field="company">${escapeHtml(params.company)}</div>
    <div data-field="experience">${escapeHtml(params.experience)}</div>
    <div data-field="resume">${escapeHtml(params.resume)}</div>
  </article>`;
}

function candidateFixtures(): string[] {
  return [
    renderCandidateArticle({
      id: adaResumeId,
      name: 'Ada Lovelace',
      title: 'Senior Backend Engineer',
      company: 'Analytical Engines',
      experience: '8 年',
      resume: 'Java 微服务 PostgreSQL 招聘 SaaS 候选人筛选 负责核心系统稳定性和平台工程。',
    }),
    renderCandidateArticle({
      id: graceResumeId,
      name: 'Grace Hopper',
      title: 'Staff Platform Engineer',
      company: 'Compiler Labs',
      experience: '10 年',
      resume: 'Java 分布式系统 PostgreSQL 搜索召回 招聘平台 自动化工具 负责工程效率。',
    }),
  ];
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

function renderResumeListPage(): string {
  return `<!doctype html>
<html lang="zh-CN">
  <head><meta charset="utf-8" /><title>候选人库</title></head>
  <body>
    <main>
      <h1>候选人库</h1>
      <label>搜索候选人 <input name="keyword" type="search" /></label>
      <button type="button">搜索</button>
      <p>简历</p>
      <section>${candidateFixtures().join('\n')}</section>
    </main>
  </body>
</html>`;
}

function renderResumeDetailPage(id: string): string {
  const article =
    candidateFixtures().find((fixture) => fixture.includes(`data-candidate-id="${id}"`)) ??
    candidateFixtures()[0];
  return `<!doctype html>
<html lang="zh-CN">
  <head><meta charset="utf-8" /><title>候选人详情</title></head>
  <body>
    <main>
      <h1>候选人详情</h1>
      ${article}
      <button type="button">收藏</button>
      <button type="button" id="open-chat">打招呼</button>
      <form method="post" action="/employer/resumes/${escapeHtml(id)}/messages">
        <label>消息 <textarea name="message"></textarea></label>
        <button type="submit">发送</button>
      </form>
    </main>
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
      response.end(renderResumeListPage());
      return;
    }
    const messageMatch = url.pathname.match(/^\/employer\/resumes\/([^/]+)\/messages$/);
    if (request.method === 'POST' && messageMatch) {
      request.resume();
      request.on('end', () => {
        response.end('<!doctype html><html><body>Message sent</body></html>');
      });
      return;
    }
    const detailMatch = url.pathname.match(/^\/employer\/resumes\/([^/]+)$/);
    if (detailMatch) {
      response.end(renderResumeDetailPage(detailMatch[1] ?? adaResumeId));
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

async function createIntegrationUser(): Promise<string> {
  const fixtureId = `${Date.now()}-${randomBytes(4).toString('hex')}`;
  const user = await prisma.user.create({
    data: {
      username: `candidate-screening-it-${fixtureId}`,
      passwordHash: 'pbkdf2_sha256$fixture',
      name: 'Candidate Screening Integration User',
      email: `candidate-screening-it-${fixtureId}@example.com`,
    },
  });
  return user.id;
}

async function createPublishedJobDescription(userId: string): Promise<JobDescriptionDto> {
  return createJobDescription({
    userId,
    department: '技术部',
    position: '高级后端工程师',
    positionDescription: '负责 Java 微服务和招聘产品候选人筛选',
    tone: 'tech',
    status: 'published',
    content: sampleJd,
    evaluation: null,
    generationMeta: {
      model: 'integration-fixture',
      promptVersion: 'test',
      action: 'seed',
      context: null,
    },
  });
}

async function cleanupIntegrationUser(userId: string): Promise<void> {
  await prisma.candidateActionLog.deleteMany({ where: { userId } });
  await prisma.candidateScreeningResult.deleteMany({ where: { userId } });
  await prisma.candidateScreeningRun.deleteMany({ where: { userId } });
  await prisma.candidateResumeChunk.deleteMany({ where: { userId } });
  await prisma.candidateResume.deleteMany({ where: { userId } });
  await prisma.candidate.deleteMany({ where: { userId } });
  await prisma.jobDescription.deleteMany({ where: { userId } });
  await prisma.session.deleteMany({ where: { userId } });
  await prisma.user.deleteMany({ where: { id: userId } });
}

const evaluateCandidate: ScreeningRunnerDependencies['evaluateCandidate'] = async ({
  candidateName,
}) => ({
  tags: {
    skills: ['Java', 'PostgreSQL'],
    domainKnowledge: ['招聘 SaaS'],
    generalAbility: ['ownership'],
    risk: [],
    activity: ['active'],
    custom: [],
  },
  score: {
    skill: 90,
    domain: 84,
    ability: 88,
    risk: 92,
    llmBonus: 2,
    total: candidateName.includes('Ada') ? 91 : 87,
  },
  decision: {
    action: 'chat',
    priority: 'high',
    reason: `${candidateName} 匹配 Java 微服务和招聘 SaaS 经验`,
  },
});

describe('candidate screening integration flow with real postgres and boss-like browser fixture', () => {
  beforeAll(async () => {
    requireIntegrationEnv('POSTGRES_HOST');
    requireIntegrationEnv('POSTGRES_PORT');
    requireIntegrationEnv('POSTGRES_USER');
    requireIntegrationEnv('POSTGRES_DATABASE');
    await ensureIntegrationSchema();
    await assertPostgresReachable();
  }, 60000);

  beforeEach(() => {
    embedDocumentsMock.mockReset();
    embedQueryMock.mockReset();
    embedDocumentsMock.mockImplementation(async (documents: string[]) =>
      documents.map((_, index) => [1 - index * 0.05, index * 0.05, 0]),
    );
    embedQueryMock.mockResolvedValue([1, 0, 0]);
  });

  it('stores live resumes, indexes vectors, evaluates candidates, and links results to the JD', async () => {
    const bossLike = await startBossLikeServer();
    const userId = await createIntegrationUser();

    try {
      const jobDescription = await createPublishedJobDescription(userId);
      const run = await createCandidateScreeningRun({
        userId,
        jobDescriptionId: jobDescription.id,
        platform: 'boss-like',
        mode: 'dry_run',
        status: 'pending',
      });

      await runCandidateScreening({
        runId: run.id,
        userId,
        jobDescription,
        request: {
          platform: 'boss-like',
          mode: 'dry_run',
          maxCandidates: 2,
          batchSize: 2,
          allowAlreadyContacted: false,
        },
        dependencies: {
          createAdapter: () =>
            new BossLikeCandidateSourceAdapter({
              baseUrl: bossLike.baseUrl,
              executor: new PlaywrightBrowserExecutor({ headless: true, timeoutMs: 8_000 }),
              username: 'admin',
              password: 'boss123',
            }),
          evaluateCandidate,
        },
      });

      const completedRun = await prisma.candidateScreeningRun.findUniqueOrThrow({
        where: { id: run.id },
      });
      const candidates = await prisma.candidate.findMany({ where: { userId } });
      const results = await prisma.candidateScreeningResult.findMany({
        where: { userId, jobDescriptionId: jobDescription.id },
        orderBy: { finalScore: 'desc' },
      });
      const chunks = await prisma.candidateResumeChunk.findMany({ where: { userId } });
      const actionLogs = await prisma.candidateActionLog.findMany({ where: { userId } });

      expect(completedRun.status).toBe('success');
      expect(candidates).toHaveLength(2);
      expect(results).toHaveLength(2);
      expect(results[0]?.jobDescriptionId).toBe(jobDescription.id);
      expect(chunks.length).toBeGreaterThan(0);
      expect(actionLogs.every((log) => log.mode === 'dry_run')).toBe(true);
      expect(actionLogs.every((log) => log.status === 'planned')).toBe(true);
      expect(bossLike.requests).toContain('GET /employer/resumes');
    } finally {
      await cleanupIntegrationUser(userId);
      await bossLike.close();
    }
  }, 120000);

  it('executes planned chat actions through the browser during execution runs', async () => {
    const bossLike = await startBossLikeServer();
    const userId = await createIntegrationUser();

    try {
      const jobDescription = await createPublishedJobDescription(userId);
      const run = await createCandidateScreeningRun({
        userId,
        jobDescriptionId: jobDescription.id,
        platform: 'boss-like',
        mode: 'execution',
        status: 'pending',
      });

      await runCandidateScreening({
        runId: run.id,
        userId,
        jobDescription,
        request: {
          platform: 'boss-like',
          mode: 'execution',
          maxCandidates: 1,
          batchSize: 1,
          allowAlreadyContacted: false,
        },
        dependencies: {
          createAdapter: () =>
            new BossLikeCandidateSourceAdapter({
              baseUrl: bossLike.baseUrl,
              executor: new PlaywrightBrowserExecutor({ headless: true, timeoutMs: 8_000 }),
              username: 'admin',
              password: 'boss123',
            }),
          evaluateCandidate,
        },
      });

      const completedRun = await prisma.candidateScreeningRun.findUniqueOrThrow({
        where: { id: run.id },
      });
      const actionLogs = await prisma.candidateActionLog.findMany({
        where: { userId, runId: run.id },
      });
      const result = await prisma.candidateScreeningResult.findFirstOrThrow({
        where: { userId, runId: run.id, jobDescriptionId: jobDescription.id },
      });

      expect(completedRun.status).toBe('success');
      expect(completedRun.currentStage).toBe('finalizing');
      expect(actionLogs).toHaveLength(1);
      expect(actionLogs[0]).toMatchObject({
        mode: 'execution',
        action: 'chat',
        status: 'success',
      });
      expect(result.actionStatus).toBe('success');
      expect(result.interviewStage).toBe('contacted');
      expect(bossLike.requests).toContain('GET /employer/resumes');
      expect(bossLike.requests).toContain(`GET /employer/resumes/${adaResumeId}`);
      expect(bossLike.requests).toContain(`POST /employer/resumes/${adaResumeId}/messages`);
    } finally {
      await cleanupIntegrationUser(userId);
      await bossLike.close();
    }
  }, 120000);
});
