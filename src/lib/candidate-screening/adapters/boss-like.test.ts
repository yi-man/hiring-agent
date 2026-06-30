/**
 * @jest-environment node
 */
import type {
  BrowserExecutor,
  BrowserStepResult,
  BrowserTargetInput,
  PublishStepCheck,
  StructuredDomSnapshot,
} from '@/lib/jd-publishing/types';
import { createBrowserExecutorFromEnv } from '@/lib/jd-publishing/executors/browser-executor-factory';
import { BossLikeCandidateSourceAdapter, extractBossLikeCandidatesFromHtml } from './boss-like';
import { createCandidateSourceAdapter } from './factory';
import type { RawCandidateBatch } from './types';
import type { CandidateActionPlan, SearchPlan } from '../types';

jest.mock('@/lib/jd-publishing/executors/browser-executor-factory', () => ({
  createBrowserExecutorFromEnv: jest.fn(),
}));

const createBrowserExecutorFromEnvMock = createBrowserExecutorFromEnv as jest.MockedFunction<
  typeof createBrowserExecutorFromEnv
>;

const resumeListFixture = `
<article data-candidate-id="boss-1" data-profile-url="/employer/resumes/boss-1">
  <h2>王小明</h2>
  <p data-field="title">高级后端工程师</p>
  <p data-field="company">星河智能</p>
  <p data-field="experience">5年</p>
  <p data-field="resume">Java Spring Boot 高并发 微服务</p>
  <button>收藏</button>
  <button>打招呼</button>
</article>
`;

const shortResumeListFixture = `
<article data-candidate-id="boss-1" data-profile-url="/employer/resumes/boss-1">
  <h2>王小明</h2>
  <p data-field="title">高级后端工程师</p>
  <p data-field="company">星河智能</p>
  <p data-field="experience">5年</p>
  <p data-field="resume">Java</p>
  <button>收藏</button>
  <button>打招呼</button>
</article>
`;

const detailFixture = `
<article data-candidate-id="boss-1" data-profile-url="/employer/resumes/boss-1">
  <h2>王小明</h2>
  <p data-field="title">高级后端工程师</p>
  <p data-field="company">星河智能</p>
  <p data-field="experience">5年</p>
  <p data-field="resume">Java Spring Boot 高并发 微服务 分布式 系统设计</p>
</article>
`;

const secondResumeListFixture = `
<article data-candidate-id="boss-2" data-profile-url="/employer/resumes/boss-2">
  <h2>李小红</h2>
  <p data-field="title">Node.js 后端工程师</p>
  <p data-field="company">云帆科技</p>
  <p data-field="experience">4年</p>
  <p data-field="resume">Node.js NestJS PostgreSQL Redis 系统设计</p>
  <button>收藏</button>
  <button>打招呼</button>
</article>
`;

const searchPlan: SearchPlan = {
  keywords: ['Java'],
  filters: {},
  priorityTags: [],
  retrievalQuery: 'Java 后端 微服务',
};

const chatPlan: CandidateActionPlan = {
  action: 'chat',
  priority: 'high',
  message: '你好，我们正在招聘高级后端工程师，方便聊聊吗？',
  reason: '技能匹配度高',
};

const unsafeProfileUrls = [
  'http://[',
  'https://evil.example.com/employer/resumes/boss-1',
  'javascript:alert(1)',
  '/employer/resumes',
  '/employer/resumes/',
  '/employer/jobs/new',
];

const originalEnv = { ...process.env };
const originalNodeEnv = process.env.NODE_ENV;

function restoreEnv(name: string): void {
  const value = originalEnv[name];
  if (typeof value === 'undefined') {
    delete process.env[name];
    return;
  }
  process.env[name] = value;
}

function setNodeEnv(value: string | undefined): void {
  if (typeof value === 'undefined') {
    delete (process.env as { NODE_ENV?: string }).NODE_ENV;
    return;
  }
  (process.env as { NODE_ENV?: string }).NODE_ENV = value;
}

function targetName(target: BrowserTargetInput): string {
  return typeof target === 'string' ? target : target.name;
}

class FakeBrowserExecutor implements BrowserExecutor {
  readonly calls: string[] = [];
  private readonly snapshots: string[];

  constructor(snapshots: string[] = []) {
    this.snapshots = [...snapshots];
  }

  clearCalls(): void {
    this.calls.length = 0;
  }

