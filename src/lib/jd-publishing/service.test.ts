import type { JobDescriptionDto, JD } from '@/types';
import { createBrowserExecutorFromEnv } from '@/lib/browser/executors/browser-executor-factory';
import { runPublishingAgentGraph } from './graph';
import { publishJobDescriptionToBossLike } from './service';
import type { BrowserExecutor } from '@/lib/browser/types';
import type { PublishTaskResult } from './types';
import { resolveRecruitmentPlatformRuntimeConfig } from '@/lib/recruitment-platform-config';

jest.mock('@/lib/browser/executors/browser-executor-factory', () => ({
  createBrowserExecutorFromEnv: jest.fn(),
}));

jest.mock('./graph', () => ({
  runPublishingAgentGraph: jest.fn(),
}));

jest.mock('@/lib/recruitment-platform-config', () => ({
  resolveRecruitmentPlatformRuntimeConfig: jest.fn(),
}));

const createBrowserExecutorFromEnvMock = createBrowserExecutorFromEnv as jest.MockedFunction<
  typeof createBrowserExecutorFromEnv
>;
const runPublishingAgentGraphMock = runPublishingAgentGraph as jest.MockedFunction<
  typeof runPublishingAgentGraph
>;
const resolveRecruitmentPlatformRuntimeConfigMock =
  resolveRecruitmentPlatformRuntimeConfig as jest.MockedFunction<
    typeof resolveRecruitmentPlatformRuntimeConfig
  >;

const sampleJd: JD = {
  title: '高级前端工程师',
  summary: '负责招聘产品前端体验',
  responsibilities: ['建设 JD 发布链路'],
  requirements: ['熟悉 TypeScript'],
  bonus: ['有自动化经验'],
  highlights: ['核心业务'],
};

const sampleJobDescription: JobDescriptionDto = {
  id: 'jd-1',
  userId: 'u1',
  department: '技术部',
  position: '前端工程师',
  positionDescription: '负责招聘产品前端体验',
  salaryRange: null,
  workLocations: [],
  hiringTarget: 1,
  onboardedCount: 0,
  tone: 'tech',
  status: 'ready_to_publish',
  content: sampleJd,
  evaluation: null,
  generationMeta: null,
  createdAt: '2026-06-26T00:00:00.000Z',
  updatedAt: '2026-06-26T00:00:00.000Z',
};

const successfulResult: PublishTaskResult = {
  taskId: 'task-1',
  skillId: 'skill-1',
  status: 'success',
  trace: {
    taskId: 'task-1',
    skillId: 'skill-1',
    status: 'success',
    steps: [],
    createdAt: '2026-06-26T00:00:00.000Z',
  },
};

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

function setNodeEnv(value: string): void {
  (process.env as { NODE_ENV?: string }).NODE_ENV = value;
}

function createExecutor(): BrowserExecutor & { close: jest.Mock<Promise<void>, []> } {
  return {
    navigate: jest.fn(),
    fill: jest.fn(),
    click: jest.fn(),
    waitForUrl: jest.fn(),
    check: jest.fn(),
    close: jest.fn<Promise<void>, []>().mockResolvedValue(undefined),
  } as unknown as BrowserExecutor & { close: jest.Mock<Promise<void>, []> };
}

function settings() {
  return {
    platform: 'boss-like' as const,
    company: '星河智能',
    salary: '25-40K',
    location: '上海',
    keywords: ['TypeScript'],
  };
}

