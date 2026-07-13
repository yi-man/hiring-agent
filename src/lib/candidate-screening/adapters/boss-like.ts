import type {
  BrowserExecutor,
  BrowserStepResult,
  BrowserTargetInput,
  StructuredDomSnapshot,
} from '@/lib/browser/types';
import type { RawCandidate } from '../ingest';
import type { CandidateActionPlan, CandidateScreeningPlatform, SearchPlan } from '../types';
import type { BossLikeScreeningTargets } from '../workflow/types';
import type {
  ActionExecutionResult,
  CandidateBrowserActionOptions,
  CandidateSourceAdapter,
  RawCandidateBatch,
  SearchOptions,
  StoredCandidateRef,
} from './types';
import { CandidateAdapterTargetError } from './types';

const DEFAULT_BOSS_LIKE_BASE_URL = 'http://localhost:6183';
const DEFAULT_BOSS_LIKE_USERNAME = 'admin';
const DEFAULT_BOSS_LIKE_PASSWORD = 'boss123';
const SHORT_RESUME_TEXT_MIN_LENGTH = 20;
const RAW_SNAPSHOT_REQUIRED_ERROR = 'boss-like candidate search requires raw browser snapshots';
const EMPTY_RAW_SNAPSHOT_ERROR = 'boss-like candidate search returned an empty browser snapshot';
const INVALID_PROFILE_URL_ERROR =
  'invalid candidate profileUrl: expected a same-origin boss-like numeric resume URL';

type BossLikeCandidateSourceAdapterOptions = {
  executor: BrowserExecutor;
  baseUrl?: string;
  username?: string;
  password?: string;
};

type BossLikeCredentials = {
  username: string;
  password: string;
};

export type BossLikeProfileUrlResolution = {
  profileUrl: string | null;
  error?: string;
};

function allowsLocalBossLikeDefaults(): boolean {
  return (
    process.env.NODE_ENV === 'test' ||
    process.env.NODE_ENV === 'development' ||
    process.env.BOSS_LIKE_ALLOW_LOCAL_DEFAULTS === 'true'
  );
}

function readBossLikeConfig(name: string, localDefault: string): string {
  const value = process.env[name];
  if (value?.trim()) return value;
  if (allowsLocalBossLikeDefaults()) return localDefault;
  throw new Error(`${name} is required outside local test runtimes`);
}

function normalizeBaseUrl(baseUrl: string): string {
  return baseUrl.replace(/\/+$/, '');
}

function asErrorMessage(error: unknown): string {
  return error instanceof Error ? error.message : String(error);
}

function isSuccessfulStep(result: BrowserStepResult): boolean {
  return result.success;
}

async function requireSuccessfulStep(
  result: Promise<BrowserStepResult>,
  action: string,
  targetFailure?: {
    target: BrowserTargetInput;
    targetKey: keyof BossLikeScreeningTargets;
  },
): Promise<BrowserStepResult> {
  const stepResult = await result;
  if (!isSuccessfulStep(stepResult)) {
    if (targetFailure) {
      throw new CandidateAdapterTargetError({
        result: stepResult,
        target: targetFailure.target,
        targetKey: targetFailure.targetKey,
      });
    }
    throw new Error(stepResult.error ?? `${action} failed`);
  }
  return stepResult;
}

function actionFailure(params: {
  error: unknown;
  browserTrace: Record<string, unknown>;
}): ActionExecutionResult {
  return {
    success: false,
    error: asErrorMessage(params.error),
    browserTrace: params.browserTrace,
    ...(params.error instanceof CandidateAdapterTargetError ? { targetError: params.error } : {}),
  };
}

async function readStructuredSnapshotBestEffort(
  executor: BrowserExecutor,
): Promise<StructuredDomSnapshot | null> {
  try {
    return (await executor.snapshotStructured?.()) ?? null;
  } catch {
    return null;
  }
}

