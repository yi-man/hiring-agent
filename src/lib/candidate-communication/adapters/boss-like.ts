import { createHash } from 'node:crypto';
import {
  BossLikeCandidateSourceAdapter,
  extractBossLikeCandidatesFromHtml,
} from '@/lib/candidate-screening/adapters/boss-like';
import type { BossLikeCandidateSourceAdapterOptions } from '@/lib/candidate-screening/adapters/boss-like';
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
const RENDERED_MESSAGE_ID_PREFIX = 'rendered-message:';
const CONVERSATION_ROW_SELECTOR =
  'main div[class*="overflow-y-auto"] > div[class*="cursor-pointer"]';
const REPLY_TEXTAREA_SELECTOR = 'textarea[placeholder="输入回复内容..."], textarea';
const SEND_BUTTON_SELECTOR = 'button:has-text("发送")';
const THREAD_SELECTOR_TEXT_MAX_LENGTH = 80;
const RENDERED_MESSAGE_ID_ATTRIBUTES = [
  'data-latest-message-id',
  'data-last-message-id',
  'data-message-id',
  'data-message-key',
] as const;
const RENDERED_THREAD_ID_ATTRIBUTES = [
  'data-conversation-id',
  'data-thread-id',
  'data-session-id',
] as const;

type RenderedThread = {
  rowIndex: number;
  username: string;
  platformJobTitle: string | null;
  company: string | null;
  content: string;
  unreadCount: number;
  selector: string;
  stableMessageOccurrenceId: string | null;
  stableThreadId: string | null;
};

type ConversationMessageDirection = 'candidate' | 'agent';

type RenderedMessageOccurrence = {
  key: string | null;
  content: string;
  receivedAt: Date | null;
  stableMessageOccurrenceId: string | null;
};

type RenderedThreadInspection = {
  occurrences: RenderedMessageOccurrence[];
};

