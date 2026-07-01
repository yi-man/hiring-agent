import { BossLikeCandidateSourceAdapter } from '@/lib/candidate-screening/adapters/boss-like';
import type { CandidateSourceAdapter } from '@/lib/candidate-screening/adapters/types';
import type { RawCandidate } from '@/lib/candidate-screening/ingest';
import type { CandidateActionPlan } from '@/lib/candidate-screening/types';
import type { BrowserStepResult } from '@/lib/jd-publishing/types';
import type {
  CandidateCommunicationSkillAdapter,
  UnreadCandidateMessage,
  UnreadCandidateReplyTarget,
} from '../skill-types';

const EMPTY_RAW_SNAPSHOT_ERROR =
  'boss-like unread message search returned an empty browser snapshot';
const BOSS_LIKE_MESSAGE_ID_PREFIX = 'boss-like-message:';

type BossLikeApiMessage = {
  id: number;
  content: string;
  type: string;
  isRead: boolean;
  senderId: number;
  receiverId: number;
  createdAt: string;
};

type BossLikeApiConversation = {
  userId: number;
  username: string;
  jobId: number | null;
  jobTitle: string | null;
  company: string | null;
  unreadCount: number;
  messages: BossLikeApiMessage[];
};

type BossLikeApiResume = {
  id: number;
  userId: number;
  name: string;
  education?: string | null;
  experience?: string | null;
  projects?: string | null;
  skills?: string[] | null;
  summary?: string | null;
  user?: { username?: string | null } | null;
};

type BossLikeUnreadApiInput = {
  conversations: BossLikeApiConversation[];
  resumes: BossLikeApiResume[];
  employerUserId: number;
};

type BossLikeApiAuth = {
  token: string;
  employerUserId: number;
};

function readAttr(attrs: string, name: string): string | null {
  return attrs.match(new RegExp(`${name}="([^"]+)"`, 'i'))?.[1]?.trim() ?? null;
}

function readTag(article: string, tag: string): string {
  return (
    article
      .match(new RegExp(`<${tag}[^>]*>([\\s\\S]*?)<\\/${tag}>`, 'i'))?.[1]
      ?.replace(/<[^>]+>/g, '')
      .trim() ?? ''
  );
}

function readField(article: string, field: string): string {
  return (
    article
      .match(new RegExp(`<[^>]+data-field="${field}"[^>]*>([\\s\\S]*?)<\\/[^>]+>`, 'i'))?.[1]
      ?.replace(/<[^>]+>/g, '')
      .trim() ?? ''
  );
}

function resolveSameOriginUrl(baseUrl: string, value: string | null): string | null {
  if (!value) return null;
  try {
    const resolved = new URL(value, `${baseUrl.replace(/\/+$/, '')}/`);
    const base = new URL(baseUrl);
    return resolved.origin === base.origin ? resolved.toString() : null;
  } catch {
    return null;
  }
}

function parseReceivedAt(value: string | null): Date {
  if (!value) return new Date();
  const date = new Date(value);
  return Number.isNaN(date.getTime()) ? new Date() : date;
}

function parseRequiredDate(value: string): Date {
  const date = new Date(value);
  return Number.isNaN(date.getTime()) ? new Date() : date;
}

function isRecord(value: unknown): value is Record<string, unknown> {
  return typeof value === 'object' && value !== null && !Array.isArray(value);
}

function readNumber(value: unknown): number | null {
  return typeof value === 'number' && Number.isFinite(value) ? value : null;
}

function readString(value: unknown): string | null {
  return typeof value === 'string' && value.trim() ? value.trim() : null;
}

function readStringArray(value: unknown): string[] {
  return Array.isArray(value)
    ? value.filter((item): item is string => typeof item === 'string')
    : [];
}

function assertApiEnvelope(value: unknown, action: string): unknown {
  if (!isRecord(value) || value.code !== 200) {
    const message = isRecord(value) ? readString(value.message) : null;
    throw new Error(message ?? `${action} failed`);
  }
  return value.data;
}

function buildResumeText(resume: BossLikeApiResume): string {
  return [
    resume.education,
    resume.experience,
    resume.projects,
    resume.skills?.length ? `技能：${resume.skills.join('、')}` : null,
    resume.summary,
  ]
    .filter((item): item is string => Boolean(item?.trim()))
    .join('\n');
}