function isLoginSnapshot(html: string | null): boolean {
  if (!html) return false;
  return /登录|login|用户名|密码|password/i.test(html) && !/<article\b/i.test(html);
}

export function hasShortResumeText(candidate: RawCandidate): boolean {
  return candidate.resumeText.trim().length < SHORT_RESUME_TEXT_MIN_LENGTH;
}

function createCandidateKey(candidate: RawCandidate): string {
  return (
    candidate.platformCandidateId?.trim() ||
    candidate.profileUrl?.trim() ||
    `${candidate.name.trim()}::${candidate.company?.trim() ?? ''}::${candidate.title?.trim() ?? ''}`
  );
}

function firstNonEmpty(value: string | null | undefined, fallback: string | null | undefined) {
  const trimmed = value?.trim();
  if (trimmed) return trimmed;
  return fallback ?? null;
}

function mergeCandidateWithDetail(candidate: RawCandidate, detail: RawCandidate): RawCandidate {
  return {
    platformCandidateId: firstNonEmpty(detail.platformCandidateId, candidate.platformCandidateId),
    profileUrl: firstNonEmpty(detail.profileUrl, candidate.profileUrl),
    name: firstNonEmpty(detail.name, candidate.name) ?? candidate.name,
    title: firstNonEmpty(detail.title, candidate.title),
    company: firstNonEmpty(detail.company, candidate.company),
    location: firstNonEmpty(detail.location, candidate.location),
    experienceYears: detail.experienceYears ?? candidate.experienceYears ?? null,
    resumeText: firstNonEmpty(detail.resumeText, candidate.resumeText) ?? candidate.resumeText,
    lastActiveAt: firstNonEmpty(detail.lastActiveAt, candidate.lastActiveAt),
  };
}

function normalizeKeywords(values: string[]): string[] {
  const seen = new Set<string>();
  const keywords: string[] = [];

  for (const value of values) {
    const keyword = value.trim();
    if (!keyword || seen.has(keyword)) continue;
    seen.add(keyword);
    keywords.push(keyword);
  }

  return keywords;
}

function createSearchKeywords(plan: SearchPlan): string[] {
  const keywords = normalizeKeywords(plan.keywords);
  return keywords.length > 0 ? keywords : normalizeKeywords([plan.retrievalQuery]);
}

export function resolveBossLikeProfileUrl(
  profileUrl: string | null | undefined,
  baseUrl: string,
): BossLikeProfileUrlResolution {
  const trimmed = profileUrl?.trim();
  if (!trimmed) return { profileUrl: null };

  try {
    const normalizedBaseUrl = normalizeBaseUrl(baseUrl);
    const resolvedUrl = new URL(trimmed, `${normalizedBaseUrl}/`);
    const parsedBaseUrl = new URL(normalizedBaseUrl);
    const isHttpUrl = resolvedUrl.protocol === 'http:' || resolvedUrl.protocol === 'https:';
    const isSameOrigin = resolvedUrl.origin === parsedBaseUrl.origin;
    const hasCandidateDetailSegment = /^\/employer\/resumes\/\d+\/?$/.test(resolvedUrl.pathname);

    if (!isHttpUrl || !isSameOrigin || !hasCandidateDetailSegment) {
      return { profileUrl: null, error: INVALID_PROFILE_URL_ERROR };
    }

    return { profileUrl: resolvedUrl.toString() };
  } catch {
    return { profileUrl: null, error: INVALID_PROFILE_URL_ERROR };
  }
}

