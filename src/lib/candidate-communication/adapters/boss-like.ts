import {
  BossLikeCandidateSourceAdapter,
  extractBossLikeCandidatesFromHtml,
} from '@/lib/candidate-screening/adapters/boss-like';
import type { CandidateSourceAdapter } from '@/lib/candidate-screening/adapters/types';
import type { RawCandidate } from '@/lib/candidate-screening/ingest';
import type { CandidateActionPlan } from '@/lib/candidate-screening/types';
import type { BrowserStepResult } from '@/lib/browser/types';
import type {
  CandidateCommunicationSkillAdapter,
  UnreadCandidateMessage,
  UnreadCandidateReplyTarget,
} from '../skill-types';

const EMPTY_RAW_SNAPSHOT_ERROR =
  'boss-like unread message search returned an empty browser snapshot';
const RENDERED_MESSAGE_ID_PREFIX = 'rendered-row:';
const CONVERSATION_ROW_SELECTOR =
  'main div[class*="overflow-y-auto"] > div[class*="cursor-pointer"]';
const REPLY_TEXTAREA_SELECTOR = 'textarea[placeholder="输入回复内容..."], textarea';
const SEND_BUTTON_SELECTOR = 'button:has-text("发送")';
const THREAD_SELECTOR_TEXT_MAX_LENGTH = 80;

type RenderedThread = {
  rowIndex: number;
  username: string;
  platformJobTitle: string | null;
  company: string | null;
  content: string;
  unreadCount: number;
  selector: string;
};

type ConversationMessageDirection = 'candidate' | 'agent';

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

