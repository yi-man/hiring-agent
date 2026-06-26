import type { JobDescriptionDto, JD } from '@/types';
import { PlaywrightBrowserExecutor } from './executors/playwright-executor';
import { runPublishingAgentGraph } from './graph';
import { publishJobDescriptionToBossLike } from './service';
import type { BrowserExecutor, PublishTaskResult } from './types';

jest.mock('./executors/playwright-executor', () => ({
  PlaywrightBrowserExecutor: jest.fn(),
}));

jest.mock('./graph', () => ({
  runPublishingAgentGraph: jest.fn(),
}));

const PlaywrightBrowserExecutorMock = PlaywrightBrowserExecutor as jest.MockedClass<
  typeof PlaywrightBrowserExecutor
>;
const runPublishingAgentGraphMock = runPublishingAgentGraph as jest.MockedFunction<
  typeof runPublishingAgentGraph
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

function restoreEnv(name: string): void {
  const value = originalEnv[name];
  if (typeof value === 'undefined') {
    delete process.env[name];
    return;
  }
  process.env[name] = value;
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
    restoreEnv('BOSS_LIKE_BASE_URL');
    restoreEnv('BOSS_LIKE_API_BASE_URL');
    restoreEnv('BOSS_LIKE_EMPLOYER_USERNAME');
    restoreEnv('BOSS_LIKE_EMPLOYER_PASSWORD');
    runPublishingAgentGraphMock.mockResolvedValue(successfulResult);
  });

  afterAll(() => {
    restoreEnv('BOSS_LIKE_BASE_URL');
    restoreEnv('BOSS_LIKE_API_BASE_URL');
    restoreEnv('BOSS_LIKE_EMPLOYER_USERNAME');
    restoreEnv('BOSS_LIKE_EMPLOYER_PASSWORD');
  });

  it('delegates publishing to the LangGraph agent with page target URLs', async () => {
    const executor = createExecutor();
    process.env.BOSS_LIKE_BASE_URL = 'http://127.0.0.1:6183///';
    process.env.BOSS_LIKE_EMPLOYER_USERNAME = 'hr-admin';
    process.env.BOSS_LIKE_EMPLOYER_PASSWORD = 'secret';

    const result = await publishJobDescriptionToBossLike({
      jobDescription: sampleJobDescription,
      settings: settings(),
      executor,
    });

    expect(result).toBe(successfulResult);
    expect(runPublishingAgentGraphMock).toHaveBeenCalledWith(
      expect.objectContaining({
        jobDescription: sampleJobDescription,
        settings: settings(),
        executor,
        credentials: { username: 'hr-admin', password: 'secret' },
        target: {
          loginUrl: 'http://127.0.0.1:6183/employer/login',
          newJobUrl: 'http://127.0.0.1:6183/employer/jobs/new',
        },
      }),
    );
    expect(executor.close).not.toHaveBeenCalled();
  });

  it('creates and closes the default headed Playwright executor without any boss-like API URL', async () => {
    const executor = createExecutor();
    process.env.BOSS_LIKE_API_BASE_URL = 'http://localhost:6810';
    PlaywrightBrowserExecutorMock.mockImplementationOnce(
      () => executor as unknown as PlaywrightBrowserExecutor,
    );

    await publishJobDescriptionToBossLike({
      jobDescription: sampleJobDescription,
      settings: settings(),
    });

    expect(PlaywrightBrowserExecutorMock).toHaveBeenCalledWith();
    expect(JSON.stringify(runPublishingAgentGraphMock.mock.calls[0]?.[0])).not.toContain('6810');
    expect(executor.close).toHaveBeenCalledTimes(1);
  });
});