export function extractBossLikeCandidatesFromHtml(html: string): RawCandidate[] {
  return Array.from(html.matchAll(/<article\b([\s\S]*?)<\/article>/gi)).map((match) => {
    const article = match[0];
    const attrs = match[1] ?? '';
    const readAttr = (name: string) =>
      attrs.match(new RegExp(`${name}="([^"]+)"`, 'i'))?.[1]?.trim() ?? null;
    const readTag = (tag: string) =>
      article
        .match(new RegExp(`<${tag}[^>]*>([\\s\\S]*?)<\\/${tag}>`, 'i'))?.[1]
        ?.replace(/<[^>]+>/g, '')
        .trim() ?? '';
    const readField = (field: string) =>
      article
        .match(new RegExp(`<[^>]+data-field="${field}"[^>]*>([\\s\\S]*?)<\\/[^>]+>`, 'i'))?.[1]
        ?.replace(/<[^>]+>/g, '')
        .trim() ?? '';
    const experienceText = readField('experience');
    const years = Number(experienceText.match(/\d+(?:\.\d+)?/)?.[0] ?? Number.NaN);
    return {
      platformCandidateId: readAttr('data-candidate-id'),
      profileUrl: readAttr('data-profile-url'),
      name: readTag('h2'),
      title: readField('title'),
      company: readField('company'),
      experienceYears: Number.isFinite(years) ? years : null,
      resumeText: readField('resume'),
    };
  });
}

export class BossLikeCandidateSourceAdapter implements CandidateSourceAdapter {
  readonly platform: CandidateScreeningPlatform = 'boss-like';
  protected readonly executor: BrowserExecutor;
  protected readonly baseUrl: string;
  protected readonly credentials: BossLikeCredentials;

  constructor(options: BossLikeCandidateSourceAdapterOptions) {
    this.executor = options.executor;
    this.baseUrl = normalizeBaseUrl(
      options.baseUrl ?? readBossLikeConfig('BOSS_LIKE_BASE_URL', DEFAULT_BOSS_LIKE_BASE_URL),
    );
    this.credentials = {
      username:
        options.username ??
        readBossLikeConfig('BOSS_LIKE_EMPLOYER_USERNAME', DEFAULT_BOSS_LIKE_USERNAME),
      password:
        options.password ??
        readBossLikeConfig('BOSS_LIKE_EMPLOYER_PASSWORD', DEFAULT_BOSS_LIKE_PASSWORD),
    };
  }

  getBrowserExecutor(): BrowserExecutor {
    return this.executor;
  }

  getWorkflowExploreContext() {
    return {
      baseUrl: this.baseUrl,
      credentials: {
        username: this.credentials.username,
        password: this.credentials.password,
      },
    };
  }

  async loginIfNeeded(options?: CandidateBrowserActionOptions): Promise<void> {
    await requireSuccessfulStep(this.executor.navigate(this.resumeListUrl()), 'open resume list');

    const snapshot = (await this.executor.snapshot?.()) ?? null;
    const structuredSnapshot = await readStructuredSnapshotBestEffort(this.executor);
    const isLoginPage = structuredSnapshot
      ? structuredSnapshot.pageState === 'login' || structuredSnapshot.url.includes('/login')
      : isLoginSnapshot(snapshot);

    if (!isLoginPage) return;

    const usernameTarget = this.targetFor(options, 'username', '用户名');
    await requireSuccessfulStep(
      this.executor.fill(usernameTarget, this.credentials.username),
      'fill username',
      {
        target: usernameTarget,
        targetKey: 'username',
      },
    );
    const passwordTarget = this.targetFor(options, 'password', '密码');
    await requireSuccessfulStep(
      this.executor.fill(passwordTarget, this.credentials.password),
      'fill password',
      {
        target: passwordTarget,
        targetKey: 'password',
      },
    );
    const loginButtonTarget = this.targetFor(options, 'loginButton', '登录');
    await requireSuccessfulStep(this.executor.click(loginButtonTarget), 'submit login', {
      target: loginButtonTarget,
      targetKey: 'loginButton',
    });
    await requireSuccessfulStep(
      this.executor.waitForUrl(this.resumeListUrl()),
      'wait for resume list',
    );
  }

