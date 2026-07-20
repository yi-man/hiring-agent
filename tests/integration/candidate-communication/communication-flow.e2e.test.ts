/** @jest-environment node */
import '../chat/test-env';

import { randomBytes } from 'node:crypto';
import { createServer } from 'node:http';
import type { IncomingMessage } from 'node:http';
import type { AddressInfo } from 'node:net';
import {
  assertPostgresReachable,
  ensureIntegrationSchema,
  requireIntegrationEnv,
} from '../chat/test-env';
import { BossLikeCandidateCommunicationAdapter } from '@/lib/candidate-communication/adapters/boss-like';
import {
  candidateCommunicationReplyExternalMessageId,
  prismaCandidateConversationRepository,
} from '@/lib/candidate-communication/repo';
import { BossLikeCandidateSourceAdapter } from '@/lib/candidate-screening/adapters/boss-like';
import { createCandidateIdentity } from '@/lib/candidate-screening/dedupe';
import {
  CandidateActionInProgressError,
  updateCandidateInterviewProgress,
} from '@/lib/candidate-screening/repo';
import { runCandidateCommunicationSkill } from '@/lib/candidate-communication/skill-runner';
import { handleCandidateMessage } from '@/lib/candidate-communication/service';
import { PlaywrightBrowserExecutor } from '@/lib/browser/executors/playwright-executor';
import { createJobDescription } from '@/lib/jd/job-description-repo';
import { prisma } from '@/lib/prisma';
import type { JD, JobDescriptionDto } from '@/types';

type BossLikeServer = {
  baseUrl: string;
  requests: string[];
  postedMessages: string[];
  close: () => Promise<void>;
};

const sampleJd: JD = {
  title: '高级后端工程师',
  summary: '负责 Java 微服务和招聘平台候选人沟通链路',
  responsibilities: ['建设招聘沟通 Agent', '维护候选人转化流程'],
  requirements: ['Java', 'PostgreSQL', '招聘 SaaS'],
  bonus: ['浏览器自动化经验'],
  highlights: ['AI 招聘产品', '核心团队'],
};

const bossLikeResumeId = '303';