function decodeHtml(value: string): string {
  return value
    .replace(/&nbsp;/g, ' ')
    .replace(/&amp;/g, '&')
    .replace(/&lt;/g, '<')
    .replace(/&gt;/g, '>')
    .replace(/&quot;/g, '"')
    .replace(/&#39;/g, "'")
    .replace(/\s+/g, ' ')
    .trim();
}

function stripTags(value: string): string {
  return decodeHtml(value.replace(/<[^>]+>/g, ' '));
}

function normalizeMatchText(value?: string | null): string {
  return value?.trim().replace(/\s+/g, '').toLowerCase() ?? '';
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

function createBrowserReplyTarget(params: {
  selector: string;
  sourceMessageId: string;
}): UnreadCandidateReplyTarget {
  return {
    browserThreadSelector: params.selector,
    sourceMessageId: params.sourceMessageId,
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

function findCursorPointerRows(html: string): Array<{ index: number; html: string }> {
  const starts = Array.from(
    html.matchAll(/<div\b[^>]*class="[^"]*\bcursor-pointer\b[^"]*"[^>]*>/gi),
  ).map((match) => match.index ?? 0);

  return starts.map((start, index) => ({
    index,
    html: sliceBalancedDiv(html, start),
  }));
}

function sliceBalancedDiv(html: string, start: number): string {
  const divTagPattern = /<\/?div\b[^>]*>/gi;
  divTagPattern.lastIndex = start;
  let depth = 0;
  for (let match = divTagPattern.exec(html); match; match = divTagPattern.exec(html)) {
    const tag = match[0] ?? '';
    if (tag.startsWith('</')) {
      depth -= 1;
      if (depth === 0) {
        return html.slice(start, match.index + tag.length);
      }
    } else {
      depth += 1;
    }
  }
  return html.slice(start);
}

function readFirstClassText(html: string, className: string): string | null {
  const match = html.match(
    new RegExp(`<[^>]+class="[^"]*${className}[^"]*"[^>]*>([\\s\\S]*?)<\\/[^>]+>`, 'i'),
  );
  return match ? stripTags(match[1] ?? '') : null;
}

function readParagraphText(html: string): string {
  const paragraphs = Array.from(html.matchAll(/<p\b[^>]*>([\s\S]*?)<\/p>/gi)).map((match) =>
    stripTags(match[1] ?? ''),
  );
  return paragraphs.reverse().find(Boolean) ?? '';
}

function readUnreadCount(rowHtml: string): number {
  if (!/bg-red-500/i.test(rowHtml)) return 0;
  const badges = Array.from(rowHtml.matchAll(/<span\b[^>]*bg-red-500[^>]*>([\s\S]*?)<\/span>/gi))
    .map((match) => Number.parseInt(stripTags(match[1] ?? ''), 10))
    .filter(Number.isFinite);
  return badges[0] ?? 1;
}

function splitJobLine(value: string | null): { title: string | null; company: string | null } {
  if (!value) return { title: null, company: null };
  const [title, company] = value.split('·').map((part) => part.trim());
  return { title: title || null, company: company || null };
}

function createHasTextClause(value: string | null): string {
  const trimmed = value?.replace(/\s+/g, ' ').trim();
  if (!trimmed) return '';
  return `:has-text(${JSON.stringify(trimmed.slice(0, THREAD_SELECTOR_TEXT_MAX_LENGTH))})`;
}

function createConversationRowSelector(params: {
  rowIndex: number;
  username: string;
  platformJobTitle: string | null;
  content: string;
}): string {
  const textSelector = [
    createHasTextClause(params.username),
    createHasTextClause(params.platformJobTitle),
    createHasTextClause(params.content),
  ].join('');
  return textSelector
    ? `${CONVERSATION_ROW_SELECTOR}${textSelector}`
    : `${CONVERSATION_ROW_SELECTOR}:nth-of-type(${params.rowIndex})`;
}

function createRenderedSourceMessageId(thread: RenderedThread): string {
  return `${RENDERED_MESSAGE_ID_PREFIX}${thread.rowIndex}`;
}

function extractRenderedThreads(html: string): RenderedThread[] {
  return findCursorPointerRows(html)
    .map((row) => {
      const username = readFirstClassText(row.html, 'font-medium') ?? '';
      const jobLine = splitJobLine(readFirstClassText(row.html, 'text-xs'));
      const unreadCount = readUnreadCount(row.html);
      const content = readParagraphText(row.html);
      return {
        rowIndex: row.index + 1,
        username,
        platformJobTitle: jobLine.title,
        company: jobLine.company,
        content,
        unreadCount,
        selector: createConversationRowSelector({
          rowIndex: row.index + 1,
          username,
          platformJobTitle: jobLine.title,
          content,
        }),
      };
    })
    .filter((thread) => thread.username && thread.content);
}

function findResumeForThread(thread: RenderedThread, resumes: RawCandidate[]): RawCandidate | null {
  const username = normalizeMatchText(thread.username);
  const exact = resumes.find(
    (resume) =>
      normalizeMatchText(resume.company) === username ||
      normalizeMatchText(resume.name) === username,
  );
  if (exact) return exact;

  return (
    resumes.find((resume) => {
      const name = normalizeMatchText(resume.name);
      const company = normalizeMatchText(resume.company);
      return Boolean(
        (name && (name.includes(username) || username.includes(name))) ||
        (company && (company.includes(username) || username.includes(company))),
      );
    }) ?? null
  );
}

function createMessageFromRenderedThread(
  thread: RenderedThread,
  resumes: RawCandidate[],
  baseUrl: string,
): UnreadCandidateMessage {
  const resume = findResumeForThread(thread, resumes);
  const externalMessageId = createRenderedSourceMessageId(thread);
  return {
    externalMessageId,
    platformCandidateId: resume?.platformCandidateId ?? null,
    candidateName: resume?.name ?? thread.username,
    profileUrl: resolveSameOriginUrl(baseUrl, resume?.profileUrl ?? null),
    platformJobTitle: thread.platformJobTitle,
    replyTarget: createBrowserReplyTarget({
      selector: thread.selector,
      sourceMessageId: externalMessageId,
    }),
    content: thread.content,
    receivedAt: new Date(),
  };
}

function readLastConversationMessageDirection(html: string): ConversationMessageDirection | null {
  let lastDirection: ConversationMessageDirection | null = null;
  for (const match of html.matchAll(
    /<div\b[^>]*class="[^"]*\bflex\b[^"]*\bjustify-(start|end)\b[^"]*"[^>]*>/gi,
  )) {
    lastDirection = match[1] === 'start' ? 'candidate' : 'agent';
  }
  return lastDirection;
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

export function extractBossLikeUnreadMessagesFromRenderedHtml(
  messagesHtml: string,
  resumesHtml: string,
  baseUrl: string,
): UnreadCandidateMessage[] {
  const legacyMessages = extractBossLikeUnreadMessagesFromHtml(messagesHtml, baseUrl);
  if (legacyMessages.length > 0) return legacyMessages;

  const resumes = extractBossLikeCandidatesFromHtml(resumesHtml);
  return extractRenderedThreads(messagesHtml)
    .filter((thread) => thread.unreadCount > 0)
    .map((thread) => createMessageFromRenderedThread(thread, resumes, baseUrl))
    .filter((message) => message.content);
}

class BossLikeBrowserConversationReplyAdapter implements CandidateSourceAdapter {
  readonly platform = 'boss-like' as const;

  constructor(
    private readonly owner: BossLikeCandidateCommunicationAdapter,
    private readonly message: UnreadCandidateMessage,
  ) {}

  async loginIfNeeded(): Promise<void> {
    await this.owner.loginIfNeeded();
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
    return this.owner.sendReplyToUnreadMessageInBrowser(this.message, plan.message ?? '');
  }

  async close(): Promise<void> {
    return undefined;
  }
}

export class BossLikeCandidateCommunicationAdapter
  extends BossLikeCandidateSourceAdapter
  implements CandidateCommunicationSkillAdapter
{
  async listUnreadMessages(): Promise<UnreadCandidateMessage[]> {
    await this.loginIfNeeded();
    await this.openMessagesPage();
    const messagesHtml = await this.readRawSnapshot();
    const legacyMessages = extractBossLikeUnreadMessagesFromHtml(messagesHtml, this.baseUrl);
    if (legacyMessages.length > 0) return legacyMessages;
    const renderedThreads = extractRenderedThreads(messagesHtml);
    const pendingReplySourceIds = await this.findPendingReplySourceIds(renderedThreads);

    await requireSuccessfulStep(
      this.executor.navigate(this.communicationResumeListUrl()),
      'open resume list',
    );
    await this.executor.check({
      type: 'text_contains',
      text: '简历',
      timeout: 5_000,
    });
    const resumesHtml = await this.readRawSnapshot();
    const resumes = extractBossLikeCandidatesFromHtml(resumesHtml);
    return renderedThreads
      .filter(
        (thread) =>
          thread.unreadCount > 0 ||
          pendingReplySourceIds.has(createRenderedSourceMessageId(thread)),
      )
      .map((thread) => createMessageFromRenderedThread(thread, resumes, this.baseUrl))
      .filter((message) => message.content);
  }

  createReplyAdapterForMessage(message: UnreadCandidateMessage): CandidateSourceAdapter {
    return message.replyTarget?.browserThreadSelector
      ? new BossLikeBrowserConversationReplyAdapter(this, message)
      : this;
  }

  async collectCandidateFromMessage(message: UnreadCandidateMessage): Promise<RawCandidate | null> {
    if (!message.profileUrl) {
      return {
        platformCandidateId: message.platformCandidateId ?? null,
        profileUrl: null,
        name: message.candidateName ?? '候选人',
        title: message.platformJobTitle ?? '候选人',
        resumeText: message.content,
        lastActiveAt: message.receivedAt.toISOString(),
      };
    }

    await this.loginIfNeeded();
    await requireSuccessfulStep(
      this.executor.navigate(message.profileUrl),
      'open candidate profile',
    );
    const detailHtml = await this.readRawSnapshot();
    const detail = extractBossLikeCandidatesFromHtml(detailHtml)[0];
    if (!detail) {
      return {
        platformCandidateId: message.platformCandidateId,
        profileUrl: message.profileUrl,
        name: message.candidateName ?? '候选人',
        title: '候选人',
        resumeText: message.content,
        lastActiveAt: message.receivedAt.toISOString(),
      };
    }

    return {
      ...detail,
      platformCandidateId: detail.platformCandidateId ?? message.platformCandidateId,
      profileUrl: resolveSameOriginUrl(this.baseUrl, detail.profileUrl ?? message.profileUrl),
      name: detail.name || message.candidateName || '候选人',
      resumeText: detail.resumeText || message.content,
      lastActiveAt: message.receivedAt.toISOString(),
    };
  }

  async markUnreadMessageProcessed(message: UnreadCandidateMessage): Promise<void> {
    const selector = message.replyTarget?.browserThreadSelector;
    if (!selector) return;
    await this.openMessagesPage();
    const isStillVisible = await this.executor.check({
      type: 'dom_exists',
      selector,
      timeout: 2_000,
    });
    if (!isStillVisible) return;
    await this.clickSelector(selector, 'open unread conversation');
  }

  async sendReplyToUnreadMessageInBrowser(message: UnreadCandidateMessage, content: string) {
    const selector = message.replyTarget?.browserThreadSelector;
    const text = content.trim();
    if (!selector) {
      return {
        success: false,
        error: 'boss-like browser conversation selector is missing',
        browserTrace: { action: 'chat', channel: 'browser' },
      };
    }
    if (!text) {
      return {
        success: false,
        error: 'chat message is required',
        browserTrace: { action: 'chat', channel: 'browser', selector },
      };
    }

    try {
      await this.openMessagesPage();
      await this.clickSelector(selector, 'open unread conversation');
      await this.executor.check({
        type: 'dom_exists',
        selector: REPLY_TEXTAREA_SELECTOR,
        timeout: 5_000,
      });
      await this.fillSelector(REPLY_TEXTAREA_SELECTOR, text, 'fill chat message');
      await this.clickSelector(SEND_BUTTON_SELECTOR, 'send chat message');
      return {
        success: true,
        browserTrace: {
          action: 'chat',
          channel: 'browser',
          selector,
          sourceMessageId: message.replyTarget?.sourceMessageId ?? null,
          messageLength: text.length,
        },
      };
    } catch (error) {
      return {
        success: false,
        error: error instanceof Error ? error.message : String(error),
        browserTrace: { action: 'chat', channel: 'browser', selector },
      };
    }
  }

  private async openMessagesPage(): Promise<void> {
    await requireSuccessfulStep(this.executor.navigate(this.unreadMessageUrl()), 'open messages');
    await this.executor.check({
      type: 'text_contains',
      text: '消息列表',
      timeout: 5_000,
    });
  }

  private async clickSelector(selector: string, action: string): Promise<void> {
    if (!this.executor.clickSelector) {
      throw new Error('boss-like browser communication requires selector clicking support');
    }
    await requireSuccessfulStep(this.executor.clickSelector(selector), action);
  }

  private async fillSelector(selector: string, value: string, action: string): Promise<void> {
    if (!this.executor.fillSelector) {
      throw new Error('boss-like browser communication requires selector filling support');
    }
    await requireSuccessfulStep(this.executor.fillSelector(selector, value), action);
  }

  private async findPendingReplySourceIds(threads: RenderedThread[]): Promise<Set<string>> {
    const pending = new Set<string>();
    for (const thread of threads) {
      if (thread.unreadCount > 0) continue;
      try {
        await this.clickSelector(thread.selector, 'inspect read conversation');
        await this.waitForConversationDetail(thread);
        const detailHtml = await this.readRawSnapshot();
        if (readLastConversationMessageDirection(detailHtml) === 'candidate') {
          pending.add(createRenderedSourceMessageId(thread));
        }
      } catch {
        continue;
      }
    }
    return pending;
  }

  private async waitForConversationDetail(thread: RenderedThread): Promise<void> {
    const detailHeaderSelector = thread.platformJobTitle
      ? [
          'div.flex-1.flex.flex-col > div[class*="border-b"]',
          createHasTextClause(thread.username),
          createHasTextClause(thread.platformJobTitle),
        ].join('')
      : `div.flex-1.flex.flex-col h3${createHasTextClause(thread.username)}`;
    await this.executor.check({
      type: 'dom_exists',
      selector: detailHeaderSelector,
      timeout: 2_000,
    });
    await this.executor.check({
      type: 'dom_exists',
      selector: `div.flex-1.flex.flex-col div[class*="overflow-y-auto"]${createHasTextClause(
        thread.content,
      )}`,
      timeout: 2_000,
    });
  }

  private communicationResumeListUrl(): string {
    return `${this.baseUrl.replace(/\/+$/, '')}/employer/resumes`;
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