  async *searchCandidates(
    plan: SearchPlan,
    options: SearchOptions,
    workflow?: CandidateBrowserActionOptions,
  ): AsyncIterable<RawCandidateBatch> {
    const seen = new Set<string>();
    const keywords = createSearchKeywords(plan);
    const maxCandidates = Math.max(0, options.maxCandidates);
    const batchSize = Math.max(1, options.batchSize);
    let emittedCount = 0;
    let batch: RawCandidate[] = [];

    for (const keyword of keywords) {
      if (emittedCount >= maxCandidates) break;

      await requireSuccessfulStep(this.executor.navigate(this.resumeListUrl()), 'open resume list');
      const searchInputTarget = this.targetFor(workflow, 'searchInput', '搜索候选人');
      await requireSuccessfulStep(
        this.executor.fill(searchInputTarget, keyword),
        'fill search keyword',
        { target: searchInputTarget, targetKey: 'searchInput' },
      );
      const searchSubmitTarget = this.targetFor(workflow, 'searchSubmit', '搜索');
      await requireSuccessfulStep(
        this.executor.click(searchSubmitTarget),
        'submit candidate search',
        { target: searchSubmitTarget, targetKey: 'searchSubmit' },
      );
      await this.waitForResumeContent();

      const html = await this.readRawSnapshotForSearch();
      const candidates = extractBossLikeCandidatesFromHtml(html);

      for (const candidate of candidates) {
        if (emittedCount >= maxCandidates) break;

        const key = createCandidateKey(candidate);
        if (seen.has(key)) continue;
        seen.add(key);

        const candidateForBatch = options.deferEnrichment
          ? candidate
          : await this.enrichCandidate(candidate, workflow);
        batch.push(candidateForBatch);
        emittedCount += 1;

        if (batch.length >= batchSize) {
          yield { candidates: batch, cursor: String(emittedCount) };
          batch = [];
        }
      }
    }

    if (batch.length > 0) {
      yield { candidates: batch, cursor: String(emittedCount) };
    }
  }

  async enrichCandidate(
    candidate: RawCandidate,
    options?: CandidateBrowserActionOptions,
  ): Promise<RawCandidate> {
    if (!hasShortResumeText(candidate)) return candidate;

    const profileUrlResolution = this.resolveProfileUrl(candidate.profileUrl);
    if (!profileUrlResolution.profileUrl) return candidate;

    await requireSuccessfulStep(
      this.executor.navigate(profileUrlResolution.profileUrl),
      'open candidate detail',
    );
    await this.waitForDetailContent(options);
    const detailHtml = await this.readRawSnapshotForSearch();
    const detailCandidates = extractBossLikeCandidatesFromHtml(detailHtml);
    const detailCandidate =
      detailCandidates.find(
        (detail) =>
          detail.platformCandidateId === candidate.platformCandidateId ||
          detail.profileUrl === candidate.profileUrl,
      ) ?? detailCandidates[0];

    return detailCandidate ? mergeCandidateWithDetail(candidate, detailCandidate) : candidate;
  }

  async collectCandidate(
    candidate: StoredCandidateRef,
    options?: CandidateBrowserActionOptions,
  ): Promise<ActionExecutionResult> {
    const profileUrlResolution = this.resolveProfileUrl(candidate.profileUrl);
    const browserTrace = {
      action: 'collect',
      candidateId: candidate.candidateId,
      displayName: candidate.displayName,
      profileUrl: profileUrlResolution.profileUrl,
    };

    if (!profileUrlResolution.profileUrl) {
      return {
        success: false,
        error: profileUrlResolution.error ?? 'candidate profileUrl is required to collect',
        browserTrace,
      };
    }

    try {
      await requireSuccessfulStep(
        this.executor.navigate(profileUrlResolution.profileUrl),
        'open candidate profile',
      );
      const collectButtonTarget = this.targetFor(options, 'collectButton', '收藏');
      await requireSuccessfulStep(this.executor.click(collectButtonTarget), 'collect candidate', {
        target: collectButtonTarget,
        targetKey: 'collectButton',
      });
      return { success: true, browserTrace };
    } catch (error) {
      return actionFailure({ error, browserTrace });
    }
  }