function createReplyTarget(params: {
  receiverId: number;
  jobId: number | null;
  sourceMessageId: number;
}): UnreadCandidateReplyTarget {
  return {
    receiverId: String(params.receiverId),
    ...(params.jobId === null ? { jobId: null } : { jobId: String(params.jobId) }),
    sourceMessageId: String(params.sourceMessageId),
  };
}

async function requireSuccessfulStep(
  result: Promise<BrowserStepResult>,
  action: string,
): Promise<BrowserStepResult> {
  const stepResult = await result;
  if (!stepResult.success) {
    throw new Error(stepResult.error ?? `${action} failed`);
  }
  return stepResult;
}

export function extractBossLikeUnreadMessagesFromHtml(
  html: string,
  baseUrl: string,
): UnreadCandidateMessage[] {
  return Array.from(html.matchAll(/<article\b([\s\S]*?)<\/article>/gi))
    .filter((match) => /data-unread="true"/i.test(match[1] ?? ''))
    .map((match) => {
      const article = match[0];
      const attrs = match[1] ?? '';
      const profileUrl = resolveSameOriginUrl(baseUrl, readAttr(attrs, 'data-profile-url'));
      const occurredAt = article.match(/<time[^>]*datetime="([^"]+)"/i)?.[1]?.trim() ?? null;
      return {
        externalMessageId: readAttr(attrs, 'data-message-id') ?? '',
        platformCandidateId: readAttr(attrs, 'data-candidate-id'),
        candidateName: readTag(article, 'h2') || null,
        profileUrl,
        content: readField(article, 'message'),
        receivedAt: parseReceivedAt(occurredAt),
      };
    })
    .filter((message) => message.externalMessageId && message.content);
}

export function extractBossLikeUnreadMessagesFromApi(
  input: BossLikeUnreadApiInput,
  baseUrl: string,
): UnreadCandidateMessage[] {
  const resumeByUserId = new Map<number, BossLikeApiResume>();
  for (const resume of input.resumes) {
    if (!resumeByUserId.has(resume.userId)) {
      resumeByUserId.set(resume.userId, resume);
    }
  }

  const messages: UnreadCandidateMessage[] = [];
  for (const conversation of input.conversations) {
    if (conversation.unreadCount <= 0) continue;
    const resume = resumeByUserId.get(conversation.userId);
    const profileUrl = resume
      ? resolveSameOriginUrl(baseUrl, `/employer/resumes/${resume.id}`)
      : null;

    for (const message of conversation.messages) {
      if (message.receiverId !== input.employerUserId || message.isRead) continue;
      messages.push({
        externalMessageId: `${BOSS_LIKE_MESSAGE_ID_PREFIX}${message.id}`,
        platformCandidateId: resume ? String(resume.id) : null,
        candidateName: resume?.name || conversation.username || null,
        profileUrl,
        platformJobTitle: conversation.jobTitle,
        replyTarget: createReplyTarget({
          receiverId: conversation.userId,
          jobId: conversation.jobId,
          sourceMessageId: message.id,
        }),
        content: message.content,
        receivedAt: parseRequiredDate(message.createdAt),
      });
    }
  }

  return messages;
}

class BossLikeConversationReplyAdapter implements CandidateSourceAdapter {
  readonly platform = 'boss-like' as const;

  constructor(
    private readonly owner: BossLikeCandidateCommunicationAdapter,
    private readonly message: UnreadCandidateMessage,
  ) {}

  async loginIfNeeded(): Promise<void> {
    await this.owner.ensureApiLogin();
  }

  async *searchCandidates() {
    return;
  }

  async collectCandidate() {
    return {
      success: false,
      error: 'collect is not supported for boss-like message replies',
    };
  }

  async chatCandidate(
    _candidate: Parameters<CandidateSourceAdapter['chatCandidate']>[0],
    plan: CandidateActionPlan,
  ) {
    return this.owner.sendReplyToUnreadMessage(this.message, plan.message ?? '');
  }

  async close(): Promise<void> {
    return undefined;
  }
}