function readAttr(attrs: string, name: string): string | null {
  const escapedName = name.replace(/[.*+?^${}()|[\]\\]/g, '\\$&');
  const match = attrs.match(
    new RegExp(`\\b${escapedName}\\s*=\\s*(?:"([^"]*)"|'([^']*)'|([^\\s>]+))`, 'i'),
  );
  return decodeHtml(match?.[1] ?? match?.[2] ?? match?.[3] ?? '') || null;
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

function findCursorPointerRows(
  html: string,
): Array<{ index: number; html: string; attrs: string }> {
  const starts = Array.from(
    html.matchAll(/<div\b([^>]*class="[^"]*\bcursor-pointer\b[^"]*"[^>]*)>/gi),
  );

  return starts.map((match, index) => ({
    index,
    html: sliceBalancedDiv(html, match.index ?? 0),
    attrs: match[1] ?? '',
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

function readFirstAttribute(
  html: string,
  attrs: string,
  names: readonly string[],
): { name: string; value: string } | null {
  const openingAttribute = readFirstOpeningAttribute(attrs, names);
  if (openingAttribute) return openingAttribute;

  for (const name of names) {
    const tagWithAttribute = html.match(
      new RegExp(`<[^>]+\\b${name}\\s*=\\s*(?:"[^"]*"|'[^']*'|[^\\s>]+)[^>]*>`, 'i'),
    )?.[0];
    const nestedValue = tagWithAttribute ? readAttr(tagWithAttribute, name) : null;
    if (nestedValue) return { name, value: nestedValue };
  }
  return null;
}

function readFirstOpeningAttribute(
  attrs: string,
  names: readonly string[],
): { name: string; value: string } | null {
  for (const name of names) {
    const value = readAttr(attrs, name);
    if (value) return { name, value };
  }
  return null;
}

function readOnclickThreadIdentity(attrs: string): string | null {
  const onclick = readAttr(attrs, 'onclick');
  if (!onclick) return null;
  const tokens = Array.from(onclick.matchAll(/['"]([^'"]+)['"]/g)).map(
    (match) => match[1]?.trim() ?? '',
  );
  const messageToken = tokens.find(
    (token) =>
      token &&
      !token.startsWith('#') &&
      /(?:^|[-_/:])(?:conversation|message|msg|thread)(?:[-_/:]|$)/i.test(token),
  );
  return messageToken ? `onclick:${messageToken}` : null;
}

function readRenderedRowIdentities(
  rowHtml: string,
  attrs: string,
): {
  messageOccurrenceId: string | null;
  threadId: string | null;
  stableThreadSelector: string | null;
  messageSelector: string | null;
} {
  const openingMessageAttribute = readFirstOpeningAttribute(attrs, RENDERED_MESSAGE_ID_ATTRIBUTES);
  const openingThreadAttribute = readFirstOpeningAttribute(attrs, RENDERED_THREAD_ID_ATTRIBUTES);
  const messageAttribute =
    openingMessageAttribute ?? readFirstAttribute(rowHtml, attrs, RENDERED_MESSAGE_ID_ATTRIBUTES);
  const threadAttribute =
    openingThreadAttribute ?? readFirstAttribute(rowHtml, attrs, RENDERED_THREAD_ID_ATTRIBUTES);
  const onclick = readAttr(attrs, 'onclick');
  const onclickThreadIdentity = readOnclickThreadIdentity(attrs);
  const compositeUserId = readAttr(attrs, 'data-user-id');
  const compositeJobId = readAttr(attrs, 'data-job-id');
  const attributeSelector = (name: string, value: string) => `[${name}=${JSON.stringify(value)}]`;
  const stableThreadSelector = openingThreadAttribute
    ? `${CONVERSATION_ROW_SELECTOR}${attributeSelector(
        openingThreadAttribute.name,
        openingThreadAttribute.value,
      )}`
    : compositeUserId
      ? `${CONVERSATION_ROW_SELECTOR}${attributeSelector('data-user-id', compositeUserId)}${
          compositeJobId ? attributeSelector('data-job-id', compositeJobId) : ''
        }`
      : onclickThreadIdentity && onclick
        ? `${CONVERSATION_ROW_SELECTOR}${attributeSelector('onclick', onclick)}`
        : threadAttribute
          ? `${CONVERSATION_ROW_SELECTOR}:has(${attributeSelector(
              threadAttribute.name,
              threadAttribute.value,
            )})`
          : null;
  const messageSelector = openingMessageAttribute
    ? `${CONVERSATION_ROW_SELECTOR}${attributeSelector(
        openingMessageAttribute.name,
        openingMessageAttribute.value,
      )}`
    : messageAttribute
      ? `${CONVERSATION_ROW_SELECTOR}:has(${attributeSelector(
          messageAttribute.name,
          messageAttribute.value,
        )})`
      : null;

  return {
    messageOccurrenceId: messageAttribute
      ? `${messageAttribute.name}:${messageAttribute.value}`
      : null,
    threadId: threadAttribute
      ? `${threadAttribute.name}:${threadAttribute.value}`
      : compositeUserId
        ? `user-job:${compositeUserId}:${compositeJobId ?? 'none'}`
        : onclickThreadIdentity,
    stableThreadSelector,
    messageSelector,
  };
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
  username: string;
  platformJobTitle: string | null;
  content: string;
  stableThreadSelector: string | null;
  messageSelector: string | null;
}): string {
  if (params.stableThreadSelector) return params.stableThreadSelector;
  if (params.messageSelector) return params.messageSelector;
  const textSelector = [
    createHasTextClause(params.username),
    createHasTextClause(params.platformJobTitle),
    createHasTextClause(params.content),
  ].join('');
  return `${CONVERSATION_ROW_SELECTOR}${textSelector}`;
}

function createRenderedSourceMessageId(
  thread: RenderedThread,
  resume: RawCandidate | null,
  occurrence: RenderedMessageOccurrence,
): string | null {
  const explicitMessageIdentity = occurrence.stableMessageOccurrenceId;
  const candidateIdentity = resume?.platformCandidateId ?? resume?.profileUrl ?? null;
  const stableThreadIdentity =
    thread.stableThreadId ??
    (candidateIdentity
      ? [candidateIdentity, thread.platformJobTitle, thread.company]
          .map((value) => value ?? '')
          .join('\u001f')
      : null);
  if (!explicitMessageIdentity && (!stableThreadIdentity || !occurrence.key)) return null;

  const fingerprint = explicitMessageIdentity
    ? `message\u001f${explicitMessageIdentity}`
    : `thread\u001f${stableThreadIdentity}\u001f${occurrence.key}`;
  return `${RENDERED_MESSAGE_ID_PREFIX}${createHash('md5').update(fingerprint).digest('hex')}`;
}

function extractRenderedThreads(html: string): RenderedThread[] {
  const threads = findCursorPointerRows(html)
    .map((row) => {
      const username = readFirstClassText(row.html, 'font-medium') ?? '';
      const jobLine = splitJobLine(readFirstClassText(row.html, 'text-xs'));
      const unreadCount = readUnreadCount(row.html);
      const content = readParagraphText(row.html);
      const identities = readRenderedRowIdentities(row.html, row.attrs);
      return {
        rowIndex: row.index + 1,
        username,
        platformJobTitle: jobLine.title,
        company: jobLine.company,
        content,
        unreadCount,
        selector: createConversationRowSelector({
          username,
          platformJobTitle: jobLine.title,
          content,
          stableThreadSelector: identities.stableThreadSelector,
          messageSelector: identities.messageSelector,
        }),
        stableMessageOccurrenceId: identities.messageOccurrenceId,
        stableThreadId: identities.threadId,
      };
    })
    .filter((thread) => thread.username && thread.content);

  const selectorCounts = new Map<string, number>();
  for (const thread of threads) {
    selectorCounts.set(thread.selector, (selectorCounts.get(thread.selector) ?? 0) + 1);
  }
  if (threads.some((thread) => selectorCounts.get(thread.selector) !== 1)) {
    throw new Error('boss-like conversation thread selectors are not unique');
  }
  return threads;
}

function findResumeForThread(thread: RenderedThread, resumes: RawCandidate[]): RawCandidate | null {
  const username = normalizeMatchText(thread.username);
  const exact = resumes.filter(
    (resume) =>
      normalizeMatchText(resume.company) === username ||
      normalizeMatchText(resume.name) === username,
  );
  if (exact.length === 1) return exact[0] ?? null;
  if (exact.length > 1) return null;

  const fuzzy = resumes.filter((resume) => {
    const name = normalizeMatchText(resume.name);
    const company = normalizeMatchText(resume.company);
    return Boolean(
      (name && (name.includes(username) || username.includes(name))) ||
      (company && (company.includes(username) || username.includes(company))),
    );
  });
  return fuzzy.length === 1 ? (fuzzy[0] ?? null) : null;
}

function createMessageFromRenderedThread(
  thread: RenderedThread,
  resumes: RawCandidate[],
  baseUrl: string,
  occurrence: RenderedMessageOccurrence,
): UnreadCandidateMessage | null {
  const resume = findResumeForThread(thread, resumes);
  const externalMessageId = createRenderedSourceMessageId(thread, resume, occurrence);
  if (!externalMessageId) return null;
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
    content: occurrence.content,
    receivedAt: occurrence.receivedAt ?? new Date(),
  };
}

function createRowMessageOccurrence(thread: RenderedThread): RenderedMessageOccurrence | null {
  return thread.stableMessageOccurrenceId
    ? {
        key: `row\u001f${thread.stableMessageOccurrenceId}`,
        content: thread.content,
        receivedAt: null,
        stableMessageOccurrenceId: thread.stableMessageOccurrenceId,
      }
    : null;
}

function omitCollidingRenderedMessages(
  messages: Array<UnreadCandidateMessage | null>,
): UnreadCandidateMessage[] {
  const present = messages.filter((message): message is UnreadCandidateMessage => Boolean(message));
  const counts = new Map<string, number>();
  for (const message of present) {
    counts.set(message.externalMessageId, (counts.get(message.externalMessageId) ?? 0) + 1);
  }
  if (present.some((message) => counts.get(message.externalMessageId) !== 1)) {
    throw new Error('boss-like unread message identities collide');
  }
  return present;
}

function findDirectionalConversationRows(
  html: string,
): Array<{ direction: ConversationMessageDirection; html: string; attrs: string }> {
  return Array.from(html.matchAll(/<div\b([^>]*)>/gi)).flatMap((match) => {
    const attrs = match[1] ?? '';
    const className = readAttr(attrs, 'class') ?? '';
    const classes = new Set(className.split(/\s+/).filter(Boolean));
    if (!classes.has('flex')) return [];
    const direction = classes.has('justify-start')
      ? 'candidate'
      : classes.has('justify-end')
        ? 'agent'
        : null;
    if (!direction) return [];
    return [
      {
        direction,
        html: sliceBalancedDiv(html, match.index ?? 0),
        attrs,
      },
    ];
  });
}

function readConversationTextParts(html: string): string[] {
  return Array.from(html.matchAll(/<(?:p|a)\b[^>]*>([\s\S]*?)<\/(?:p|a)>/gi))
    .map((match) => stripTags(match[1] ?? ''))
    .filter(Boolean);
}

const CONVERSATION_TIMESTAMP_PATTERN =
  /^(?:\d{4}-\d{2}-\d{2}T\d{2}:\d{2}:\d{2}(?:\.\d+)?Z|\d{4}[-/.年]\d{1,2}(?:[-/.月]\d{1,2}日?)?\s+\d{1,2}:\d{2}(?::\d{2})?)$/;

function isConversationTimestampText(value: string): boolean {
  return CONVERSATION_TIMESTAMP_PATTERN.test(value.trim());
}

function readConversationTimestamp(html: string, attrs: string): string | null {
  const timestampAttribute = readFirstAttribute(html, attrs, [
    'data-created-at',
    'data-sent-at',
    'data-timestamp',
  ]);
  if (timestampAttribute) return timestampAttribute.value;

  const timeTag = html.match(/<time\b([^>]*)>/i)?.[1] ?? '';
  const datetime = readAttr(timeTag, 'datetime');
  if (datetime) return datetime;

  return readConversationTextParts(html).find(isConversationTimestampText) ?? null;
}

function parseStableReceivedAt(value: string | null): Date | null {
  if (!value) return null;
  const parsed = new Date(value);
  return Number.isNaN(parsed.getTime()) ? null : parsed;
}

function readCandidateMessageOccurrences(
  html: string,
): Array<RenderedMessageOccurrence & { explicitlyUnread: boolean }> {
  const rows = findDirectionalConversationRows(html);
  const occurrences: Array<RenderedMessageOccurrence & { explicitlyUnread: boolean }> = [];
  for (const row of rows) {
    if (row.direction !== 'candidate') continue;
    const textParts = readConversationTextParts(row.html);
    const explicitMessageIdentity = readFirstAttribute(
      row.html,
      row.attrs,
      RENDERED_MESSAGE_ID_ATTRIBUTES,
    );
    const timestamp = readConversationTimestamp(row.html, row.attrs);
    const receivedAt = parseStableReceivedAt(timestamp);
    const content = textParts
      .filter((part) => !isConversationTimestampText(part))
      .join(' ')
      .trim();
    if (!content) continue;
    const unreadValue =
      readAttr(row.attrs, 'data-unread') ?? readAttr(row.attrs, 'data-is-unread') ?? '';
    occurrences.push({
      key: explicitMessageIdentity
        ? `detail-message\u001f${explicitMessageIdentity.name}:${explicitMessageIdentity.value}`
        : receivedAt
          ? ['candidate-occurrence', receivedAt.toISOString(), content].join('\u001f')
          : null,
      content,
      receivedAt,
      stableMessageOccurrenceId: explicitMessageIdentity
        ? `${explicitMessageIdentity.name}:${explicitMessageIdentity.value}`
        : null,
      explicitlyUnread: ['true', '1', 'unread'].includes(unreadValue.toLowerCase()),
    });
  }
  return occurrences;
}

function readUnreadCandidateMessageOccurrences(
  html: string,
  thread: RenderedThread,
): RenderedMessageOccurrence[] {
  if (findDirectionalConversationRows(html).at(-1)?.direction !== 'candidate') return [];

  const occurrences = readCandidateMessageOccurrences(html);
  const explicitlyUnread = occurrences.filter((occurrence) => occurrence.explicitlyUnread);
  const selectedWithUnread =
    explicitlyUnread.length > 0
      ? explicitlyUnread
      : thread.unreadCount > 0
        ? occurrences.slice(-thread.unreadCount)
        : occurrences
            .filter(
              (occurrence) =>
                normalizeMatchText(occurrence.content) === normalizeMatchText(thread.content),
            )
            .slice(-1);
  if (
    selectedWithUnread.length === 0 ||
    (thread.unreadCount > 0 && selectedWithUnread.length < thread.unreadCount) ||
    normalizeMatchText(selectedWithUnread.at(-1)?.content) !== normalizeMatchText(thread.content)
  ) {
    return [];
  }

  const selected: RenderedMessageOccurrence[] = selectedWithUnread.map((occurrence) => ({
    key: occurrence.key,
    content: occurrence.content,
    receivedAt: occurrence.receivedAt,
    stableMessageOccurrenceId: occurrence.stableMessageOccurrenceId,
  }));
  const latestIndex = selected.length - 1;
  const latest = selected[latestIndex];
  if (latest && thread.stableMessageOccurrenceId && !latest.stableMessageOccurrenceId) {
    selected[latestIndex] = {
      ...latest,
      stableMessageOccurrenceId: thread.stableMessageOccurrenceId,
    };
  }
  const identityKeys = selected.map((occurrence) =>
    occurrence.stableMessageOccurrenceId
      ? `message\u001f${occurrence.stableMessageOccurrenceId}`
      : occurrence.key,
  );
  if (identityKeys.some((identity): identity is null => identity === null)) return [];
  if (new Set(identityKeys).size !== identityKeys.length) {
    throw new Error('boss-like unread thread message identities collide');
  }
  return selected;
}

function readLastConversationMessageDirection(html: string): ConversationMessageDirection | null {
  return findDirectionalConversationRows(html).at(-1)?.direction ?? null;
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
  return omitCollidingRenderedMessages(
    extractRenderedThreads(messagesHtml)
      .filter((thread) => thread.unreadCount > 0)
      .flatMap((thread) => {
        const detailOccurrences = readUnreadCandidateMessageOccurrences(messagesHtml, thread);
        const rowOccurrence = createRowMessageOccurrence(thread);
        const occurrences =
          detailOccurrences.length > 1 || detailOccurrences.length >= thread.unreadCount
            ? detailOccurrences
            : thread.unreadCount === 1 && rowOccurrence
              ? [rowOccurrence]
              : [];
        return occurrences.map((occurrence) =>
          createMessageFromRenderedThread(thread, resumes, baseUrl, occurrence),
        );
      }),
  );
}

class BossLikeBrowserConversationReplyAdapter implements CandidateSourceAdapter {
  get platform() {
    return this.owner.platform;
  }

  constructor(
    private readonly owner: BossLikeCandidateCommunicationAdapter,
    private readonly message: UnreadCandidateMessage,
  ) {}

  getBrowserExecutor() {
    return this.owner.getBrowserExecutor();
  }

  async loginIfNeeded(): Promise<void> {
    await this.owner.loginIfNeeded();
  }

  async *searchCandidates() {
    return;
  }

  async enrichCandidate(candidate: RawCandidate): Promise<RawCandidate> {
    return candidate;
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
  private readonly messagePath: string;
  private readonly communicationResumePath: string;
  private readonly threadListSelector: string;
  private readonly replyInputSelector: string;
  private readonly sendButtonSelector: string;

  constructor(
    options: BossLikeCandidateSourceAdapterOptions & {
      messagePath?: string;
      communicationResumePath?: string;
      threadListSelector?: string;
      replyInputSelector?: string;
      sendButtonSelector?: string;
    },
  ) {
    super(options);
    this.messagePath = options.messagePath ?? '/employer/messages';
    this.communicationResumePath = options.communicationResumePath ?? '/employer/resumes';
    this.threadListSelector =
      options.threadListSelector ?? '[data-conversation-thread], [data-testid="message-thread"]';
    this.replyInputSelector = options.replyInputSelector ?? REPLY_TEXTAREA_SELECTOR;
    this.sendButtonSelector = options.sendButtonSelector ?? SEND_BUTTON_SELECTOR;
  }

  async listUnreadMessages(): Promise<UnreadCandidateMessage[]> {
    await this.loginIfNeeded();
    await this.openMessagesPage();
    const messagesHtml = await this.readRawSnapshot();
    const legacyMessages = extractBossLikeUnreadMessagesFromHtml(messagesHtml, this.baseUrl);
    if (legacyMessages.length > 0) return legacyMessages;
    const renderedThreads = extractRenderedThreads(messagesHtml);
    const inspectedThreads = await this.inspectRenderedThreads(renderedThreads, messagesHtml);

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
    return omitCollidingRenderedMessages(
      renderedThreads.flatMap((thread) => {
        const inspection = inspectedThreads.get(thread.rowIndex);
        if (!inspection) return [];
        const messages = inspection.occurrences.map((occurrence) =>
          createMessageFromRenderedThread(thread, resumes, this.baseUrl, occurrence),
        );
        if (messages.some((message) => message === null)) {
          throw new Error('boss-like unread thread has no stable identity for every message');
        }
        const completeMessages = messages as UnreadCandidateMessage[];
        const externalMessageIds = completeMessages.map((message) => message.externalMessageId);
        if (new Set(externalMessageIds).size !== externalMessageIds.length) {
          throw new Error('boss-like unread thread message identities are not unique');
        }
        return completeMessages;
      }),
    );
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
        selector: this.replyInputSelector,
        timeout: 5_000,
      });
      await this.fillSelector(this.replyInputSelector, text, 'fill chat message');
      await this.clickSelector(this.sendButtonSelector, 'send chat message');
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
      type: 'dom_exists',
      selector: this.threadListSelector,
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

  private async inspectRenderedThreads(
    threads: RenderedThread[],
    listHtml: string,
  ): Promise<Map<number, RenderedThreadInspection>> {
    const inspected = new Map<number, RenderedThreadInspection>();
    for (const thread of threads) {
      const visibleOccurrences = readUnreadCandidateMessageOccurrences(listHtml, thread);
      if (visibleOccurrences.length > 1) {
        inspected.set(thread.rowIndex, { occurrences: visibleOccurrences });
        continue;
      }
      const rowOccurrence = createRowMessageOccurrence(thread);
      if (thread.unreadCount === 1 && rowOccurrence) {
        inspected.set(thread.rowIndex, { occurrences: [rowOccurrence] });
        continue;
      }
      try {
        await this.clickSelector(thread.selector, 'inspect conversation');
        await this.waitForConversationDetail(thread);
        const detailHtml = await this.readRawSnapshot();
        if (readLastConversationMessageDirection(detailHtml) !== 'candidate') continue;
        const occurrences = readUnreadCandidateMessageOccurrences(detailHtml, thread);
        if (thread.unreadCount > 0 && occurrences.length < thread.unreadCount) {
          throw new Error(
            `boss-like unread thread exposed ${occurrences.length} of ${thread.unreadCount} messages`,
          );
        }
        if (occurrences.length > 0) inspected.set(thread.rowIndex, { occurrences });
      } catch (error) {
        if (thread.unreadCount > 1) throw error;
        continue;
      }
    }
    return inspected;
  }

  private async waitForConversationDetail(thread: RenderedThread): Promise<void> {
    const detailHeaderSelector = thread.platformJobTitle
      ? [
          'div.flex-1.flex.flex-col > div[class*="border-b"]',
          createHasTextClause(thread.username),
          createHasTextClause(thread.platformJobTitle),
        ].join('')
      : `div.flex-1.flex.flex-col h3${createHasTextClause(thread.username)}`;
    const hasExpectedHeader = await this.executor.check({
      type: 'dom_exists',
      selector: detailHeaderSelector,
      timeout: 2_000,
    });
    if (!hasExpectedHeader) {
      throw new Error('boss-like conversation detail header did not match the selected thread');
    }
    const hasExpectedMessage = await this.executor.check({
      type: 'dom_exists',
      selector: `div.flex-1.flex.flex-col div[class*="overflow-y-auto"]${createHasTextClause(
        thread.content,
      )}`,
      timeout: 2_000,
    });
    if (!hasExpectedMessage) {
      throw new Error('boss-like conversation detail did not contain the selected message');
    }
  }

  private communicationResumeListUrl(): string {
    return new URL(this.communicationResumePath, `${this.baseUrl.replace(/\/+$/, '')}/`).toString();
  }

  private unreadMessageUrl(): string {
    return new URL(this.messagePath, `${this.baseUrl.replace(/\/+$/, '')}/`).toString();
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
