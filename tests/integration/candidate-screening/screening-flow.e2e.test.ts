/** @jest-environment node */
import '../chat/test-env';

import { randomBytes } from 'node:crypto';
import { createServer } from 'node:http';
import type { AddressInfo } from 'node:net';
import {
  assertPostgresReachable,
  assertRedisReachable,
  ensureIntegrationSchema,
  requireIntegrationEnv,
} from '../chat/test-env';
import { BossLikeCandidateSourceAdapter } from '@/lib/candidate-screening/adapters/boss-like';
import { createCandidateScreeningWorkflowSession } from '@/lib/candidate-screening/workflow/executor';
import { exploreBossLikeScreeningWorkflow } from '@/lib/candidate-screening/workflow/explore';
import { buildBossLikeScreeningSkill } from '@/lib/candidate-screening/workflow/skill-registry';
import {
  createCandidateScreeningRun,
  getCandidateScreeningRun,
  listCandidateScreeningRunEvents,
} from '@/lib/candidate-screening/repo';
import {
  createExploredPublishSkill,
  createNextActivePublishSkillVersion,
} from '@/lib/jd-publishing/publish-repo';
import {
  runCandidateScreening,
  type ScreeningRunnerDependencies,
} from '@/lib/candidate-screening/runner';
import { PlaywrightBrowserExecutor } from '@/lib/browser/executors/playwright-executor';
import { createJobDescription } from '@/lib/jd/job-description-repo';
import { prisma } from '@/lib/prisma';
import { createSiteFingerprint } from '@/lib/recruitment-platform-config';
import type { JD, JobDescriptionDto } from '@/types';
import type { CreateScreeningRunRequest } from '@/lib/candidate-screening/types';

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
  sentMessageIds: string[];
  collectedCandidateIds: string[];
  setSearchButtonLabel: (label: string) => void;
  setAmbiguousSearchButtons: (enabled: boolean) => void;
  setGreetButtonLabel: (label: string) => void;
  setCandidateResultsVisible: (visible: boolean) => void;
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
      <form id="login-form">
        <label>用户名 <input name="username" type="text" /></label>
        <label>密码 <input name="password" type="password" /></label>
        <button type="button" id="login">登录</button>
      </form>
    </main>
    <script>
      document.querySelector('#login').addEventListener('click', () => {
        document.cookie = 'boss-like-auth=1; Path=/; SameSite=Lax';
        window.location.href = '/employer/resumes';
      });
    </script>
  </body>
</html>`;
}

function renderResumeListPage(
  searchButtonLabel: string,
  candidatesVisible: boolean,
  ambiguousSearchButtons: boolean,
): string {
  const searchButtons = ambiguousSearchButtons
    ? `<button type="button" id="search-preview">${escapeHtml(searchButtonLabel)}</button>
        <button type="submit" id="search-now">${escapeHtml(searchButtonLabel)}</button>`
    : `<button type="submit">${escapeHtml(searchButtonLabel)}</button>`;
  return `<!doctype html>
<html lang="zh-CN">
  <head><meta charset="utf-8" /><title>候选人库</title></head>
  <body>
    <main>
      <h1>候选人库</h1>
      <form method="get" action="/employer/resumes">
        <label>搜索候选人 <input name="keyword" type="search" /></label>
        ${searchButtons}
      </form>
      <p>${candidatesVisible ? '简历' : '暂无简历数据'}</p>
      <section>${candidatesVisible ? candidateFixtures().join('\n') : ''}</section>
    </main>
  </body>
</html>`;
}

function renderResumeDetailPage(id: string, greetButtonLabel: string): string {
  const article =
    candidateFixtures().find((fixture) => fixture.includes(`data-candidate-id="${id}"`)) ??
    candidateFixtures()[0];
  const candidateName = id === graceResumeId ? 'Grace Hopper' : 'Ada Lovelace';
  return `<!doctype html>
<html lang="zh-CN">
  <head><meta charset="utf-8" /><title>候选人详情</title></head>
  <body>
    <main>
      <h1>${candidateName}</h1>
      <p>候选人详情</p>
      ${article}
      <form aria-label="候选人操作">
        <button type="button" id="collect">收藏</button>
        <button type="button" id="open-chat">${escapeHtml(greetButtonLabel)}</button>
      </form>
      <form id="chat-composer" method="post" action="/employer/resumes/${escapeHtml(id)}/messages" hidden>
        <label>消息 <textarea name="message" disabled></textarea></label>
        <button type="submit" disabled>发送</button>
      </form>
    </main>
    <script>
      const chatComposer = document.querySelector('#chat-composer');
      const messageInput = chatComposer.querySelector('textarea[name="message"]');
      const sendButton = chatComposer.querySelector('button[type="submit"]');
      let chatOpened = false;

      document.querySelector('#open-chat').addEventListener('click', () => {
        chatOpened = true;
        chatComposer.hidden = false;
        messageInput.disabled = false;
        sendButton.disabled = false;
      });
      chatComposer.addEventListener('submit', (event) => {
        if (!chatOpened) event.preventDefault();
      });
      document.querySelector('#collect').addEventListener('click', () => {
        const request = new XMLHttpRequest();
        request.open('POST', '/employer/resumes/${escapeHtml(id)}/collect', false);
        request.send();
      });
    </script>
  </body>