function escapeHtml(value: string): string {
  return value
    .replace(/&/g, '&amp;')
    .replace(/</g, '&lt;')
    .replace(/>/g, '&gt;')
    .replace(/"/g, '&quot;');
}

function renderResumeDetailPage(id: string): string {
  return `<!doctype html>
<html lang="zh-CN">
  <head><meta charset="utf-8" /><title>候选人详情</title></head>
  <body>
    <main>
      <h1>候选人详情</h1>
      <article data-candidate-id="${escapeHtml(id)}" data-profile-url="/employer/resumes/${escapeHtml(id)}">
        <h2>Ada Lovelace</h2>
        <div data-field="title">Senior Backend Engineer</div>
        <div data-field="company">Analytical Engines</div>
        <div data-field="resume">Java PostgreSQL 招聘 SaaS 沟通自动化</div>
      </article>
      <button type="button" id="open-chat">打招呼</button>
      <form method="post" action="/employer/resumes/${escapeHtml(id)}/messages">
        <label>消息 <textarea name="message"></textarea></label>
        <button type="submit">发送</button>
      </form>
    </main>
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
      <p>简历</p>
      <a href="/employer/resumes/${bossLikeResumeId}">
        <article data-candidate-id="${bossLikeResumeId}" data-profile-url="/employer/resumes/${bossLikeResumeId}">
          <h2>Ada Lovelace</h2>
          <p data-field="title">Senior Backend Engineer</p>
          <p data-field="company">Analytical Engines</p>
          <p data-field="resume">Java PostgreSQL 招聘 SaaS 沟通自动化</p>
        </article>
      </a>
    </main>
  </body>
</html>`;
}

function renderMessagesPage(unread: boolean): string {
  const unreadRow = unread
    ? `<div class="p-4 border-b cursor-pointer" onclick="document.querySelector('#selected-thread').textContent = 'boss-message-1'">
        <div class="font-medium">Ada Lovelace</div>
        <div class="text-xs text-gray-500">高级后端工程师 · Analytical Engines</div>
        <p class="text-sm text-gray-600 truncate flex-1">可以，加我微信 wxid_backend_2026</p>
        <span class="ml-2 bg-red-500 text-white text-xs rounded-full">1</span>
      </div>`
    : '';
  return `<!doctype html>
<html lang="zh-CN">
  <head><meta charset="utf-8" /><title>未读消息</title></head>
  <body>
    <main>
      <h1>消息列表</h1>
      <div class="overflow-y-auto">${unreadRow}</div>
      <div id="selected-thread"></div>
      ${
        unread
          ? `<div class="flex-1 flex flex-col">
              <div class="p-4 border-b">
                <h3>Ada Lovelace</h3>
                <p>高级后端工程师 · Analytical Engines</p>
              </div>
              <div class="flex-1 overflow-y-auto">
                <div class="flex justify-start" data-message-id="boss-incoming-message-1">
                  <div><p>可以，加我微信 wxid_backend_2026</p><p>2026-07-20T09:00:00.000Z</p></div>
                </div>
              </div>
              <form method="post" action="/employer/messages/boss-message-1/reply">
                <label>消息 <textarea name="message" placeholder="输入回复内容..."></textarea></label>
                <button type="submit">发送</button>
              </form>
            </div>`
          : ''
      }
      ${unread ? '' : '<p>暂无未读消息</p>'}
    </main>
  </body>
</html>`;
}

async function readRequestBody(request: IncomingMessage): Promise<string> {
  const chunks: Buffer[] = [];
  await new Promise<void>((resolve) => {
    request.on('data', (chunk: Buffer) => chunks.push(chunk));
    request.on('end', () => resolve());
  });
  return Buffer.concat(chunks).toString('utf8');
}

async function startBossLikeServer(): Promise<BossLikeServer> {
  const requests: string[] = [];
  const postedMessages: string[] = [];
  let hasUnreadMessage = true;
  const server = createServer((request, response) => {
    void (async () => {
      const url = new URL(request.url ?? '/', 'http://127.0.0.1');
      requests.push(`${request.method ?? 'GET'} ${url.pathname}`);
      response.setHeader('content-type', 'text/html; charset=utf-8');

      if (url.pathname === '/employer/resumes') {
        response.end(renderResumeListPage());
        return;
      }

      if (url.pathname === '/employer/messages') {
        response.end(renderMessagesPage(hasUnreadMessage));
        return;
      }

      const threadReplyMatch = url.pathname.match(/^\/employer\/messages\/([^/]+)\/reply$/);
      if (request.method === 'POST' && threadReplyMatch) {
        postedMessages.push(await readRequestBody(request));
        hasUnreadMessage = false;
        response.end('<!doctype html><html><body>消息已发送</body></html>');
        return;
      }

      const messageMatch = url.pathname.match(/^\/employer\/resumes\/([^/]+)\/messages$/);
      if (request.method === 'POST' && messageMatch) {
        postedMessages.push(await readRequestBody(request));
        hasUnreadMessage = false;
        response.end('<!doctype html><html><body>消息已发送</body></html>');
        return;
      }

      const detailMatch = url.pathname.match(/^\/employer\/resumes\/([^/]+)$/);
      if (detailMatch) {
        response.end(renderResumeDetailPage(detailMatch[1] ?? bossLikeResumeId));
        return;
      }

      response.statusCode = 404;
      response.end('<!doctype html><html><body>Not Found</body></html>');
    })().catch((error: unknown) => {
      response.statusCode = 500;
      response.end(String(error));
    });
  });

  await new Promise<void>((resolve) => {
    server.listen(0, '127.0.0.1', resolve);
  });
  const address = server.address() as AddressInfo;

  return {
    baseUrl: `http://127.0.0.1:${address.port}`,
    requests,
    postedMessages,
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

function expectNoDirectPlatformApiRequests(requests: string[]): void {
  expect(requests.filter((request) => / \/api\//.test(request))).toEqual([]);
}

async function createIntegrationUser(): Promise<string> {
  const fixtureId = `${Date.now()}-${randomBytes(4).toString('hex')}`;
  const user = await prisma.user.create({
    data: {
      username: `candidate-communication-it-${fixtureId}`,
      passwordHash: 'pbkdf2_sha256$fixture',
      name: 'Candidate Communication Integration User',
      email: `candidate-communication-it-${fixtureId}@example.com`,
    },
  });
  return user.id;
}

async function createPublishedJobDescription(userId: string): Promise<JobDescriptionDto> {
  return createJobDescription({
    userId,
    department: '技术部',
    position: '高级后端工程师',
    positionDescription: '负责 Java 微服务和招聘沟通 Agent',
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

async function createCandidate(userId: string, baseUrl: string): Promise<string> {
  const profileUrl = `${baseUrl}/employer/resumes/${bossLikeResumeId}`;
  const identity = createCandidateIdentity({
    sourcePlatform: 'boss-like',
    platformCandidateId: bossLikeResumeId,
    profileUrl,
    name: 'Ada Lovelace',
    company: 'Analytical Engines',
    title: 'Senior Backend Engineer',
  });
  const candidate = await prisma.candidate.create({
    data: {
      userId,
      displayName: 'Ada Lovelace',
      currentTitle: 'Senior Backend Engineer',
      currentCompany: 'Analytical Engines',
      sourcePlatform: 'boss-like',
      platformCandidateId: bossLikeResumeId,
      profileUrl,
      identityKey: identity.identityKey,
      identityHash: identity.identityHash,
    },
  });
  await prisma.candidateResume.create({
    data: {
      userId,
      candidateId: candidate.id,
      sourcePlatform: 'boss-like',
      profileUrl,
      rawText: 'Java PostgreSQL 招聘 SaaS 沟通自动化',
      structuredSummary: { skills: ['Java', 'PostgreSQL'] },
      resumeHash: `resume-${candidate.id}`,
      fetchedAt: new Date(),
    },
  });
  return candidate.id;
}

async function cleanupIntegrationUser(userId: string): Promise<void> {
  await prisma.candidateConversationMemory.deleteMany({ where: { userId } });
  await prisma.candidateConversationDecision.deleteMany({ where: { userId } });
  await prisma.candidateConversationMessage.deleteMany({ where: { userId } });
  await prisma.candidateConversation.deleteMany({ where: { userId } });
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

describe('candidate communication integration flow with real postgres, LLM, and browser execution', () => {
  beforeAll(async () => {
    requireIntegrationEnv('OPENAI_API_KEY');
    requireIntegrationEnv('POSTGRES_HOST');
    requireIntegrationEnv('POSTGRES_PORT');
    requireIntegrationEnv('POSTGRES_USER');
    requireIntegrationEnv('POSTGRES_DATABASE');
    await ensureIntegrationSchema();
    await assertPostgresReachable();
  }, 60000);

  it('ingests contact-sharing candidate messages, sends a browser reply, and stores memory', async () => {
    const bossLike = await startBossLikeServer();
    const userId = await createIntegrationUser();

    try {
      const jobDescription = await createPublishedJobDescription(userId);
      const candidateId = await createCandidate(userId, bossLike.baseUrl);

      const result = await handleCandidateMessage({
        userId,
        payload: {
          jobDescriptionId: jobDescription.id,
          candidateId,
          platform: 'boss-like',
          message: {
            content: '可以，加我微信 wxid_backend_2026',
            externalMessageId: 'boss-message-1',
            receivedAt: new Date(),
          },
          executeReply: true,
        },
        dependencies: {
          createAdapter: () =>
            new BossLikeCandidateSourceAdapter({
              baseUrl: bossLike.baseUrl,
              executor: new PlaywrightBrowserExecutor({ headless: true, timeoutMs: 10_000 }),
              username: 'admin',
              password: 'boss123',
            }),
        },
      });

      const conversation = await prisma.candidateConversation.findFirstOrThrow({
        where: { userId, jobDescriptionId: jobDescription.id, candidateId },
      });
      const messages = await prisma.candidateConversationMessage.findMany({
        where: { userId, conversationId: conversation.id },
        orderBy: { occurredAt: 'asc' },
      });
      const memory = await prisma.candidateConversationMemory.findFirstOrThrow({
        where: { userId, conversationId: conversation.id },
      });
      const candidate = await prisma.candidate.findFirstOrThrow({ where: { id: candidateId } });

      expect(result.decision.intent).toBe('contact_shared');
      expect(conversation.stage).toBe('contact_exchanged');
      expect(conversation.status).toBe('closed');
      expect(messages).toHaveLength(2);
      expect(messages[1]).toMatchObject({ role: 'agent', deliveryStatus: 'sent' });
      expect(memory.outcomeResult).toBe('contact_exchanged');
      expect(candidate.replied).toBe(true);
      expect(bossLike.requests).toContain(`GET /employer/resumes/${bossLikeResumeId}`);
      expect(bossLike.requests).toContain(`POST /employer/resumes/${bossLikeResumeId}/messages`);
      expect(bossLike.postedMessages.join('\n')).toContain('message=');
      expectNoDirectPlatformApiRequests(bossLike.requests);
    } finally {
      await cleanupIntegrationUser(userId);
      await bossLike.close();
    }
  }, 180000);

  it('runs the boss-like unread communication skill until no unread messages remain', async () => {
    const bossLike = await startBossLikeServer();
    const userId = await createIntegrationUser();

    try {
      const jobDescription = await createPublishedJobDescription(userId);
      const candidateId = await createCandidate(userId, bossLike.baseUrl);

      const result = await runCandidateCommunicationSkill({
        userId,
        jobDescriptionId: jobDescription.id,
        platform: 'boss-like',
        adapter: new BossLikeCandidateCommunicationAdapter({
          baseUrl: bossLike.baseUrl,
          executor: new PlaywrightBrowserExecutor({ headless: true, timeoutMs: 10_000 }),
          username: 'admin',
          password: 'boss123',
        }),
      });

      const conversation = await prisma.candidateConversation.findFirstOrThrow({
        where: { userId, jobDescriptionId: jobDescription.id, candidateId },
      });
      const sentMessages = await prisma.candidateConversationMessage.findMany({
        where: { userId, conversationId: conversation.id, role: 'agent' },
      });

      expect(result).toMatchObject({
        status: 'success',
        stoppedReason: 'no_unread_messages',
        processed: 1,
        failed: 0,
        passes: 2,
      });
      expect(conversation.stage).toBe('contact_exchanged');
      expect(sentMessages[0]).toMatchObject({ deliveryStatus: 'sent' });
      expect(
        bossLike.requests.filter((request) => request === 'GET /employer/messages'),
      ).toHaveLength(4);
      expect(bossLike.requests).toContain('POST /employer/messages/boss-message-1/reply');
      expectNoDirectPlatformApiRequests(bossLike.requests);
    } finally {
      await cleanupIntegrationUser(userId);
      await bossLike.close();
    }
  }, 180000);

  it('claims an inbound-only replay once and finalizes one canonical decision', async () => {
    const userId = await createIntegrationUser();

    try {
      const jobDescription = await createPublishedJobDescription(userId);
      const candidateId = await createCandidate(userId, 'http://127.0.0.1:6183');
      const runLLM = jest.fn().mockResolvedValue({
        intent: 'greeting' as const,
        intentLevel: 'medium' as const,
        nextStage: 'contact_requested' as const,
        shouldReply: false,
        reply: null,
        actions: ['noop'] as const,
        rationale: 'integration recovery decision',
      });
      const evaluateCandidate = jest.fn().mockResolvedValue({
        tags: {
          skills: ['Java'],
          domainKnowledge: [],
          generalAbility: [],
          risk: [],
          activity: [],
          custom: [],
        },
        score: { skill: 90, domain: 80, ability: 70, risk: 0, llmBonus: 0, total: 82 },
        decision: { action: 'chat', priority: 'high', reason: 'integration fixture' },
      });
      const payload = {
        jobDescriptionId: jobDescription.id,
        candidateId,
        platform: 'boss-like' as const,
        message: {
          content: '你好，还在招聘吗？',
          externalMessageId: `inbound-only-${candidateId}`,
          receivedAt: new Date(),
        },
        executeReply: false,
      };

      const concurrent = await Promise.all([
        handleCandidateMessage({ userId, payload, dependencies: { runLLM, evaluateCandidate } }),
        handleCandidateMessage({ userId, payload, dependencies: { runLLM, evaluateCandidate } }),
      ]);
      const completedReplay = await handleCandidateMessage({
        userId,
        payload,
        dependencies: { runLLM, evaluateCandidate },
      });

      const conversation = await prisma.candidateConversation.findFirstOrThrow({
        where: { userId, jobDescriptionId: jobDescription.id, candidateId },
      });
      const incoming = await prisma.candidateConversationMessage.findFirstOrThrow({
        where: { userId, externalMessageId: payload.message.externalMessageId },
      });
      const decisions = await prisma.candidateConversationDecision.findMany({
        where: { userId, inputMessageId: incoming.id },
      });

      expect(runLLM).toHaveBeenCalledTimes(1);
      expect(evaluateCandidate).toHaveBeenCalledTimes(1);
      expect(decisions).toHaveLength(1);
      expect(decisions[0]?.finalizedAt).not.toBeNull();
      expect(conversation.messageCount).toBe(1);
      expect(incoming).toMatchObject({
        processingClaimId: null,
        processingOutcome: 'processed_ackable',
      });
      expect(incoming.processedAt).not.toBeNull();
      expect(concurrent.some((result) => result.ackable)).toBe(true);
      expect(completedReplay).toMatchObject({
        processingStatus: 'processed',
        processingOutcome: 'processed_ackable',
        ackable: true,
      });
    } finally {
      await cleanupIntegrationUser(userId);
    }
  }, 60000);

  it('skips auto-reply when a terminal screening result appears while the LLM is deciding', async () => {
    const userId = await createIntegrationUser();
    let releaseLlm: () => void = () => undefined;

    try {
      const jobDescription = await createPublishedJobDescription(userId);
      const candidateId = await createCandidate(userId, 'http://127.0.0.1:6183');
      let markLlmStarted: () => void = () => undefined;
      const llmStarted = new Promise<void>((resolve) => {
        markLlmStarted = resolve;
      });
      const llmRelease = new Promise<void>((resolve) => {
        releaseLlm = resolve;
      });
      const runLLM = jest.fn().mockImplementation(async () => {
        markLlmStarted();
        await llmRelease;
        return {
          intent: 'job_question' as const,
          intentLevel: 'medium' as const,
          nextStage: 'contact_requested' as const,
          shouldReply: true,
          reply: '还在招聘，方便继续聊聊吗？',
          actions: ['reply'] as const,
          rationale: 'candidate asked about the job',
        };
      });
      const evaluateCandidate = jest.fn().mockResolvedValue({ score: { total: 82 } });
      const createAdapter = jest.fn();

      const processing = handleCandidateMessage({
        userId,
        payload: {
          jobDescriptionId: jobDescription.id,
          candidateId,
          platform: 'boss-like',
          message: {
            content: '这个岗位还在招聘吗？',
            externalMessageId: `terminal-during-llm-${candidateId}`,
            receivedAt: new Date(),
          },
          executeReply: true,
        },
        dependencies: { runLLM, evaluateCandidate, createAdapter },
      });

      await llmStarted;
      const screeningRun = await prisma.candidateScreeningRun.create({
        data: {
          userId,
          jobDescriptionId: jobDescription.id,
          platform: 'boss-like',
          mode: 'dry_run',
          status: 'success',
        },
      });
      await prisma.candidateScreeningResult.create({
        data: {
          userId,
          runId: screeningRun.id,
          jobDescriptionId: jobDescription.id,
          candidateId,
          source: 'live_search',
          tags: {},
          scoreDetail: {},
          finalScore: 80,
          rank: 1,
          decisionAction: 'chat',
          decisionPriority: 'high',
          decisionReason: 'terminal state race fixture',
          interviewStage: 'withdrawn',
        },
      });
      releaseLlm();

      const result = await processing;

      expect(result.outgoingMessage).toBeNull();
      expect(createAdapter).not.toHaveBeenCalled();
      await expect(
        prisma.candidateConversationMessage.count({
          where: {
            userId,
            jobDescriptionId: jobDescription.id,
            candidateId,
            role: 'agent',
          },
        }),
      ).resolves.toBe(0);
      await expect(
        prisma.candidateScreeningResult.findFirstOrThrow({
          where: { userId, jobDescriptionId: jobDescription.id, candidateId },
        }),
      ).resolves.toMatchObject({ interviewStage: 'withdrawn' });
    } finally {
      releaseLlm();
      await cleanupIntegrationUser(userId);
    }
  }, 60000);

  it('blocks terminal progress while the candidate message processing claim is active', async () => {
    const userId = await createIntegrationUser();
    let releaseLlm: () => void = () => undefined;
    let processing: ReturnType<typeof handleCandidateMessage> | null = null;

    try {
      const jobDescription = await createPublishedJobDescription(userId);
      const candidateId = await createCandidate(userId, 'http://127.0.0.1:6183');
      let markLlmStarted: () => void = () => undefined;
      const llmStarted = new Promise<void>((resolve) => {
        markLlmStarted = resolve;
      });
      const llmRelease = new Promise<void>((resolve) => {
        releaseLlm = resolve;
      });
      const runLLM = jest.fn().mockImplementation(async () => {
        markLlmStarted();
        await llmRelease;
        return {
          intent: 'job_question' as const,
          intentLevel: 'medium' as const,
          nextStage: 'contact_requested' as const,
          shouldReply: false,
          reply: null,
          actions: ['noop'] as const,
          rationale: 'no automatic reply needed',
        };
      });

      processing = handleCandidateMessage({
        userId,
        payload: {
          jobDescriptionId: jobDescription.id,
          candidateId,
          platform: 'boss-like',
          message: {
            content: '这个岗位还在招聘吗？',
            externalMessageId: `terminal-fence-${candidateId}`,
            receivedAt: new Date(),
          },
          executeReply: true,
        },
        dependencies: {
          runLLM,
          evaluateCandidate: jest.fn().mockResolvedValue({ score: { total: 82 } }),
          createAdapter: jest.fn(),
        },
      });

      await llmStarted;
      const screeningRun = await prisma.candidateScreeningRun.create({
        data: {
          userId,
          jobDescriptionId: jobDescription.id,
          platform: 'boss-like',
          mode: 'dry_run',
          status: 'success',
        },
      });
      await prisma.candidateScreeningResult.create({
        data: {
          userId,
          runId: screeningRun.id,
          jobDescriptionId: jobDescription.id,
          candidateId,
          source: 'live_search',
          tags: {},
          scoreDetail: {},
          finalScore: 80,
          rank: 1,
          decisionAction: 'chat',
          decisionPriority: 'high',
          decisionReason: 'active message fence fixture',
          interviewStage: 'offer',
        },
      });

      await expect(
        updateCandidateInterviewProgress({
          userId,
          jobDescriptionId: jobDescription.id,
          candidateId,
          interviewStage: 'withdrawn',
          expectedInterviewStage: 'offer',
        }),
      ).rejects.toBeInstanceOf(CandidateActionInProgressError);

      releaseLlm();
      await processing;
      await expect(
        updateCandidateInterviewProgress({
          userId,
          jobDescriptionId: jobDescription.id,
          candidateId,
          interviewStage: 'withdrawn',
          expectedInterviewStage: 'offer',
        }),
      ).resolves.toMatchObject({ interviewStage: 'withdrawn' });
    } finally {
      releaseLlm();
      await processing?.catch(() => undefined);
      await cleanupIntegrationUser(userId);
    }
  }, 60000);

  it.each(['newer_first', 'older_first'] as const)(
    'keeps the newer finalized stage when platform messages share one occurrence time (%s)',
    async (completionOrder) => {
      const userId = await createIntegrationUser();

      try {
        const jobDescription = await createPublishedJobDescription(userId);
        const candidateId = await createCandidate(userId, 'http://127.0.0.1:6183');
        const screeningRun = await prisma.candidateScreeningRun.create({
          data: {
            userId,
            jobDescriptionId: jobDescription.id,
            platform: 'boss-like',
            mode: 'dry_run',
            status: 'success',
          },
        });
        await prisma.candidateScreeningResult.create({
          data: {
            userId,
            runId: screeningRun.id,
            jobDescriptionId: jobDescription.id,
            candidateId,
            source: 'live_search',
            tags: {},
            scoreDetail: {},
            finalScore: 80,
            rank: 1,
            decisionAction: 'chat',
            decisionPriority: 'high',
            decisionReason: 'chronology integration fixture',
            interviewStage: 'withdrawn',
          },
        });
        const occurredAt = new Date('2026-07-20T09:00:00.000Z');
        const conversation = await prisma.candidateConversation.create({
          data: {
            userId,
            jobDescriptionId: jobDescription.id,
            candidateId,
            platform: 'boss-like',
            stage: 'new',
            status: 'active',
            lastActiveAt: occurredAt,
            lastCandidateMessageAt: occurredAt,
          },
        });
        const older = await prisma.candidateConversationMessage.create({
          data: {
            conversationId: conversation.id,
            userId,
            jobDescriptionId: jobDescription.id,
            candidateId,
            platform: 'boss-like',
            role: 'candidate',
            content: '第一条同时间消息',
            externalMessageId: `same-time-older-${candidateId}`,
            deliveryStatus: 'received',
            processingClaimId: 'older-claim',
            processingLeaseExpiresAt: new Date(Date.now() + 10 * 60 * 1000),
            processingOutcome: 'in_flight',
            occurredAt,
            createdAt: new Date('2026-07-20T09:00:01.000Z'),
          },
        });
        const newer = await prisma.candidateConversationMessage.create({
          data: {
            conversationId: conversation.id,
            userId,
            jobDescriptionId: jobDescription.id,
            candidateId,
            platform: 'boss-like',
            role: 'candidate',
            content: '第二条同时间消息',
            externalMessageId: `same-time-newer-${candidateId}`,
            deliveryStatus: 'received',
            processingClaimId: 'newer-claim',
            processingLeaseExpiresAt: new Date(Date.now() + 10 * 60 * 1000),
            processingOutcome: 'in_flight',
            occurredAt,
            createdAt: new Date('2026-07-20T09:00:02.000Z'),
          },
        });
        await expect(
          prismaCandidateConversationRepository.listRecentMessages({
            conversationId: conversation.id,
            limit: 10,
          }),
        ).resolves.toEqual([
          expect.objectContaining({ id: older.id }),
          expect.objectContaining({ id: newer.id }),
        ]);
        await prisma.candidateConversationDecision.createMany({
          data: [
            {
              conversationId: conversation.id,
              userId,
              jobDescriptionId: jobDescription.id,
              candidateId,
              inputMessageId: older.id,
              intent: 'not_interested',
              intentLevel: 'high',
              nextStage: 'rejected',
              shouldReply: false,
              reply: null,
              actions: ['mark_rejected'],
              rationale: 'older decision',
            },
            {
              conversationId: conversation.id,
              userId,
              jobDescriptionId: jobDescription.id,
              candidateId,
              inputMessageId: newer.id,
              intent: 'greeting',
              intentLevel: 'medium',
              nextStage: 'contact_requested',
              shouldReply: false,
              reply: null,
              actions: ['noop'],
              rationale: 'newer decision',
            },
          ],
        });

        const finalizeNewer = () =>
          prismaCandidateConversationRepository.finalizeCandidateDecision({
            userId,
            messageId: newer.id,
            claimId: 'newer-claim',
            inputMessageId: newer.id,
            interviewStage: 'replied',
            conversation: {
              conversationId: conversation.id,
              userId,
              jobDescriptionId: jobDescription.id,
              candidateId,
              stage: 'contact_requested',
              status: 'active',
              intentLevel: 'medium',
              messageCountIncrement: 1,
              lastActiveAt: occurredAt,
              lastCandidateMessageAt: occurredAt,
              lastAgentMessageAt: null,
              nextFollowUpAt: null,
              outcomeResult: null,
              outcomeReason: null,
            },
          });
        const finalizeOlder = () =>
          prismaCandidateConversationRepository.finalizeCandidateDecision({
            userId,
            messageId: older.id,
            claimId: 'older-claim',
            inputMessageId: older.id,
            interviewStage: 'withdrawn',
            conversation: {
              conversationId: conversation.id,
              userId,
              jobDescriptionId: jobDescription.id,
              candidateId,
              stage: 'rejected',
              status: 'closed',
              intentLevel: 'high',
              messageCountIncrement: 1,
              lastActiveAt: occurredAt,
              lastCandidateMessageAt: occurredAt,
              lastAgentMessageAt: null,
              nextFollowUpAt: null,
              outcomeResult: 'rejected',
              outcomeReason: 'older decision',
            },
          });
        if (completionOrder === 'newer_first') {
          await finalizeNewer();
          await finalizeOlder();
        } else {
          await finalizeOlder();
          await finalizeNewer();
        }

        await expect(
          prisma.candidateConversation.findUniqueOrThrow({ where: { id: conversation.id } }),
        ).resolves.toMatchObject({
          stage: 'contact_requested',
          status: 'active',
          intentLevel: 'medium',
          messageCount: 2,
          outcomeResult: null,
        });
        await expect(
          prisma.candidateConversationDecision.count({
            where: { userId, finalizedAt: { not: null } },
          }),
        ).resolves.toBe(2);
        await expect(
          prisma.candidateScreeningResult.findFirstOrThrow({
            where: { userId, jobDescriptionId: jobDescription.id, candidateId },
          }),
        ).resolves.toMatchObject({ interviewStage: 'replied' });
      } finally {
        await cleanupIntegrationUser(userId);
      }
    },
    60000,
  );

  it('does not reopen a manually withdrawn candidate from an unrelated historical rejection', async () => {
    const userId = await createIntegrationUser();

    try {
      const jobDescription = await createPublishedJobDescription(userId);
      const candidateId = await createCandidate(userId, 'http://127.0.0.1:6183');
      const screeningRun = await prisma.candidateScreeningRun.create({
        data: {
          userId,
          jobDescriptionId: jobDescription.id,
          platform: 'boss-like',
          mode: 'dry_run',
          status: 'success',
        },
      });
      await prisma.candidateScreeningResult.create({
        data: {
          userId,
          runId: screeningRun.id,
          jobDescriptionId: jobDescription.id,
          candidateId,
          source: 'live_search',
          tags: {},
          scoreDetail: {},
          finalScore: 80,
          rank: 1,
          decisionAction: 'chat',
          decisionPriority: 'high',
          decisionReason: 'manual withdrawal fixture',
          interviewStage: 'withdrawn',
        },
      });
      const olderOccurredAt = new Date('2026-07-20T08:00:00.000Z');
      const currentOccurredAt = new Date('2026-07-20T09:00:00.000Z');
      const conversation = await prisma.candidateConversation.create({
        data: {
          userId,
          jobDescriptionId: jobDescription.id,
          candidateId,
          platform: 'boss-like',
          stage: 'rejected',
          status: 'closed',
          lastActiveAt: olderOccurredAt,
          lastCandidateMessageAt: olderOccurredAt,
          outcomeResult: 'rejected',
          outcomeReason: 'historical rejection',
        },
      });
      const older = await prisma.candidateConversationMessage.create({
        data: {
          conversationId: conversation.id,
          userId,
          jobDescriptionId: jobDescription.id,
          candidateId,
          platform: 'boss-like',
          role: 'candidate',
          content: '之前不考虑',
          externalMessageId: `historical-rejection-${candidateId}`,
          deliveryStatus: 'received',
          processingOutcome: 'processed_ackable',
          processedAt: new Date('2026-07-20T08:00:02.000Z'),
          occurredAt: olderOccurredAt,
          createdAt: new Date('2026-07-20T08:00:01.000Z'),
        },
      });
      const current = await prisma.candidateConversationMessage.create({
        data: {
          conversationId: conversation.id,
          userId,
          jobDescriptionId: jobDescription.id,
          candidateId,
          platform: 'boss-like',
          role: 'candidate',
          content: '新的候选人消息',
          externalMessageId: `manual-withdrawal-current-${candidateId}`,
          deliveryStatus: 'received',
          processingClaimId: 'current-claim',
          processingLeaseExpiresAt: new Date(Date.now() + 10 * 60 * 1000),
          processingOutcome: 'in_flight',
          occurredAt: currentOccurredAt,
          createdAt: new Date('2026-07-20T09:00:01.000Z'),
        },
      });
      await prisma.candidateConversationDecision.createMany({
        data: [
          {
            conversationId: conversation.id,
            userId,
            jobDescriptionId: jobDescription.id,
            candidateId,
            inputMessageId: older.id,
            intent: 'not_interested',
            intentLevel: 'high',
            nextStage: 'rejected',
            shouldReply: false,
            reply: null,
            actions: ['mark_rejected'],
            rationale: 'historical rejection',
            finalizedAt: new Date('2026-07-20T08:00:02.000Z'),
          },
          {
            conversationId: conversation.id,
            userId,
            jobDescriptionId: jobDescription.id,
            candidateId,
            inputMessageId: current.id,
            intent: 'greeting',
            intentLevel: 'medium',
            nextStage: 'contact_requested',
            shouldReply: false,
            reply: null,
            actions: ['noop'],
            rationale: 'current non-rejection decision',
          },
        ],
      });

      await prismaCandidateConversationRepository.finalizeCandidateDecision({
        userId,
        messageId: current.id,
        claimId: 'current-claim',
        inputMessageId: current.id,
        interviewStage: 'replied',
        conversation: {
          conversationId: conversation.id,
          userId,
          jobDescriptionId: jobDescription.id,
          candidateId,
          stage: 'contact_requested',
          status: 'active',
          intentLevel: 'medium',
          messageCountIncrement: 1,
          lastActiveAt: currentOccurredAt,
          lastCandidateMessageAt: currentOccurredAt,
          lastAgentMessageAt: null,
          nextFollowUpAt: null,
          outcomeResult: null,
          outcomeReason: null,
        },
      });

      await expect(
        prisma.candidateScreeningResult.findFirstOrThrow({
          where: { userId, jobDescriptionId: jobDescription.id, candidateId },
        }),
      ).resolves.toMatchObject({ interviewStage: 'withdrawn' });
    } finally {
      await cleanupIntegrationUser(userId);
    }
  }, 60000);

  it('keeps a finalized decision with a planned outgoing reply non-ackable without replaying side effects', async () => {
    const userId = await createIntegrationUser();

    try {
      const jobDescription = await createPublishedJobDescription(userId);
      const candidateId = await createCandidate(userId, 'http://127.0.0.1:6183');
      const occurredAt = new Date('2026-07-20T09:00:00.000Z');
      const finalizedAt = new Date('2026-07-20T09:00:02.000Z');
      const conversation = await prisma.candidateConversation.create({
        data: {
          userId,
          jobDescriptionId: jobDescription.id,
          candidateId,
          platform: 'boss-like',
          stage: 'contact_requested',
          status: 'active',
          messageCount: 2,
          lastActiveAt: occurredAt,
          lastCandidateMessageAt: occurredAt,
        },
      });
      const incoming = await prisma.candidateConversationMessage.create({
        data: {
          conversationId: conversation.id,
          userId,
          jobDescriptionId: jobDescription.id,
          candidateId,
          platform: 'boss-like',
          role: 'candidate',
          content: '你好，还在招聘吗？',
          externalMessageId: `finalized-planned-${candidateId}`,
          deliveryStatus: 'received',
          processingClaimId: 'expired-claim',
          processingLeaseExpiresAt: new Date('2026-07-20T09:05:00.000Z'),
          processingOutcome: 'in_flight',
          occurredAt,
        },
      });
      const outgoing = await prisma.candidateConversationMessage.create({
        data: {
          conversationId: conversation.id,
          userId,
          jobDescriptionId: jobDescription.id,
          candidateId,
          platform: 'boss-like',
          role: 'agent',
          content: '还在招聘，方便继续聊聊吗？',
          externalMessageId: candidateCommunicationReplyExternalMessageId(incoming.id),
          deliveryStatus: 'planned',
          occurredAt: new Date(occurredAt.getTime() + 1000),
        },
      });
      await prisma.candidateConversationDecision.create({
        data: {
          conversationId: conversation.id,
          userId,
          jobDescriptionId: jobDescription.id,
          candidateId,
          inputMessageId: incoming.id,
          outputMessageId: outgoing.id,
          intent: 'greeting',
          intentLevel: 'medium',
          nextStage: 'contact_requested',
          shouldReply: true,
          reply: outgoing.content,
          actions: ['reply'],
          rationale: 'finalized before delivery acknowledgement was durable',
          finalizedAt,
        },
      });
      const runLLM = jest.fn();
      const createAdapter = jest.fn();

      const result = await handleCandidateMessage({
        userId,
        payload: {
          jobDescriptionId: jobDescription.id,
          candidateId,
          platform: 'boss-like',
          message: {
            content: incoming.content,
            externalMessageId: incoming.externalMessageId,
            receivedAt: occurredAt,
          },
          executeReply: true,
        },
        dependencies: { runLLM, createAdapter },
      });

      const [storedIncoming, storedOutgoing, storedConversation, memoryCount] = await Promise.all([
        prisma.candidateConversationMessage.findUniqueOrThrow({ where: { id: incoming.id } }),
        prisma.candidateConversationMessage.findUniqueOrThrow({ where: { id: outgoing.id } }),
        prisma.candidateConversation.findUniqueOrThrow({ where: { id: conversation.id } }),
        prisma.candidateConversationMemory.count({
          where: { userId, conversationId: conversation.id },
        }),
      ]);

      expect(runLLM).not.toHaveBeenCalled();
      expect(createAdapter).not.toHaveBeenCalled();
      expect(result).toMatchObject({
        processingStatus: 'processed',
        processingOutcome: 'delivery_unknown',
        ackable: false,
      });
      expect(storedIncoming).toMatchObject({
        processingClaimId: null,
        processingOutcome: 'delivery_unknown',
        errorMessage: expect.stringContaining('发送结果未知'),
      });
      expect(storedIncoming.processedAt).not.toBeNull();
      expect(storedOutgoing).toMatchObject({
        deliveryStatus: 'failed',
        errorMessage: expect.stringContaining('发送结果未知'),
      });
      expect(storedConversation.messageCount).toBe(2);
      expect(memoryCount).toBe(0);
    } finally {
      await cleanupIntegrationUser(userId);
    }
  }, 60000);

  it.each([
    {
      label: 'sent reply',
      deliveryStatus: 'sent' as const,
      expectedStatus: 'sent',
      expectedOutcome: 'processed_ackable',
      expectedAckable: true,
      stableExternalId: true,
      linkedDecisionOutput: false,
    },
    {
      label: 'ambiguous planned reply',
      deliveryStatus: 'planned' as const,
      expectedStatus: 'failed',
      expectedOutcome: 'delivery_unknown',
      expectedAckable: false,
      stableExternalId: true,
      linkedDecisionOutput: false,
    },
    {
      label: 'decision-linked sent reply without a stable external id',
      deliveryStatus: 'sent' as const,
      expectedStatus: 'sent',
      expectedOutcome: 'processed_ackable',
      expectedAckable: true,
      stableExternalId: false,
      linkedDecisionOutput: true,
    },
  ])(
    'resumes local finalization for a persisted decision with $label without resending',
    async ({
      deliveryStatus,
      expectedStatus,
      expectedOutcome,
      expectedAckable,
      stableExternalId,
      linkedDecisionOutput,
    }) => {
      const userId = await createIntegrationUser();

      try {
        const jobDescription = await createPublishedJobDescription(userId);
        const candidateId = await createCandidate(userId, 'http://127.0.0.1:6183');
        const occurredAt = new Date('2026-07-20T09:00:00.000Z');
        const conversation = await prisma.candidateConversation.create({
          data: {
            userId,
            jobDescriptionId: jobDescription.id,
            candidateId,
            platform: 'boss-like',
            stage: 'new',
            status: 'active',
            lastActiveAt: occurredAt,
            lastCandidateMessageAt: occurredAt,
          },
        });
        const incoming = await prisma.candidateConversationMessage.create({
          data: {
            conversationId: conversation.id,
            userId,
            jobDescriptionId: jobDescription.id,
            candidateId,
            platform: 'boss-like',
            role: 'candidate',
            content: '你好，还在招聘吗？',
            externalMessageId: `resume-finalization-${deliveryStatus}-${candidateId}`,
            deliveryStatus: 'received',
            processingClaimId: 'expired-claim',
            processingLeaseExpiresAt: new Date('2026-07-20T09:05:00.000Z'),
            processingOutcome: 'in_flight',
            occurredAt,
          },
        });
        const outgoing = await prisma.candidateConversationMessage.create({
          data: {
            conversationId: conversation.id,
            userId,
            jobDescriptionId: jobDescription.id,
            candidateId,
            platform: 'boss-like',
            role: 'agent',
            content: '还在招聘，方便继续聊聊吗？',
            externalMessageId: stableExternalId
              ? candidateCommunicationReplyExternalMessageId(incoming.id)
              : null,
            deliveryStatus,
            occurredAt: new Date(occurredAt.getTime() + 1000),
          },
        });
        await prisma.candidateConversationDecision.create({
          data: {
            conversationId: conversation.id,
            userId,
            jobDescriptionId: jobDescription.id,
            candidateId,
            inputMessageId: incoming.id,
            outputMessageId: linkedDecisionOutput ? outgoing.id : null,
            intent: 'greeting',
            intentLevel: 'medium',
            nextStage: 'contact_requested',
            shouldReply: true,
            reply: outgoing.content,
            actions: ['reply'],
            rationale: 'persisted before the interrupted delivery',
          },
        });
        const runLLM = jest.fn();
        const createAdapter = jest.fn();

        const result = await handleCandidateMessage({
          userId,
          payload: {
            jobDescriptionId: jobDescription.id,
            candidateId,
            platform: 'boss-like',
            message: {
              content: incoming.content,
              externalMessageId: incoming.externalMessageId,
              receivedAt: occurredAt,
            },
            executeReply: true,
          },
          dependencies: { runLLM, createAdapter },
        });

        const [storedIncoming, storedOutgoing, storedDecision, storedConversation] =
          await Promise.all([
            prisma.candidateConversationMessage.findUniqueOrThrow({
              where: { id: incoming.id },
            }),
            prisma.candidateConversationMessage.findUniqueOrThrow({
              where: { id: outgoing.id },
            }),
            prisma.candidateConversationDecision.findUniqueOrThrow({
              where: { inputMessageId: incoming.id },
            }),
            prisma.candidateConversation.findUniqueOrThrow({
              where: { id: conversation.id },
            }),
          ]);

        expect(runLLM).not.toHaveBeenCalled();
        expect(createAdapter).not.toHaveBeenCalled();
        expect(result).toMatchObject({
          processingStatus: 'processed',
          processingOutcome: expectedOutcome,
          ackable: expectedAckable,
        });
        expect(storedIncoming.processingOutcome).toBe(expectedOutcome);
        expect(storedIncoming.processedAt).not.toBeNull();
        expect(storedOutgoing.deliveryStatus).toBe(expectedStatus);
        expect(storedDecision.finalizedAt).not.toBeNull();
        expect(storedDecision.outputMessageId).toBe(outgoing.id);
        await expect(
          prisma.candidateConversationMessage.count({
            where: { userId, conversationId: conversation.id, role: 'agent' },
          }),
        ).resolves.toBe(1);
        expect(storedConversation).toMatchObject({
          stage: 'contact_requested',
          messageCount: 2,
        });
      } finally {
        await cleanupIntegrationUser(userId);
      }
    },
    60000,
  );

  it('fails closed without resending when a persisted decision points to a missing output', async () => {
    const userId = await createIntegrationUser();

    try {
      const jobDescription = await createPublishedJobDescription(userId);
      const candidateId = await createCandidate(userId, 'http://127.0.0.1:6183');
      const occurredAt = new Date('2026-07-20T09:00:00.000Z');
      const conversation = await prisma.candidateConversation.create({
        data: {
          userId,
          jobDescriptionId: jobDescription.id,
          candidateId,
          platform: 'boss-like',
          stage: 'new',
          status: 'active',
          lastActiveAt: occurredAt,
          lastCandidateMessageAt: occurredAt,
        },
      });
      const incoming = await prisma.candidateConversationMessage.create({
        data: {
          conversationId: conversation.id,
          userId,
          jobDescriptionId: jobDescription.id,
          candidateId,
          platform: 'boss-like',
          role: 'candidate',
          content: '你好，还在招聘吗？',
          externalMessageId: `missing-output-${candidateId}`,
          deliveryStatus: 'received',
          processingClaimId: 'expired-claim',
          processingLeaseExpiresAt: new Date(Date.now() - 1000),
          processingOutcome: 'in_flight',
          occurredAt,
        },
      });
      const missingOutputMessageId = `missing-agent-${candidateId}`;
      await prisma.candidateConversationDecision.create({
        data: {
          conversationId: conversation.id,
          userId,
          jobDescriptionId: jobDescription.id,
          candidateId,
          inputMessageId: incoming.id,
          outputMessageId: missingOutputMessageId,
          intent: 'greeting',
          intentLevel: 'medium',
          nextStage: 'contact_requested',
          shouldReply: true,
          reply: '还在招聘，方便继续聊聊吗？',
          actions: ['reply'],
          rationale: 'output disappeared after the delivery checkpoint',
        },
      });
      const runLLM = jest.fn();
      const createAdapter = jest.fn();

      const result = await handleCandidateMessage({
        userId,
        payload: {
          jobDescriptionId: jobDescription.id,
          candidateId,
          platform: 'boss-like',
          message: {
            content: incoming.content,
            externalMessageId: incoming.externalMessageId,
            receivedAt: occurredAt,
          },
          executeReply: true,
        },
        dependencies: { runLLM, createAdapter },
      });

      const [storedIncoming, storedDecision, outgoingCount] = await Promise.all([
        prisma.candidateConversationMessage.findUniqueOrThrow({ where: { id: incoming.id } }),
        prisma.candidateConversationDecision.findUniqueOrThrow({
          where: { inputMessageId: incoming.id },
        }),
        prisma.candidateConversationMessage.count({
          where: { userId, conversationId: conversation.id, role: 'agent' },
        }),
      ]);

      expect(runLLM).not.toHaveBeenCalled();
      expect(createAdapter).not.toHaveBeenCalled();
      expect(result).toMatchObject({
        processingStatus: 'processed',
        processingOutcome: 'delivery_unknown',
        ackable: false,
      });
      expect(storedIncoming).toMatchObject({
        processingOutcome: 'delivery_unknown',
        errorMessage: expect.stringContaining('发送结果未知'),
      });
      expect(storedDecision).toMatchObject({
        outputMessageId: missingOutputMessageId,
        finalizedAt: expect.any(Date),
      });
      expect(outgoingCount).toBe(0);
    } finally {
      await cleanupIntegrationUser(userId);
    }
  }, 60000);
});
