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
import { BossLikeCandidateSourceAdapter } from '@/lib/candidate-screening/adapters/boss-like';
import { createCandidateIdentity } from '@/lib/candidate-screening/dedupe';
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
      <form method="post" action="/employer/messages/boss-message-1/reply">
        <label>消息 <textarea name="message" placeholder="输入回复内容..."></textarea></label>
        <button type="submit">发送</button>
      </form>
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
        response.end('<!doctype html><html><body>Message sent</body></html>');
        return;
      }

      const messageMatch = url.pathname.match(/^\/employer\/resumes\/([^/]+)\/messages$/);
      if (request.method === 'POST' && messageMatch) {
        postedMessages.push(await readRequestBody(request));
        hasUnreadMessage = false;
        response.end('<!doctype html><html><body>Message sent</body></html>');
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
});