export class BossLikeCandidateCommunicationAdapter
  extends BossLikeCandidateSourceAdapter
  implements CandidateCommunicationSkillAdapter
{
  private apiAuth: BossLikeApiAuth | null = null;
  private resumesByUserId = new Map<number, BossLikeApiResume>();

  async listUnreadMessages(): Promise<UnreadCandidateMessage[]> {
    try {
      return await this.listUnreadMessagesFromApi();
    } catch (error) {
      const htmlMessages = await this.listUnreadMessagesFromHtml();
      if (htmlMessages.length > 0 || process.env.NODE_ENV === 'test') {
        return htmlMessages;
      }
      throw error;
    }
  }

  createReplyAdapterForMessage(message: UnreadCandidateMessage): CandidateSourceAdapter {
    return message.replyTarget ? new BossLikeConversationReplyAdapter(this, message) : this;
  }

  async collectCandidateFromMessage(message: UnreadCandidateMessage): Promise<RawCandidate | null> {
    await this.ensureResumeCache();
    const receiverId = Number(message.replyTarget?.receiverId);
    const resume = Number.isFinite(receiverId) ? this.resumesByUserId.get(receiverId) : null;
    if (!resume) return null;

    return {
      platformCandidateId: String(resume.id),
      profileUrl: resolveSameOriginUrl(this.baseUrl, `/employer/resumes/${resume.id}`),
      name: resume.name || message.candidateName || `candidate_${resume.userId}`,
      title: '候选人',
      company: resume.user?.username ?? null,
      resumeText: buildResumeText(resume) || message.content,
      lastActiveAt: message.receivedAt.toISOString(),
    };
  }

  async markUnreadMessageProcessed(message: UnreadCandidateMessage): Promise<void> {
    const target = message.replyTarget;
    if (!target) return;
    const jobId = target.jobId ?? 'null';
    await this.apiGet(`/api/messages/conversation/${target.receiverId}/${jobId}`, 'mark read');
  }

  async ensureApiLogin(): Promise<BossLikeApiAuth> {
    if (this.apiAuth) return this.apiAuth;

    const response = await fetch(`${this.baseUrl}/api/auth/login`, {
      method: 'POST',
      headers: { 'content-type': 'application/json' },
      body: JSON.stringify({
        username: this.credentials.username,
        password: this.credentials.password,
      }),
    });
    const payload = assertApiEnvelope(await response.json(), 'boss-like api login');
    if (!isRecord(payload)) {
      throw new Error('boss-like api login returned invalid data');
    }
    const token = readString(payload.token);
    const employerUserId = readNumber(payload.id);
    if (!token || employerUserId === null) {
      throw new Error('boss-like api login returned incomplete data');
    }
    this.apiAuth = { token, employerUserId };
    return this.apiAuth;
  }

  async sendReplyToUnreadMessage(message: UnreadCandidateMessage, content: string) {
    const target = message.replyTarget;
    const text = content.trim();
    if (!target) {
      return {
        success: false,
        error: 'boss-like reply target is missing',
        browserTrace: { action: 'chat', channel: 'api' },
      };
    }
    if (!text) {
      return {
        success: false,
        error: 'chat message is required',
        browserTrace: { action: 'chat', channel: 'api', receiverId: target.receiverId },
      };
    }

    try {
      await this.apiPost('/api/messages', 'send message', {
        receiverId: Number(target.receiverId),
        content: text,
        ...(target.jobId ? { jobId: Number(target.jobId) } : {}),
      });
      return {
        success: true,
        browserTrace: {
          action: 'chat',
          channel: 'api',
          receiverId: target.receiverId,
          jobId: target.jobId ?? null,
          sourceMessageId: target.sourceMessageId ?? null,
          messageLength: text.length,
        },
      };
    } catch (error) {
      return {
        success: false,
        error: error instanceof Error ? error.message : String(error),
        browserTrace: {
          action: 'chat',
          channel: 'api',
          receiverId: target.receiverId,
          jobId: target.jobId ?? null,
        },
      };
    }
  }

  private async listUnreadMessagesFromApi(): Promise<UnreadCandidateMessage[]> {
    const [conversations, resumes, auth] = await Promise.all([
      this.apiGet('/api/messages/conversations', 'list conversations'),
      this.apiGet('/api/resumes', 'list resumes'),
      this.ensureApiLogin(),
    ]);
    const parsedConversations = this.parseConversations(conversations);
    const parsedResumes = this.parseResumes(resumes);
    this.resumesByUserId = new Map(parsedResumes.map((resume) => [resume.userId, resume]));
    return extractBossLikeUnreadMessagesFromApi(
      {
        conversations: parsedConversations,
        resumes: parsedResumes,
        employerUserId: auth.employerUserId,
      },
      this.baseUrl,
    );
  }

  private async listUnreadMessagesFromHtml(): Promise<UnreadCandidateMessage[]> {
    await requireSuccessfulStep(this.executor.navigate(this.unreadMessageUrl()), 'open messages');
    const html = await this.readRawSnapshot();
    return extractBossLikeUnreadMessagesFromHtml(html, this.baseUrl);
  }

  private async ensureResumeCache(): Promise<void> {
    if (this.resumesByUserId.size > 0) return;
    const resumes = this.parseResumes(await this.apiGet('/api/resumes', 'list resumes'));
    this.resumesByUserId = new Map(resumes.map((resume) => [resume.userId, resume]));
  }

  private async apiGet(path: string, action: string): Promise<unknown> {
    const auth = await this.ensureApiLogin();
    const response = await fetch(`${this.baseUrl}${path}`, {
      headers: { authorization: `Bearer ${auth.token}` },
    });
    return assertApiEnvelope(await response.json(), action);
  }

  private async apiPost(path: string, action: string, body: unknown): Promise<unknown> {
    const auth = await this.ensureApiLogin();
    const response = await fetch(`${this.baseUrl}${path}`, {
      method: 'POST',
      headers: {
        authorization: `Bearer ${auth.token}`,
        'content-type': 'application/json',
      },
      body: JSON.stringify(body),
    });
    return assertApiEnvelope(await response.json(), action);
  }

  private parseConversations(value: unknown): BossLikeApiConversation[] {
    if (!Array.isArray(value)) return [];
    return value.flatMap((item): BossLikeApiConversation[] => {
      if (!isRecord(item)) return [];
      const userId = readNumber(item.userId);
      const username = readString(item.username);
      const unreadCount = readNumber(item.unreadCount);
      if (userId === null || !username || unreadCount === null) return [];
      const jobId = item.jobId === null ? null : readNumber(item.jobId);
      const messages = Array.isArray(item.messages)
        ? item.messages.flatMap((message): BossLikeApiMessage[] => {
            if (!isRecord(message)) return [];
            const id = readNumber(message.id);
            const content = readString(message.content);
            const senderId = readNumber(message.senderId);
            const receiverId = readNumber(message.receiverId);
            const createdAt = readString(message.createdAt);
            if (
              id === null ||
              !content ||
              senderId === null ||
              receiverId === null ||
              !createdAt ||
              typeof message.isRead !== 'boolean'
            ) {
              return [];
            }
            return [
              {
                id,
                content,
                type: readString(message.type) ?? 'text',
                isRead: message.isRead,
                senderId,
                receiverId,
                createdAt,
              },
            ];
          })
        : [];
      return [
        {
          userId,
          username,
          jobId,
          jobTitle: readString(item.jobTitle),
          company: readString(item.company),
          unreadCount,
          messages,
        },
      ];
    });
  }

  private parseResumes(value: unknown): BossLikeApiResume[] {
    if (!Array.isArray(value)) return [];
    return value.flatMap((item): BossLikeApiResume[] => {
      if (!isRecord(item)) return [];
      const id = readNumber(item.id);
      const userId = readNumber(item.userId);
      const name = readString(item.name);
      if (id === null || userId === null || !name) return [];
      const user = isRecord(item.user) ? { username: readString(item.user.username) } : null;
      return [
        {
          id,
          userId,
          name,
          education: readString(item.education),
          experience: readString(item.experience),
          projects: readString(item.projects),
          skills: readStringArray(item.skills),
          summary: readString(item.summary),
          user,
        },
      ];
    });
  }

  private unreadMessageUrl(): string {
    return `${this.baseUrl.replace(/\/+$/, '')}/employer/messages`;
  }

  private async readRawSnapshot(): Promise<string> {
    if (!this.executor.snapshot) {
      throw new Error('boss-like unread message skill requires raw browser snapshots');
    }
    const html = await this.executor.snapshot();
    if (!html.trim()) {
      throw new Error(EMPTY_RAW_SNAPSHOT_ERROR);
    }
    return html;
  }
}