  async navigate(url: string): Promise<BrowserStepResult> {
    this.calls.push(`navigate:${url}`);
    return { success: true };
  }

  async fill(target: BrowserTargetInput, value: string): Promise<BrowserStepResult> {
    this.calls.push(`fill:${targetName(target)}:${value}`);
    return { success: true };
  }

  async click(target: BrowserTargetInput): Promise<BrowserStepResult> {
    this.calls.push(`click:${targetName(target)}`);
    return { success: true };
  }

  async waitForUrl(url: string): Promise<BrowserStepResult> {
    this.calls.push(`waitForUrl:${url}`);
    return { success: true };
  }

  async check(check: PublishStepCheck): Promise<boolean> {
    this.calls.push(`check:${check.id ?? check.text ?? check.selector ?? ''}`);
    return true;
  }

  async waitForText(text: string): Promise<BrowserStepResult> {
    this.calls.push(`waitForText:${text}`);
    return { success: true };
  }

  async snapshot(): Promise<string> {
    this.calls.push('snapshot');
    return this.snapshots.shift() ?? '<main>候选人列表</main>';
  }

  async close(): Promise<void> {
    this.calls.push('close');
  }
}

class StructuredSnapshotFailureExecutor extends FakeBrowserExecutor {
  async snapshotStructured(): Promise<StructuredDomSnapshot> {
    this.calls.push('snapshotStructured');
    throw new Error('structured snapshot unavailable');
  }
}

class StructuredResumeListExecutor extends FakeBrowserExecutor {
  async snapshotStructured(): Promise<StructuredDomSnapshot> {
    this.calls.push('snapshotStructured');
    return {
      url: 'http://localhost:6183/employer/resumes',
      title: 'Boss Like',
      pageState: 'list',
      headings: [],
      forms: [],
      links: [],
      textBlocks: [],
    };
  }
}

class AmbiguousResumeTextExecutor extends FakeBrowserExecutor {
  async waitForText(text: string): Promise<BrowserStepResult> {
    this.calls.push(`waitForText:${text}`);
    return {
      success: false,
      error: 'ambiguous_target: Multiple candidates matched text "简历"',
    };
  }
}

class EmptyThenResultExecutor extends FakeBrowserExecutor {
  private cardChecks = 0;

  async check(check: PublishStepCheck): Promise<boolean> {
    this.calls.push(`check:${check.id ?? check.text ?? check.selector ?? ''}`);
    if (check.type === 'dom_exists' && check.selector === 'article[data-candidate-id]') {
      this.cardChecks += 1;
      return this.cardChecks > 1;
    }
    return true;
  }
}

function createSnapshotlessExecutor(): BrowserExecutor & { calls: string[] } {
  const calls: string[] = [];
  return {
    calls,
    async navigate(url: string): Promise<BrowserStepResult> {
      calls.push(`navigate:${url}`);
      return { success: true };
    },
    async fill(target: BrowserTargetInput, value: string): Promise<BrowserStepResult> {
      calls.push(`fill:${targetName(target)}:${value}`);
      return { success: true };
    },
    async click(target: BrowserTargetInput): Promise<BrowserStepResult> {
      calls.push(`click:${targetName(target)}`);
      return { success: true };
    },
    async waitForUrl(url: string): Promise<BrowserStepResult> {
      calls.push(`waitForUrl:${url}`);
      return { success: true };
    },
    async check(check: PublishStepCheck): Promise<boolean> {
      calls.push(`check:${check.id ?? check.text ?? check.selector ?? ''}`);
      return true;
    },
    async waitForText(text: string): Promise<BrowserStepResult> {
      calls.push(`waitForText:${text}`);
      return { success: true };
    },
    async close(): Promise<void> {
      calls.push('close');
    },
  };
}

async function collectAsyncBatches(
  batches: AsyncIterable<RawCandidateBatch>,
): Promise<RawCandidateBatch[]> {
  const collected: RawCandidateBatch[] = [];
  for await (const batch of batches) {
    collected.push(batch);
  }
  return collected;
}