  async chatCandidate(
    candidate: StoredCandidateRef,
    plan: CandidateActionPlan,
    options?: CandidateBrowserActionOptions,
  ): Promise<ActionExecutionResult> {
    const profileUrlResolution = this.resolveProfileUrl(candidate.profileUrl);
    const message = plan.message?.trim();
    const browserTrace = {
      action: 'chat',
      candidateId: candidate.candidateId,
      displayName: candidate.displayName,
      profileUrl: profileUrlResolution.profileUrl,
    };

    if (!profileUrlResolution.profileUrl) {
      return {
        success: false,
        error: profileUrlResolution.error ?? 'candidate profileUrl is required to chat',
        browserTrace,
      };
    }
    if (!message) {
      return {
        success: false,
        error: 'chat message is required',
        browserTrace,
      };
    }

    try {
      await requireSuccessfulStep(
        this.executor.navigate(profileUrlResolution.profileUrl),
        'open candidate profile',
      );
      const greetButtonTarget = this.targetFor(options, 'greetButton', '打招呼');
      await requireSuccessfulStep(this.executor.click(greetButtonTarget), 'open chat composer', {
        target: greetButtonTarget,
        targetKey: 'greetButton',
      });
      const messageInputTarget = this.targetFor(options, 'messageInput', '消息');
      await requireSuccessfulStep(
        this.executor.fill(messageInputTarget, message),
        'fill chat message',
        {
          target: messageInputTarget,
          targetKey: 'messageInput',
        },
      );
      const sendButtonTarget = this.targetFor(options, 'sendButton', '发送');
      await requireSuccessfulStep(this.executor.click(sendButtonTarget), 'send chat message', {
        target: sendButtonTarget,
        targetKey: 'sendButton',
      });
      return { success: true, browserTrace: { ...browserTrace, messageLength: message.length } };
    } catch (error) {
      return actionFailure({ error, browserTrace });
    }
  }

  async close(): Promise<void> {
    await this.executor.close?.();
  }

  private resumeListUrl(): string {
    return `${this.baseUrl}/employer/resumes`;
  }

  private resolveProfileUrl(profileUrl?: string | null): BossLikeProfileUrlResolution {
    return resolveBossLikeProfileUrl(profileUrl, this.baseUrl);
  }

  private targetFor(
    options: CandidateBrowserActionOptions | undefined,
    key: keyof BossLikeScreeningTargets,
    fallback: string,
  ) {
    return options?.targets?.[key] ?? fallback;
  }

  private async waitForResumeContent(): Promise<void> {
    const hasCandidateCards = await this.executor.check({
      type: 'dom_exists',
      selector: 'article[data-candidate-id]',
      timeout: 5_000,
    });
    if (hasCandidateCards) {
      return;
    }

    const hasResumeText = await this.executor.check({
      type: 'text_contains',
      text: '简历',
      timeout: 5_000,
    });
    if (!hasResumeText) {
      throw new Error('resume content was not visible');
    }
  }

  private async readRawSnapshotForSearch(): Promise<string> {
    if (!this.executor.snapshot) {
      throw new Error(RAW_SNAPSHOT_REQUIRED_ERROR);
    }
    const html = await this.executor.snapshot();
    if (!html.trim()) {
      throw new Error(EMPTY_RAW_SNAPSHOT_ERROR);
    }
    return html;
  }

  private async waitForDetailContent(options?: CandidateBrowserActionOptions): Promise<void> {
    const target = this.targetFor(options, 'detailContent', '候选人详情');
    if (this.executor.waitForTarget) {
      await requireSuccessfulStep(
        this.executor.waitForTarget(target),
        'wait for candidate detail',
        {
          target,
          targetKey: 'detailContent',
        },
      );
      return;
    }
    if (!this.executor.waitForText) return;
    const text = typeof target === 'string' ? target : target.name;
    await requireSuccessfulStep(this.executor.waitForText(text), 'wait for candidate detail', {
      target,
      targetKey: 'detailContent',
    });
  }
}
