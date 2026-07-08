import type {
  BrowserExecutor,
  BrowserStepResult,
  StructuredDomSnapshot,
} from '@/lib/browser/types';
import type { RawCandidate } from '../ingest';
import type { CandidateActionPlan, CandidateScreeningPlatform, SearchPlan } from '../types';
import type {
  ActionExecutionResult,
  CandidateSourceAdapter,
  RawCandidateBatch,
  SearchOptions,
  StoredCandidateRef,
} from './types';

const DEFAULT_BOSS_LIKE_BASE_URL = 'http://localhost:6183';
const DEFAULT_BOSS_LIKE_USERNAME = 'admin';
const DEFAULT_BOSS_LIKE_PASSWORD = 'boss123';
const SHORT_RESUME_TEXT_MIN_LENGTH = 20;
const RAW_SNAPSHOT_REQUIRED_ERROR = 'boss-like candidate search requires raw browser snapshots';
const EMPTY_RAW_SNAPSHOT_ERROR = 'boss-like candidate search returned an empty browser snapshot';
const INVALID_PROFILE_URL_ERROR =
  'invalid candidate profileUrl: expected a same-origin boss-like resume URL';

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

type ProfileUrlResolution = {
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
): Promise<BrowserStepResult> {
  const stepResult = await result;
  if (!isSuccessfulStep(stepResult)) {
    throw new Error(stepResult.error ?? `${action} failed`);
  }
  return stepResult;
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

function hasShortResumeText(candidate: RawCandidate): boolean {
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

  async loginIfNeeded(): Promise<void> {
    await requireSuccessfulStep(this.executor.navigate(this.resumeListUrl()), 'open resume list');

    const snapshot = (await this.executor.snapshot?.()) ?? null;
    const structuredSnapshot = await readStructuredSnapshotBestEffort(this.executor);
    const isLoginPage = structuredSnapshot
      ? structuredSnapshot.pageState === 'login' || structuredSnapshot.url.includes('/login')
      : isLoginSnapshot(snapshot);

    if (!isLoginPage) return;

    await requireSuccessfulStep(
      this.executor.fill('用户名', this.credentials.username),
      'fill username',
    );
    await requireSuccessfulStep(
      this.executor.fill('密码', this.credentials.password),
      'fill password',
    );
    await requireSuccessfulStep(this.executor.click('登录'), 'submit login');
    await requireSuccessfulStep(
      this.executor.waitForUrl(this.resumeListUrl()),
      'wait for resume list',
    );
  }

  async *searchCandidates(
    plan: SearchPlan,
    options: SearchOptions,
  ): AsyncIterable<RawCandidateBatch> {
    await this.loginIfNeeded();

    const seen = new Set<string>();
    const keywords = createSearchKeywords(plan);
    const maxCandidates = Math.max(0, options.maxCandidates);
    const batchSize = Math.max(1, options.batchSize);
    let emittedCount = 0;
    let batch: RawCandidate[] = [];

    for (const keyword of keywords) {
      if (emittedCount >= maxCandidates) break;

      await requireSuccessfulStep(this.executor.navigate(this.resumeListUrl()), 'open resume list');
      await requireSuccessfulStep(this.executor.fill('搜索候选人', keyword), 'fill search keyword');
      await requireSuccessfulStep(this.executor.click('搜索'), 'submit candidate search');
      await this.waitForResumeContent();

      const html = await this.readRawSnapshotForSearch();
      const candidates = extractBossLikeCandidatesFromHtml(html);

      for (const candidate of candidates) {
        if (emittedCount >= maxCandidates) break;

        const key = createCandidateKey(candidate);
        if (seen.has(key)) continue;
        seen.add(key);

        const enrichedCandidate = await this.enrichCandidateWhenNeeded(candidate);
        batch.push(enrichedCandidate);
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

  async collectCandidate(candidate: StoredCandidateRef): Promise<ActionExecutionResult> {
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
      await requireSuccessfulStep(this.executor.click('收藏'), 'collect candidate');
      return { success: true, browserTrace };
    } catch (error) {
      return { success: false, error: asErrorMessage(error), browserTrace };
    }
  }

  async chatCandidate(
    candidate: StoredCandidateRef,
    plan: CandidateActionPlan,
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
      await requireSuccessfulStep(this.executor.click('打招呼'), 'open chat composer');
      await requireSuccessfulStep(this.executor.fill('消息', message), 'fill chat message');
      await requireSuccessfulStep(this.executor.click('发送'), 'send chat message');
      return { success: true, browserTrace: { ...browserTrace, messageLength: message.length } };
    } catch (error) {
      return { success: false, error: asErrorMessage(error), browserTrace };
    }
  }

  async close(): Promise<void> {
    await this.executor.close?.();
  }

  private resumeListUrl(): string {
    return `${this.baseUrl}/employer/resumes`;
  }

  private resolveProfileUrl(profileUrl?: string | null): ProfileUrlResolution {
    const trimmed = profileUrl?.trim();
    if (!trimmed) return { profileUrl: null };

    try {
      const resolvedUrl = new URL(trimmed, `${this.baseUrl}/`);
      const baseUrl = new URL(this.baseUrl);
      const isHttpUrl = resolvedUrl.protocol === 'http:' || resolvedUrl.protocol === 'https:';
      const isSameOrigin = resolvedUrl.origin === baseUrl.origin;
      const resumePathPrefix = '/employer/resumes/';
      const hasCandidateDetailSegment =
        resolvedUrl.pathname.startsWith(resumePathPrefix) &&
        resolvedUrl.pathname.slice(resumePathPrefix.length).length > 0;

      if (!isHttpUrl || !isSameOrigin || !hasCandidateDetailSegment) {
        return { profileUrl: null, error: INVALID_PROFILE_URL_ERROR };
      }

      return { profileUrl: resolvedUrl.toString() };
    } catch {
      return { profileUrl: null, error: INVALID_PROFILE_URL_ERROR };
    }
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

  private async enrichCandidateWhenNeeded(candidate: RawCandidate): Promise<RawCandidate> {
    if (!hasShortResumeText(candidate)) return candidate;

    const profileUrlResolution = this.resolveProfileUrl(candidate.profileUrl);
    if (!profileUrlResolution.profileUrl) return candidate;

    await requireSuccessfulStep(
      this.executor.navigate(profileUrlResolution.profileUrl),
      'open candidate detail',
    );
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
}