describe('BossLikeCandidateSourceAdapter', () => {
  beforeEach(() => {
    jest.resetAllMocks();
    setNodeEnv('test');
    restoreEnv('BOSS_LIKE_BASE_URL');
    restoreEnv('BOSS_LIKE_EMPLOYER_USERNAME');
    restoreEnv('BOSS_LIKE_EMPLOYER_PASSWORD');
    restoreEnv('BOSS_LIKE_ALLOW_LOCAL_DEFAULTS');
  });

  afterAll(() => {
    setNodeEnv(originalNodeEnv);
    restoreEnv('BOSS_LIKE_BASE_URL');
    restoreEnv('BOSS_LIKE_EMPLOYER_USERNAME');
    restoreEnv('BOSS_LIKE_EMPLOYER_PASSWORD');
    restoreEnv('BOSS_LIKE_ALLOW_LOCAL_DEFAULTS');
  });

  it('logs in and opens the resume list page with local defaults', async () => {
    const executor = new FakeBrowserExecutor(['<main>登录</main>']);
    const adapter = new BossLikeCandidateSourceAdapter({ executor });

    await adapter.loginIfNeeded();

    expect(executor.calls).toEqual([
      'navigate:http://localhost:6183/employer/resumes',
      'snapshot',
      'fill:用户名:admin',
      'fill:密码:boss123',
      'click:登录',
      'waitForUrl:http://localhost:6183/employer/resumes',
    ]);
  });

  it('keeps structured snapshot failures best-effort during login detection', async () => {
    const executor = new StructuredSnapshotFailureExecutor(['<main>候选人列表</main>']);
    const adapter = new BossLikeCandidateSourceAdapter({ executor });

    await expect(adapter.loginIfNeeded()).resolves.toBeUndefined();

    expect(executor.calls).toEqual([
      'navigate:http://localhost:6183/employer/resumes',
      'snapshot',
      'snapshotStructured',
    ]);
  });

  it('does not treat raw app bootstrap text as login when structured state is the resume list', async () => {
    const executor = new StructuredResumeListExecutor([
      '<style>.password-field{display:block}</style><main></main>',
    ]);
    const adapter = new BossLikeCandidateSourceAdapter({ executor });

    await adapter.loginIfNeeded();

    expect(executor.calls).toEqual([
      'navigate:http://localhost:6183/employer/resumes',
      'snapshot',
      'snapshotStructured',
    ]);
  });

  it('extracts candidate cards from a structured resume list snapshot', () => {
    expect(extractBossLikeCandidatesFromHtml(resumeListFixture)).toEqual([
      {
        platformCandidateId: 'boss-1',
        profileUrl: '/employer/resumes/boss-1',
        name: '王小明',
        title: '高级后端工程师',
        company: '星河智能',
        experienceYears: 5,
        resumeText: 'Java Spring Boot 高并发 微服务',
      },
    ]);
  });

  it('opens detail pages when list cards have short resume text', async () => {
    const executor = new FakeBrowserExecutor([
      '<main>候选人列表</main>',
      shortResumeListFixture,
      detailFixture,
    ]);
    const adapter = new BossLikeCandidateSourceAdapter({ executor });

    const batches = await collectAsyncBatches(
      adapter.searchCandidates(searchPlan, { maxCandidates: 1, batchSize: 1 }),
    );

    expect(executor.calls).toContain('navigate:http://localhost:6183/employer/resumes/boss-1');
    expect(batches).toHaveLength(1);
    expect(batches[0]?.candidates).toEqual([
      expect.objectContaining({
        platformCandidateId: 'boss-1',
        resumeText: 'Java Spring Boot 高并发 微服务 分布式 系统设计',
      }),
    ]);
  });

  it('waits for candidate cards instead of ambiguous resume text before reading snapshots', async () => {
    const executor = new AmbiguousResumeTextExecutor([
      '<main>候选人列表</main>',
      resumeListFixture,
    ]);
    const adapter = new BossLikeCandidateSourceAdapter({ executor });

    const batches = await collectAsyncBatches(
      adapter.searchCandidates(searchPlan, { maxCandidates: 1, batchSize: 1 }),
    );

    expect(executor.calls).toContain('check:article[data-candidate-id]');
    expect(executor.calls).not.toContain('waitForText:简历');
    expect(batches[0]?.candidates[0]?.platformCandidateId).toBe('boss-1');
  });

  it('submits each keyword search and continues after an empty result page', async () => {
    const executor = new EmptyThenResultExecutor([
      '<main>候选人列表</main>',
      '<main>暂无简历数据</main>',
      resumeListFixture,
    ]);
    const adapter = new BossLikeCandidateSourceAdapter({ executor });

    const batches = await collectAsyncBatches(
      adapter.searchCandidates(
        { ...searchPlan, keywords: ['不存在的关键词', 'Java'] },
        { maxCandidates: 1, batchSize: 1 },
      ),
    );

    expect(executor.calls.filter((call) => call === 'click:搜索')).toHaveLength(2);
    expect(batches[0]?.candidates[0]?.platformCandidateId).toBe('boss-1');
  });

  it('requires raw browser snapshots for candidate search', async () => {
    const executor = createSnapshotlessExecutor();
    const adapter = new BossLikeCandidateSourceAdapter({ executor });

    await expect(
      collectAsyncBatches(adapter.searchCandidates(searchPlan, { maxCandidates: 1, batchSize: 1 })),
    ).rejects.toThrow(/boss-like candidate search requires raw browser snapshots/);
  });

  it('rejects blank browser snapshots during candidate search', async () => {
    const executor = new FakeBrowserExecutor(['<main>候选人列表</main>', '   ']);
    const adapter = new BossLikeCandidateSourceAdapter({ executor });

    await expect(
      collectAsyncBatches(adapter.searchCandidates(searchPlan, { maxCandidates: 1, batchSize: 1 })),
    ).rejects.toThrow(/boss-like candidate search returned an empty browser snapshot/);
  });

  it('rejects blank browser snapshots during detail enrichment', async () => {
    const executor = new FakeBrowserExecutor([
      '<main>候选人列表</main>',
      shortResumeListFixture,
      '\n\t ',
    ]);
    const adapter = new BossLikeCandidateSourceAdapter({ executor });

    await expect(
      collectAsyncBatches(adapter.searchCandidates(searchPlan, { maxCandidates: 1, batchSize: 1 })),
    ).rejects.toThrow(/boss-like candidate search returned an empty browser snapshot/);
  });

  it('restores the resume list before continuing keyword search after detail enrichment', async () => {
    const executor = new FakeBrowserExecutor([
      '<main>候选人列表</main>',
      shortResumeListFixture,
      detailFixture,
      secondResumeListFixture,
    ]);
    const adapter = new BossLikeCandidateSourceAdapter({ executor });
    const twoKeywordPlan: SearchPlan = {
      ...searchPlan,
      keywords: ['Java', 'Node'],
    };

    const batches = await collectAsyncBatches(
      adapter.searchCandidates(twoKeywordPlan, { maxCandidates: 2, batchSize: 2 }),
    );

    const detailNavigationIndex = executor.calls.indexOf(
      'navigate:http://localhost:6183/employer/resumes/boss-1',
    );
    const secondKeywordFillIndex = executor.calls.indexOf('fill:搜索候选人:Node');
    const restoredListIndex = executor.calls.findIndex(
      (call, index) =>
        index > detailNavigationIndex && call === 'navigate:http://localhost:6183/employer/resumes',
    );

    expect(batches[0]?.candidates.map((candidate) => candidate.platformCandidateId)).toEqual([
      'boss-1',
      'boss-2',
    ]);
    expect(restoredListIndex).toBeGreaterThan(detailNavigationIndex);
    expect(restoredListIndex).toBeLessThan(secondKeywordFillIndex);
  });

  it('trims and deduplicates keywords before searching', async () => {
    const executor = new FakeBrowserExecutor([
      '<main>候选人列表</main>',
      resumeListFixture,
      secondResumeListFixture,
    ]);
    const adapter = new BossLikeCandidateSourceAdapter({ executor });
    const noisyKeywordPlan: SearchPlan = {
      ...searchPlan,
      keywords: ['  ', ' Java ', 'Java', '\n', 'Node'],
    };

    await collectAsyncBatches(
      adapter.searchCandidates(noisyKeywordPlan, { maxCandidates: 2, batchSize: 2 }),
    );

    expect(executor.calls.filter((call) => call.startsWith('fill:搜索候选人:'))).toEqual([
      'fill:搜索候选人:Java',
      'fill:搜索候选人:Node',
    ]);
  });

  it('falls back to retrieval query when keywords normalize to empty', async () => {
    const executor = new FakeBrowserExecutor(['<main>候选人列表</main>', resumeListFixture]);
    const adapter = new BossLikeCandidateSourceAdapter({ executor });
    const blankKeywordPlan: SearchPlan = {
      ...searchPlan,
      keywords: [' ', '\n'],
      retrievalQuery: ' Java 后端 ',
    };

    await collectAsyncBatches(
      adapter.searchCandidates(blankKeywordPlan, { maxCandidates: 1, batchSize: 1 }),
    );

    expect(executor.calls.filter((call) => call.startsWith('fill:搜索候选人:'))).toEqual([
      'fill:搜索候选人:Java 后端',
    ]);
  });

  it('executes collect and chat only through explicit adapter methods', async () => {
    const executor = new FakeBrowserExecutor(['<main>候选人列表</main>', resumeListFixture]);
    const adapter = new BossLikeCandidateSourceAdapter({ executor });

    await collectAsyncBatches(
      adapter.searchCandidates(searchPlan, { maxCandidates: 1, batchSize: 1 }),
    );

    expect(executor.calls).not.toContain('click:收藏');
    expect(executor.calls).not.toContain('click:打招呼');

    executor.clearCalls();
    await adapter.collectCandidate({
      candidateId: 'candidate-1',
      displayName: '王小明',
      profileUrl: '/employer/resumes/boss-1',
    });

    expect(executor.calls).toEqual([
      'navigate:http://localhost:6183/employer/resumes/boss-1',
      'click:收藏',
    ]);

    executor.clearCalls();
    await adapter.chatCandidate(
      {
        candidateId: 'candidate-1',
        displayName: '王小明',
        profileUrl: '/employer/resumes/boss-1',
      },
      chatPlan,
    );

    expect(executor.calls).toEqual([
      'navigate:http://localhost:6183/employer/resumes/boss-1',
      'click:打招呼',
      `fill:消息:${chatPlan.message}`,
      'click:发送',
    ]);
  });

  it('rejects unsafe collect and chat profile URLs without navigating', async () => {
    for (const profileUrl of unsafeProfileUrls) {
      const collectExecutor = new FakeBrowserExecutor();
      const collectAdapter = new BossLikeCandidateSourceAdapter({ executor: collectExecutor });

      await expect(
        collectAdapter.collectCandidate({
          candidateId: 'candidate-1',
          displayName: '王小明',
          profileUrl,
        }),
      ).resolves.toEqual(
        expect.objectContaining({
          success: false,
          error: expect.stringMatching(/invalid candidate profileUrl/),
        }),
      );
      expect(collectExecutor.calls.some((call) => call.startsWith('navigate:'))).toBe(false);

      const chatExecutor = new FakeBrowserExecutor();
      const chatAdapter = new BossLikeCandidateSourceAdapter({ executor: chatExecutor });

      await expect(
        chatAdapter.chatCandidate(
          {
            candidateId: 'candidate-1',
            displayName: '王小明',
            profileUrl,
          },
          chatPlan,
        ),
      ).resolves.toEqual(
        expect.objectContaining({
          success: false,
          error: expect.stringMatching(/invalid candidate profileUrl/),
        }),
      );
      expect(chatExecutor.calls.some((call) => call.startsWith('navigate:'))).toBe(false);
    }
  });

  it('requires boss-like env config outside local runtimes', () => {
    const executor = new FakeBrowserExecutor();
    setNodeEnv('production');
    delete process.env.BOSS_LIKE_BASE_URL;
    process.env.BOSS_LIKE_EMPLOYER_USERNAME = 'hr-admin';
    process.env.BOSS_LIKE_EMPLOYER_PASSWORD = 'secret';

    expect(() => new BossLikeCandidateSourceAdapter({ executor })).toThrow(
      /BOSS_LIKE_BASE_URL is required outside local test runtimes/,
    );

    process.env.BOSS_LIKE_BASE_URL = 'https://boss-like.example.com';
    delete process.env.BOSS_LIKE_EMPLOYER_USERNAME;

    expect(() => new BossLikeCandidateSourceAdapter({ executor })).toThrow(
      /BOSS_LIKE_EMPLOYER_USERNAME is required outside local test runtimes/,
    );
  });

  it('creates boss-like adapters from the factory', () => {
    const executor = new FakeBrowserExecutor();
    createBrowserExecutorFromEnvMock.mockReturnValueOnce(executor);

    const adapter = createCandidateSourceAdapter('boss-like');

    expect(adapter).toBeInstanceOf(BossLikeCandidateSourceAdapter);
    expect(adapter.platform).toBe('boss-like');
    expect(createBrowserExecutorFromEnvMock).toHaveBeenCalledTimes(1);
  });
});