describe('publishJobDescriptionToBossLike', () => {
  beforeEach(() => {
    jest.resetAllMocks();
    setNodeEnv(originalNodeEnv);
    restoreEnv('BOSS_LIKE_BASE_URL');
    restoreEnv('BOSS_LIKE_API_BASE_URL');
    restoreEnv('BOSS_LIKE_EMPLOYER_USERNAME');
    restoreEnv('BOSS_LIKE_EMPLOYER_PASSWORD');
    restoreEnv('BROWSER_EXECUTOR');
    restoreEnv('BROWSER_COMMAND_ENDPOINT');
    restoreEnv('BROWSER_COMMAND_TIMEOUT_MS');
    runPublishingAgentGraphMock.mockResolvedValue(successfulResult);
    resolveRecruitmentPlatformRuntimeConfigMock.mockResolvedValue({
      platform: 'boss-like',
      baseUrl: 'http://127.0.0.1:6183',
      username: 'hr-admin',
      password: 'secret',
      variables: {
        loginPath: '/employer/login',
        newJobPath: '/employer/jobs/new',
        jobsListPath: '/employer/jobs',
        loginSuccessPath: '/employer/resumes',
      },
      siteFingerprint: 'site-1',
      siteTemplatePlatform: 'boss-like',
    });
  });

  afterAll(() => {
    setNodeEnv(originalNodeEnv);
    restoreEnv('BOSS_LIKE_BASE_URL');
    restoreEnv('BOSS_LIKE_API_BASE_URL');
    restoreEnv('BOSS_LIKE_EMPLOYER_USERNAME');
    restoreEnv('BOSS_LIKE_EMPLOYER_PASSWORD');
    restoreEnv('BROWSER_EXECUTOR');
    restoreEnv('BROWSER_COMMAND_ENDPOINT');
    restoreEnv('BROWSER_COMMAND_TIMEOUT_MS');
  });

  it('delegates publishing to the LangGraph agent with page target URLs', async () => {
    const executor = createExecutor();
    process.env.BOSS_LIKE_BASE_URL = 'http://127.0.0.1:6183///';
    process.env.BOSS_LIKE_EMPLOYER_USERNAME = 'hr-admin';
    process.env.BOSS_LIKE_EMPLOYER_PASSWORD = 'secret';

    const result = await publishJobDescriptionToBossLike({
      jobDescription: sampleJobDescription,
      batchId: 'batch-1',
      settings: settings(),
      executor,
    });

    expect(result).toBe(successfulResult);
    expect(runPublishingAgentGraphMock).toHaveBeenCalledWith(
      expect.objectContaining({
        jobDescription: sampleJobDescription,
        batchId: 'batch-1',
        settings: settings(),
        executor,
        credentials: { username: 'hr-admin', password: 'secret' },
        siteFingerprint: 'site-1',
        target: expect.objectContaining({
          loginUrl: 'http://127.0.0.1:6183/employer/login',
          newJobUrl: 'http://127.0.0.1:6183/employer/jobs/new',
        }),
      }),
    );
    expect(executor.close).not.toHaveBeenCalled();
  });

  it('creates and closes the shared browser executor without any boss-like API URL', async () => {
    const executor = createExecutor();
    process.env.BOSS_LIKE_API_BASE_URL = 'http://localhost:6810';
    createBrowserExecutorFromEnvMock.mockReturnValueOnce(executor);

    await publishJobDescriptionToBossLike({
      jobDescription: sampleJobDescription,
      batchId: 'batch-1',
      settings: settings(),
    });

    expect(createBrowserExecutorFromEnvMock).toHaveBeenCalledWith(process.env, {
      userId: sampleJobDescription.userId,
    });
    expect(JSON.stringify(runPublishingAgentGraphMock.mock.calls[0]?.[0])).not.toContain('6810');
    expect(executor.close).toHaveBeenCalledTimes(1);
  });

  it('uses the shared browser executor factory when no executor is injected', async () => {
    const executor = createExecutor();
    createBrowserExecutorFromEnvMock.mockReturnValueOnce(executor);

    await publishJobDescriptionToBossLike({
      jobDescription: sampleJobDescription,
      batchId: 'batch-1',
      settings: settings(),
    });

    expect(runPublishingAgentGraphMock.mock.calls[0]?.[0].executor).toBe(executor);
  });

  it('reports a missing company platform configuration', async () => {
    const executor = createExecutor();
    resolveRecruitmentPlatformRuntimeConfigMock.mockRejectedValueOnce(
      new Error('recruitment platform is not configured: boss-like'),
    );

    await expect(
      publishJobDescriptionToBossLike({
        jobDescription: sampleJobDescription,
        batchId: 'batch-1',
        settings: settings(),
        executor,
      }),
    ).rejects.toThrow(/recruitment platform is not configured/);
    expect(runPublishingAgentGraphMock).not.toHaveBeenCalled();
  });
});