</html>`;
}

async function startBossLikeServer(): Promise<BossLikeServer> {
  const requests: string[] = [];
  const sentMessageIds: string[] = [];
  const collectedCandidateIds: string[] = [];
  let searchButtonLabel = '搜索';
  let ambiguousSearchButtons = false;
  let greetButtonLabel = '打招呼';
  let candidateResultsVisible = true;
  const server = createServer((request, response) => {
    const url = new URL(request.url ?? '/', 'http://127.0.0.1');
    requests.push(`${request.method ?? 'GET'} ${url.pathname}${url.search}`);
    response.setHeader('content-type', 'text/html; charset=utf-8');

    if (url.pathname === '/employer/login') {
      response.end(renderLoginPage());
      return;
    }
    if (url.pathname === '/employer/resumes') {
      if (!request.headers.cookie?.includes('boss-like-auth=1')) {
        response.statusCode = 302;
        response.setHeader('location', '/employer/login');
        response.end();
        return;
      }
      response.end(
        renderResumeListPage(searchButtonLabel, candidateResultsVisible, ambiguousSearchButtons),
      );
      return;
    }
    const messageMatch = url.pathname.match(/^\/employer\/resumes\/([^/]+)\/messages$/);
    if (request.method === 'POST' && messageMatch) {
      request.resume();
      request.on('end', () => {
        sentMessageIds.push(messageMatch[1] ?? '');
        response.end('<!doctype html><html><body>消息已发送</body></html>');
      });
      return;
    }
    const collectMatch = url.pathname.match(/^\/employer\/resumes\/([^/]+)\/collect$/);
    if (request.method === 'POST' && collectMatch) {
      request.resume();
      request.on('end', () => {
        collectedCandidateIds.push(collectMatch[1] ?? '');
        response.end('<!doctype html><html><body>Candidate collected</body></html>');
      });
      return;
    }
    const detailMatch = url.pathname.match(/^\/employer\/resumes\/([^/]+)$/);
    if (detailMatch) {
      response.end(renderResumeDetailPage(detailMatch[1] ?? adaResumeId, greetButtonLabel));
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
    sentMessageIds,
    collectedCandidateIds,
    setSearchButtonLabel: (label) => {
      searchButtonLabel = label;
    },
    setAmbiguousSearchButtons: (enabled) => {
      ambiguousSearchButtons = enabled;
    },
    setGreetButtonLabel: (label) => {
      greetButtonLabel = label;
    },
    setCandidateResultsVisible: (visible) => {
      candidateResultsVisible = visible;
    },
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

async function cleanupScreeningWorkflows(): Promise<void> {
  await prisma.publishSkill.deleteMany({
    where: { name: 'screen_candidates', platform: 'boss-like' },
  });
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

const evaluateCandidateWithChatAndCollect: ScreeningRunnerDependencies['evaluateCandidate'] =
  async (params) => {
    const evaluation = await evaluateCandidate(params);
    return {
      ...evaluation,
      decision: {
        ...evaluation.decision,
        action: params.candidateName.includes('Ada') ? 'chat' : 'collect',
      },
    };
  };

const browserExecutionRequest: CreateScreeningRunRequest = {
  platform: 'boss-like',
  mode: 'execution',
  maxCandidates: 2,
  batchSize: 2,
  allowAlreadyContacted: true,
};

const workflowSearchPlan = {
  keywords: ['Java'],
  filters: {},
  priorityTags: [],
  retrievalQuery: 'Java 后端',
};

function screeningSiteFingerprint(baseUrl: string): string {
  return createSiteFingerprint(baseUrl, { resumeListPath: '/employer/resumes' });
}

async function createRunAndExecute(params: {
  userId: string;
  jobDescription: JobDescriptionDto;
  bossLike: BossLikeServer;
  request: CreateScreeningRunRequest;
  evaluate: ScreeningRunnerDependencies['evaluateCandidate'];
}) {
  const run = await createCandidateScreeningRun({
    userId: params.userId,
    jobDescriptionId: params.jobDescription.id,
    platform: params.request.platform,
    mode: params.request.mode,
    status: 'pending',
  });

  await runCandidateScreening({
    runId: run.id,
    userId: params.userId,
    jobDescription: params.jobDescription,
    request: params.request,
    dependencies: {
      createAdapter: () =>
        new BossLikeCandidateSourceAdapter({
          baseUrl: params.bossLike.baseUrl,
          executor: new PlaywrightBrowserExecutor({ headless: true, timeoutMs: 8_000 }),
          username: 'admin',
          password: 'boss123',
        }),
      evaluateCandidate: params.evaluate,
    },
  });

  return run;
}

describe('candidate screening integration flow with real postgres and boss-like browser fixture', () => {
  beforeAll(async () => {
    requireIntegrationEnv('POSTGRES_HOST');
    requireIntegrationEnv('POSTGRES_PORT');
    requireIntegrationEnv('POSTGRES_USER');
    requireIntegrationEnv('POSTGRES_DATABASE');
    requireIntegrationEnv('REDIS_URL');
    await ensureIntegrationSchema();
    await assertPostgresReachable();
    await assertRedisReachable();
  }, 60000);

  beforeEach(() => {
    embedDocumentsMock.mockReset();
    embedQueryMock.mockReset();
    embedDocumentsMock.mockImplementation(async (documents: string[]) =>
      documents.map((_, index) => [1 - index * 0.05, index * 0.05, 0]),
    );
    embedQueryMock.mockResolvedValue([1, 0, 0]);
  });

  it('requires greeting to open the chat composer before a browser can submit a message', async () => {
    const bossLike = await startBossLikeServer();
    const executor = new PlaywrightBrowserExecutor({ headless: true, timeoutMs: 500 });

    try {
      expect(
        await executor.navigate(`${bossLike.baseUrl}/employer/resumes/${adaResumeId}`),
      ).toMatchObject({ success: true });

      const beforeGreeting = await executor.fill('消息', '您好，想和您沟通岗位机会。');

      expect(beforeGreeting).toMatchObject({ success: false });
      expect(bossLike.requests).not.toContain(`POST /employer/resumes/${adaResumeId}/messages`);
      expect(await executor.click('打招呼')).toMatchObject({ success: true });
      expect(await executor.fill('消息', '您好，想和您沟通岗位机会。')).toMatchObject({
        success: true,
      });
      expect(await executor.click('发送')).toMatchObject({ success: true });
      expect(await executor.waitForUrl(`/employer/resumes/${adaResumeId}/messages`)).toMatchObject({
        success: true,
      });
      expect(await executor.waitForText('消息已发送')).toMatchObject({ success: true });
      expect(bossLike.requests).toContain(`POST /employer/resumes/${adaResumeId}/messages`);
    } finally {
      await executor.close();
      await bossLike.close();
    }
  }, 30000);

  it('treats repeated candidate text as a search readiness condition, not a unique target', async () => {
    const bossLike = await startBossLikeServer();
    const executor = new PlaywrightBrowserExecutor({ headless: true, timeoutMs: 8_000 });

    try {
      await expect(executor.navigate(`${bossLike.baseUrl}/employer/resumes`)).resolves.toEqual(
        expect.objectContaining({ success: true }),
      );
      await expect(executor.fill('用户名', 'admin')).resolves.toEqual(
        expect.objectContaining({ success: true }),
      );
      await expect(executor.fill('密码', 'boss123')).resolves.toEqual(
        expect.objectContaining({ success: true }),
      );
      await expect(executor.click('登录')).resolves.toEqual(
        expect.objectContaining({ success: true }),
      );
      await expect(executor.waitForUrl('/employer/resumes')).resolves.toEqual(
        expect.objectContaining({ success: true }),
      );
      await expect(executor.waitForText('候选人')).resolves.toEqual(
        expect.objectContaining({ success: true }),
      );
    } finally {
      await executor.close();
      await bossLike.close();
    }
  }, 30000);

  it('accepts unchanged candidate HTML after the keyword query navigation completes', async () => {
    const bossLike = await startBossLikeServer();
    const executor = new PlaywrightBrowserExecutor({ headless: true, timeoutMs: 8_000 });

    try {
      const explored = await exploreBossLikeScreeningWorkflow({
        executor,
        baseUrl: bossLike.baseUrl,
        credentials: { username: 'admin', password: 'boss123' },
        searchPlan: workflowSearchPlan,
      });

      expect(explored).toEqual(
        expect.objectContaining({
          firstKeyword: 'Java',
          firstListHtml: expect.stringContaining(`data-candidate-id="${adaResumeId}"`),
        }),
      );
      expect(bossLike.requests).toContain('GET /employer/resumes?keyword=Java');
    } finally {
      await executor.close();
      await bossLike.close();
    }
  }, 30000);

  it('repairs both stale chat-composer targets before retrying another candidate', async () => {
    const bossLike = await startBossLikeServer();
    const userId = await createIntegrationUser();
    let session: ReturnType<typeof createCandidateScreeningWorkflowSession> | null = null;

    try {
      await cleanupScreeningWorkflows();
      const jobDescription = await createPublishedJobDescription(userId);
      const staleSkill = await createExploredPublishSkill(
        buildBossLikeScreeningSkill(
          { id: 'screen-candidates-stale-chat-v1', version: 1 },
          {
            messageInput: {
              kind: 'field',
              role: 'textbox',
              name: '消息',
              exact: true,
              valueHint: 'message',
              scope: { kind: 'form', name: 'Ada Lovelace' },
            },
            sendButton: {
              kind: 'button',
              role: 'button',
              name: '发送',
              exact: true,
              scope: { kind: 'form', name: 'Ada Lovelace' },
            },
          },
        ),
      );
      const run = await createCandidateScreeningRun({
        userId,
        jobDescriptionId: jobDescription.id,
        platform: 'boss-like',
        mode: 'execution',
        status: 'pending',
      });
      const adapter = new BossLikeCandidateSourceAdapter({
        baseUrl: bossLike.baseUrl,
        executor: new PlaywrightBrowserExecutor({ headless: true, timeoutMs: 8_000 }),
        username: 'admin',
        password: 'boss123',
      });
      session = createCandidateScreeningWorkflowSession({
        adapter,
        userId,
        runId: run.id,
        jobDescriptionId: jobDescription.id,
        platform: 'boss-like',
      });

      await session.loadExact({ skillId: staleSkill.id, stage: 'executing_actions' });
      const result = await session.contactAndCollectCandidate(
        {
          candidateId: graceResumeId,
          displayName: 'Grace Hopper',
          profileUrl: `${bossLike.baseUrl}/employer/resumes/${graceResumeId}`,
        },
        {
          action: 'chat',
          priority: 'high',
          message: '您好，想和您沟通高级后端工程师岗位机会。',
          reason: 'Java 微服务经验匹配',
        },
      );

      const persisted = await getCandidateScreeningRun({ userId, runId: run.id });
      const repairedWorkflow = await prisma.publishSkill.findUnique({
        where: { id: persisted?.skillId ?? '' },
      });
      const events = await listCandidateScreeningRunEvents({ userId, runId: run.id });
      const messageStep = repairedWorkflow?.steps.find(
        (step) => step.id === 'contact_fill_message' && step.type === 'action',
      );
      const sendStep = repairedWorkflow?.steps.find(
        (step) => step.id === 'contact_send' && step.type === 'action',
      );

      expect(result).toEqual(expect.objectContaining({ success: true }));
      expect(persisted?.skillId).not.toBe(staleSkill.id);
      expect(messageStep).toEqual(
        expect.objectContaining({
          params: expect.objectContaining({
            target: expect.objectContaining({ name: '消息', scope: { kind: 'form' } }),
          }),
        }),
      );
      expect(sendStep).toEqual(
        expect.objectContaining({
          params: expect.objectContaining({
            target: expect.objectContaining({ name: '发送', scope: { kind: 'form' } }),
          }),
        }),
      );
      expect(events.map((event) => event.message)).toEqual(
        expect.arrayContaining([
          'Workflow 修复并升级到 v2',
          'Workflow 重试步骤：contact_open',
          'Workflow 重试成功：contact_open',
        ]),
      );
      expect(bossLike.requests).toContain(`POST /employer/resumes/${graceResumeId}/messages`);
    } finally {
      await session?.close();
      await cleanupIntegrationUser(userId);
      await cleanupScreeningWorkflows();
      await bossLike.close();
    }
  }, 120000);

  it('relearns composer targets after repairing a drifted greeting button in a real browser', async () => {
    const bossLike = await startBossLikeServer();
    const userId = await createIntegrationUser();
    let session: ReturnType<typeof createCandidateScreeningWorkflowSession> | null = null;

    try {
      await cleanupScreeningWorkflows();
      bossLike.setGreetButtonLabel('开始沟通');
      const jobDescription = await createPublishedJobDescription(userId);
      const staleSkill = await createExploredPublishSkill(
        buildBossLikeScreeningSkill(
          { id: 'screen-candidates-stale-greeting-v1', version: 1 },
          {
            messageInput: {
              kind: 'field',
              role: 'textbox',
              name: '消息',
              exact: true,
              valueHint: 'message',
              scope: { kind: 'form', name: 'Ada Lovelace' },
            },
            sendButton: {
              kind: 'button',
              role: 'button',
              name: '发送',
              exact: true,
              scope: { kind: 'form', name: 'Ada Lovelace' },
            },
          },
        ),
      );
      const run = await createCandidateScreeningRun({
        userId,
        jobDescriptionId: jobDescription.id,
        platform: 'boss-like',
        mode: 'execution',
        status: 'pending',
      });
      const adapter = new BossLikeCandidateSourceAdapter({
        baseUrl: bossLike.baseUrl,
        executor: new PlaywrightBrowserExecutor({ headless: true, timeoutMs: 8_000 }),
        username: 'admin',
        password: 'boss123',
      });
      session = createCandidateScreeningWorkflowSession({
        adapter,
        userId,
        runId: run.id,
        jobDescriptionId: jobDescription.id,
        platform: 'boss-like',
      });

      await session.loadExact({ skillId: staleSkill.id, stage: 'executing_actions' });
      const result = await session.contactAndCollectCandidate(
        {
          candidateId: graceResumeId,
          displayName: 'Grace Hopper',
          profileUrl: `${bossLike.baseUrl}/employer/resumes/${graceResumeId}`,
        },
        {
          action: 'chat',
          priority: 'high',
          message: '您好，想和您沟通高级后端工程师岗位机会。',
          reason: 'Java 微服务经验匹配',
        },
      );

      const persisted = await getCandidateScreeningRun({ userId, runId: run.id });
      const repairedWorkflow = await prisma.publishSkill.findUnique({
        where: { id: persisted?.skillId ?? '' },
      });
      const events = await listCandidateScreeningRunEvents({ userId, runId: run.id });
      const greetingStep = repairedWorkflow?.steps.find(
        (step) => step.id === 'contact_open_greeting' && step.type === 'action',
      );
      const messageStep = repairedWorkflow?.steps.find(
        (step) => step.id === 'contact_fill_message' && step.type === 'action',
      );
      const sendStep = repairedWorkflow?.steps.find(
        (step) => step.id === 'contact_send' && step.type === 'action',
      );

      expect(result.success).toBe(true);
      expect(greetingStep).toEqual(
        expect.objectContaining({
          params: expect.objectContaining({
            target: expect.objectContaining({ name: '开始沟通' }),
          }),
        }),
      );
      expect(messageStep).toEqual(
        expect.objectContaining({
          params: expect.objectContaining({
            target: expect.objectContaining({ scope: { kind: 'form' } }),
          }),
        }),
      );
      expect(sendStep).toEqual(
        expect.objectContaining({
          params: expect.objectContaining({
            target: expect.objectContaining({ scope: { kind: 'form' } }),
          }),
        }),
      );
      expect(events.map((event) => event.message)).toEqual(
        expect.arrayContaining(['Workflow 修复并升级到 v2', 'Workflow 重试成功：contact_open']),
      );
      expect(bossLike.requests).toContain(`POST /employer/resumes/${graceResumeId}/messages`);
    } finally {
      await session?.close();
      await cleanupIntegrationUser(userId);
      await cleanupScreeningWorkflows();
      await bossLike.close();
    }
  }, 120000);

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
      expect(bossLike.requests).toContain('GET /employer/login');
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
      expect(actionLogs).toEqual(
        expect.arrayContaining([
          expect.objectContaining({ mode: 'execution', action: 'chat', status: 'success' }),
          expect.objectContaining({ mode: 'execution', action: 'collect', status: 'success' }),
        ]),
      );
      expect(result.actionStatus).toBe('success');
      expect(result.interviewStage).toBe('collected');
      expect(bossLike.requests).toContain('GET /employer/resumes');
      expect(bossLike.requests).toContain(`GET /employer/resumes/${adaResumeId}`);
      expect(bossLike.requests).toContain(`POST /employer/resumes/${adaResumeId}/messages`);
      expect(bossLike.sentMessageIds).toEqual([adaResumeId]);
      expect(bossLike.collectedCandidateIds).toEqual([adaResumeId]);
    } finally {
      await cleanupIntegrationUser(userId);
      await bossLike.close();
    }
  }, 120000);

  it('explores and persists one browser-v2 screen_candidates graph, then reuses it with browser action traces', async () => {
    const bossLike = await startBossLikeServer();
    const userId = await createIntegrationUser();

    try {
      await cleanupScreeningWorkflows();
      const jobDescription = await createPublishedJobDescription(userId);
      const firstRun = await createRunAndExecute({
        userId,
        jobDescription,
        bossLike,
        request: browserExecutionRequest,
        evaluate: evaluateCandidateWithChatAndCollect,
      });
      const first = await getCandidateScreeningRun({ userId, runId: firstRun.id });
      const workflow = await prisma.publishSkill.findUnique({
        where: { id: first?.skillId ?? '' },
      });
      const firstEvents = await listCandidateScreeningRunEvents({ userId, runId: firstRun.id });
      const firstActionLogs = await prisma.candidateActionLog.findMany({
        where: { userId, runId: firstRun.id },
        orderBy: { action: 'asc' },
      });
      const firstResults = await prisma.candidateScreeningResult.findMany({
        where: { userId, runId: firstRun.id },
      });

      expect(first?.skillId).toBeTruthy();
      expect(workflow).toEqual(
        expect.objectContaining({
          name: 'screen_candidates',
          version: 1,
          isActive: true,
          meta: expect.objectContaining({ dsl_version: 'browser-v2' }),
        }),
      );
      expect(workflow?.steps).toEqual(
        expect.arrayContaining([expect.objectContaining({ action: 'observe' })]),
      );
      expect(workflow?.steps).not.toEqual(
        expect.arrayContaining([
          expect.objectContaining({ action: 'search_candidates' }),
          expect.objectContaining({ action: 'chat_candidate' }),
        ]),
      );
      expect(firstEvents.map((event) => event.message)).toEqual(
        expect.arrayContaining([
          'Workflow 探索完成',
          '复用探索搜索观察：Java',
          'Workflow 完成：detail_open',
          'Workflow 完成：contact_open',
          'Workflow 完成：collect_open',
        ]),
      );
      expect(firstResults).toHaveLength(2);
      expect(firstResults).toEqual(
        expect.arrayContaining([
          expect.objectContaining({
            decisionAction: 'chat',
            actionStatus: 'success',
            interviewStage: 'collected',
          }),
          expect.objectContaining({
            decisionAction: 'collect',
            actionStatus: 'success',
            interviewStage: 'collected',
          }),
        ]),
      );
      expect(firstActionLogs).toEqual(
        expect.arrayContaining([
          expect.objectContaining({
            action: 'chat',
            status: 'success',
            browserTrace: expect.objectContaining({
              contact: 'success',
              collect: 'success',
              workflow: expect.objectContaining({
                traceSteps: expect.arrayContaining([
                  expect.objectContaining({ stepId: 'contact_open' }),
                  expect.objectContaining({ stepId: 'contact_send' }),
                  expect.objectContaining({ stepId: 'collect_click' }),
                ]),
              }),
            }),
          }),
          expect.objectContaining({
            action: 'collect',
            status: 'success',
            browserTrace: expect.objectContaining({
              traceSteps: expect.arrayContaining([
                expect.objectContaining({ stepId: 'collect_open' }),
                expect.objectContaining({ stepId: 'collect_click' }),
              ]),
            }),
          }),
        ]),
      );
      expect(bossLike.requests).toContain('GET /employer/resumes');
      expect(
        bossLike.requests.some((request) => request.startsWith('GET /employer/resumes?keyword=')),
      ).toBe(true);
      expect(bossLike.requests).toContain(`GET /employer/resumes/${adaResumeId}`);
      expect(bossLike.requests).toContain(`POST /employer/resumes/${adaResumeId}/messages`);
      expect(bossLike.requests).toContain(`POST /employer/resumes/${graceResumeId}/collect`);
      expect(
        bossLike.requests.filter((request) => request === 'GET /employer/resumes?keyword=Java'),
      ).toHaveLength(1);
      expect(bossLike.sentMessageIds).toEqual([adaResumeId]);
      expect(bossLike.collectedCandidateIds).toEqual(
        expect.arrayContaining([adaResumeId, graceResumeId]),
      );

      const secondRun = await createRunAndExecute({
        userId,
        jobDescription,
        bossLike,
        request: browserExecutionRequest,
        evaluate: evaluateCandidateWithChatAndCollect,
      });
      const second = await getCandidateScreeningRun({ userId, runId: secondRun.id });

      expect(second?.skillId).toBe(first?.skillId);
      const secondEvents = await listCandidateScreeningRunEvents({ userId, runId: secondRun.id });
      expect(secondEvents).toEqual(
        expect.arrayContaining([
          expect.objectContaining({
            stage: 'searching_live',
            level: 'info',
            message: `复用 Workflow：screen_candidates v1 (${first?.skillId})`,
            detail: expect.objectContaining({
              workflowStep: 'reuse_workflow',
              skillId: first?.skillId,
              workflowName: 'screen_candidates',
              workflowVersion: 1,
              reused: true,
            }),
          }),
        ]),
      );
      expect(
        await prisma.publishSkill.count({
          where: { name: 'screen_candidates', platform: 'boss-like' },
        }),
      ).toBe(1);
    } finally {
      await cleanupIntegrationUser(userId);
      await cleanupScreeningWorkflows();
      await bossLike.close();
    }
  }, 120000);

  it('searches each keyword once and observes each duplicate profile only once', async () => {
    const bossLike = await startBossLikeServer();
    const userId = await createIntegrationUser();

    try {
      await cleanupScreeningWorkflows();
      const jobDescription = await createPublishedJobDescription(userId);
      await createExploredPublishSkill(
        buildBossLikeScreeningSkill({
          siteFingerprint: screeningSiteFingerprint(bossLike.baseUrl),
        }),
      );
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
        request: { ...browserExecutionRequest, mode: 'dry_run', maxCandidates: 3 },
        dependencies: {
          buildPlan: () => ({
            searchPlan: {
              ...workflowSearchPlan,
              keywords: ['Java', 'PostgreSQL'],
            },
            evaluationSchema: {
              skills: ['Java', 'PostgreSQL'],
              domainKnowledge: [],
              generalAbility: [],
              risk: [],
            },
          }),
          createAdapter: () =>
            new BossLikeCandidateSourceAdapter({
              baseUrl: bossLike.baseUrl,
              executor: new PlaywrightBrowserExecutor({ headless: true, timeoutMs: 8_000 }),
              username: 'admin',
              password: 'boss123',
            }),
          evaluateCandidate: evaluateCandidateWithChatAndCollect,
        },
      });

      const events = await listCandidateScreeningRunEvents({ userId, runId: run.id });
      expect(
        bossLike.requests.filter((request) => request === 'GET /employer/resumes?keyword=Java'),
      ).toHaveLength(1);
      expect(
        bossLike.requests.filter(
          (request) => request === 'GET /employer/resumes?keyword=PostgreSQL',
        ),
      ).toHaveLength(1);
      expect(
        bossLike.requests.filter((request) => request === `GET /employer/resumes/${adaResumeId}`),
      ).toHaveLength(1);
      expect(
        bossLike.requests.filter((request) => request === `GET /employer/resumes/${graceResumeId}`),
      ).toHaveLength(1);
      expect(
        events
          .filter((event) => event.message === 'search_keyword_completed')
          .map((event) => event.detail?.keyword),
      ).toEqual(['Java', 'PostgreSQL']);
      expect(bossLike.sentMessageIds).toEqual([]);
      expect(bossLike.collectedCandidateIds).toEqual([]);
    } finally {
      await cleanupIntegrationUser(userId);
      await cleanupScreeningWorkflows();
      await bossLike.close();
    }
  }, 120000);

  it('replaces an active legacy screen_candidates v4 with a browser-v2 v5 before execution', async () => {
    const bossLike = await startBossLikeServer();
    const userId = await createIntegrationUser();

    try {
      await cleanupScreeningWorkflows();
      const legacy = await createExploredPublishSkill({
        ...buildBossLikeScreeningSkill({
          id: 'screen-candidates-legacy-v4',
          siteFingerprint: screeningSiteFingerprint(bossLike.baseUrl),
          version: 4,
        }),
        steps: [
          {
            id: 'legacy_search',
            type: 'action',
            action: 'search_candidates',
            params: {},
            next: 'legacy_end',
          },
          { id: 'legacy_end', type: 'end' },
        ],
        meta: { created_from: 'explore' },
      });
      const jobDescription = await createPublishedJobDescription(userId);
      const run = await createRunAndExecute({
        userId,
        jobDescription,
        bossLike,
        request: { ...browserExecutionRequest, maxCandidates: 1 },
        evaluate: evaluateCandidate,
      });
      const storedRun = await getCandidateScreeningRun({ userId, runId: run.id });
      const active = await prisma.publishSkill.findFirstOrThrow({
        where: { name: 'screen_candidates', platform: 'boss-like', isActive: true },
      });
      const persistedLegacy = await prisma.publishSkill.findUniqueOrThrow({
        where: { id: legacy.id },
      });

      expect(storedRun?.skillId).toBe(active.id);
      expect(active).toEqual(
        expect.objectContaining({
          version: 5,
          meta: expect.objectContaining({ dsl_version: 'browser-v2' }),
        }),
      );
      expect(active.steps).not.toEqual(
        expect.arrayContaining([expect.objectContaining({ action: 'search_candidates' })]),
      );
      expect(persistedLegacy.isActive).toBe(false);
    } finally {
      await cleanupIntegrationUser(userId);
      await cleanupScreeningWorkflows();
      await bossLike.close();
    }
  }, 120000);

  it('completes an empty first exploration without persisting screen_candidates', async () => {
    const bossLike = await startBossLikeServer();
    const userId = await createIntegrationUser();

    try {
      await cleanupScreeningWorkflows();
      bossLike.setCandidateResultsVisible(false);
      const jobDescription = await createPublishedJobDescription(userId);
      const run = await createRunAndExecute({
        userId,
        jobDescription,
        bossLike,
        request: browserExecutionRequest,
        evaluate: evaluateCandidateWithChatAndCollect,
      });
      const completed = await getCandidateScreeningRun({ userId, runId: run.id });
      const events = await listCandidateScreeningRunEvents({ userId, runId: run.id });
      const workflowCount = await prisma.publishSkill.count({
        where: { name: 'screen_candidates', platform: 'boss-like' },
      });

      expect(completed).toEqual(
        expect.objectContaining({
          status: 'success',
          skillId: null,
          stats: expect.objectContaining({ fetched: 0 }),
        }),
      );
      expect(workflowCount).toBe(0);
      expect(events).toEqual(
        expect.arrayContaining([
          expect.objectContaining({
            stage: 'searching_live',
            level: 'success',
            message: '实时搜索完成：抓取 0 人',
            detail: expect.objectContaining({ fetched: 0 }),
          }),
        ]),
      );
    } finally {
      await cleanupIntegrationUser(userId);
      await cleanupScreeningWorkflows();
      await bossLike.close();
    }
  }, 120000);

  it('repairs an inactive v1 into v3 while v2 is active and associates the run with v3', async () => {
    const bossLike = await startBossLikeServer();
    const userId = await createIntegrationUser();
    let session: ReturnType<typeof createCandidateScreeningWorkflowSession> | null = null;

    try {
      await cleanupScreeningWorkflows();
      const jobDescription = await createPublishedJobDescription(userId);
      const v1 = await createExploredPublishSkill(
        buildBossLikeScreeningSkill({
          id: 'screen-candidates-stale-v1',
          siteFingerprint: screeningSiteFingerprint(bossLike.baseUrl),
          version: 1,
        }),
      );
      const v2 = await createNextActivePublishSkillVersion({ previousSkill: v1, steps: v1.steps });
      const run = await createCandidateScreeningRun({
        userId,
        jobDescriptionId: jobDescription.id,
        platform: 'boss-like',
        mode: 'execution',
        status: 'pending',
      });
      bossLike.setSearchButtonLabel('开始检索');
      const adapter = new BossLikeCandidateSourceAdapter({
        baseUrl: bossLike.baseUrl,
        executor: new PlaywrightBrowserExecutor({ headless: true, timeoutMs: 8_000 }),
        username: 'admin',
        password: 'boss123',
      });
      session = createCandidateScreeningWorkflowSession({
        adapter,
        userId,
        runId: run.id,
        jobDescriptionId: jobDescription.id,
        platform: 'boss-like',
      });

      await session.loadExact({ skillId: v1.id, stage: 'searching_live' });
      await session.runSearchKeyword({ keyword: 'Java', maxCandidates: 1 });

      const persisted = await getCandidateScreeningRun({ userId, runId: run.id });
      const workflows = await prisma.publishSkill.findMany({
        where: { name: 'screen_candidates', platform: 'boss-like' },
        orderBy: { version: 'asc' },
      });
      const active = workflows.filter((workflow) => workflow.isActive);

      expect(persisted?.skillId).toBe(active[0]?.id);
      expect(workflows).toEqual(
        expect.arrayContaining([
          expect.objectContaining({ id: v2.id, version: 2, isActive: false }),
          expect.objectContaining({
            version: 3,
            isActive: true,
          }),
        ]),
      );
      expect(active).toEqual([expect.objectContaining({ version: 3 })]);
    } finally {
      await session?.close();
      await cleanupIntegrationUser(userId);
      await cleanupScreeningWorkflows();
      await bossLike.close();
    }
  }, 120000);

  it('serializes concurrent workflow version allocations', async () => {
    try {
      await cleanupScreeningWorkflows();
      const v1 = await createExploredPublishSkill(
        buildBossLikeScreeningSkill({ id: 'screen-candidates-concurrent-v1', version: 1 }),
      );

      const repaired = await Promise.all([
        createNextActivePublishSkillVersion({ previousSkill: v1, steps: v1.steps }),
        createNextActivePublishSkillVersion({ previousSkill: v1, steps: v1.steps }),
        createNextActivePublishSkillVersion({ previousSkill: v1, steps: v1.steps }),
        createNextActivePublishSkillVersion({ previousSkill: v1, steps: v1.steps }),
      ]);
      const workflows = await prisma.publishSkill.findMany({
        where: { name: 'screen_candidates', platform: 'boss-like' },
        orderBy: { version: 'asc' },
      });

      expect(repaired.map((workflow) => workflow.version).sort()).toEqual([2, 3, 4, 5]);
      expect(workflows.map((workflow) => workflow.version)).toEqual([1, 2, 3, 4, 5]);
      expect(workflows.filter((workflow) => workflow.isActive)).toEqual([
        expect.objectContaining({ version: 5 }),
      ]);
    } finally {
      await cleanupScreeningWorkflows();
    }
  }, 30000);

  it('uses the fallback agent to version and retry an ambiguous target in a real browser', async () => {
    const bossLike = await startBossLikeServer();
    const userId = await createIntegrationUser();
    let session: ReturnType<typeof createCandidateScreeningWorkflowSession> | null = null;

    try {
      await cleanupScreeningWorkflows();
      bossLike.setSearchButtonLabel('执行检索');
      bossLike.setAmbiguousSearchButtons(true);
      const jobDescription = await createPublishedJobDescription(userId);
      const staleSkill = await createExploredPublishSkill(
        buildBossLikeScreeningSkill(
          { id: 'screen-candidates-agent-stale-v1', version: 1 },
          {
            searchSubmit: {
              kind: 'button',
              role: 'button',
              name: '旧搜索按钮',
              exact: true,
            },
          },
        ),
      );
      const run = await createCandidateScreeningRun({
        userId,
        jobDescriptionId: jobDescription.id,
        platform: 'boss-like',
        mode: 'execution',
        status: 'pending',
      });
      const repairWorkflowWithAgent = jest.fn(async () => ({
        target: {
          kind: 'button' as const,
          role: 'button' as const,
          name: '执行检索',
          exact: true,
          stableAttrs: { id: 'search-now' },
        },
        reason: '同名按钮存在歧义，使用 snapshot 中的 search-now',
        promptId: 'candidate-screening.workflow-repair',
        promptVersion: 'candidate-workflow-repair-v1',
        provider: 'integration-test',
        model: 'integration-test-model',
      }));
      const adapter = new BossLikeCandidateSourceAdapter({
        baseUrl: bossLike.baseUrl,
        executor: new PlaywrightBrowserExecutor({ headless: true, timeoutMs: 8_000 }),
        username: 'admin',
        password: 'boss123',
      });
      session = createCandidateScreeningWorkflowSession({
        adapter,
        userId,
        runId: run.id,
        jobDescriptionId: jobDescription.id,
        platform: 'boss-like',
        repairWorkflowWithAgent,
      });

      await session.loadExact({ skillId: staleSkill.id, stage: 'searching_live' });
      const result = await session.runSearchKeyword({ keyword: 'Java', maxCandidates: 1 });

      const persisted = await getCandidateScreeningRun({ userId, runId: run.id });
      const repairedWorkflow = await prisma.publishSkill.findUniqueOrThrow({
        where: { id: persisted?.skillId ?? '' },
      });
      const events = await listCandidateScreeningRunEvents({ userId, runId: run.id });
      const repairedSearchStep = repairedWorkflow.steps.find(
        (step) => step.id === 'search_submit' && step.type === 'action',
      );

      expect(result.candidates).toHaveLength(1);
      expect(repairWorkflowWithAgent).toHaveBeenCalledTimes(1);
      expect(repairWorkflowWithAgent).toHaveBeenCalledWith(
        expect.objectContaining({
          skillId: staleSkill.id,
          workflowVersion: 1,
          failedStepId: 'search_submit',
          targetKey: 'searchSubmit',
        }),
      );
      expect(repairedWorkflow).toEqual(
        expect.objectContaining({
          version: 2,
          isActive: true,
          meta: expect.objectContaining({
            created_from: 'agent',
            repair_strategy: 'llm',
            repaired_from_skill_id: staleSkill.id,
            repair_agent_prompt_version: 'candidate-workflow-repair-v1',
          }),
        }),
      );
      expect(repairedSearchStep).toEqual(
        expect.objectContaining({
          params: expect.objectContaining({
            target: expect.objectContaining({ stableAttrs: { id: 'search-now' } }),
          }),
        }),
      );
      expect(events.map((event) => event.message)).toEqual(
        expect.arrayContaining([
          'Workflow Fallback Agent 介入：search_submit',
          'Workflow Fallback Agent 修复并升级到 v2',
          'Workflow 重试成功：search_fill',
        ]),
      );
      expect(bossLike.requests).toContain('GET /employer/resumes?keyword=Java');
    } finally {
      await session?.close();
      await cleanupIntegrationUser(userId);
      await cleanupScreeningWorkflows();
      await bossLike.close();
    }
  }, 120000);

  it('repairs a drifted search target once and records v2', async () => {
    const bossLike = await startBossLikeServer();
    const userId = await createIntegrationUser();

    try {
      await cleanupScreeningWorkflows();
      const jobDescription = await createPublishedJobDescription(userId);
      const firstRun = await createRunAndExecute({
        userId,
        jobDescription,
        bossLike,
        request: browserExecutionRequest,
        evaluate: evaluateCandidateWithChatAndCollect,
      });
      const first = await getCandidateScreeningRun({ userId, runId: firstRun.id });
      const firstWorkflowId = first?.skillId;

      expect(firstWorkflowId).toBeTruthy();
      bossLike.setSearchButtonLabel('开始检索');

      const run = await createRunAndExecute({
        userId,
        jobDescription,
        bossLike,
        request: browserExecutionRequest,
        evaluate: evaluateCandidateWithChatAndCollect,
      });
      const persisted = await getCandidateScreeningRun({ userId, runId: run.id });
      const events = await listCandidateScreeningRunEvents({ userId, runId: run.id });
      const repairedWorkflow = await prisma.publishSkill.findUnique({
        where: { id: persisted?.skillId ?? '' },
      });
      const retryEvents = events.filter(
        (event) => event.message === 'Workflow 重试步骤：search_fill',
      );
      const retrySuccessEvents = events.filter(
        (event) => event.message === 'Workflow 重试成功：search_fill',
      );

      expect(persisted?.skillId).not.toBe(firstWorkflowId);
      expect(repairedWorkflow).toEqual(
        expect.objectContaining({ name: 'screen_candidates', version: 2, isActive: true }),
      );
      expect(events.map((event) => event.message)).toEqual(
        expect.arrayContaining(['Workflow 修复并升级到 v2', 'Workflow 重试成功：search_fill']),
      );
      expect(retryEvents).toHaveLength(1);
      expect(retrySuccessEvents).toHaveLength(1);
      expect(
        await prisma.publishSkill.count({
          where: { name: 'screen_candidates', platform: 'boss-like' },
        }),
      ).toBe(2);
    } finally {
      await cleanupIntegrationUser(userId);
      await cleanupScreeningWorkflows();
      await bossLike.close();
    }
  }, 120000);
});
