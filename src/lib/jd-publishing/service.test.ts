import type { JobDescriptionDto, JD } from '@/types';
import { PlaywrightBrowserExecutor } from './executors/playwright-executor';
import {
  completePublishTask,
  createPublishTask,
  getActivePublishSkillFromDb,
  upsertDefaultPublishSkill,
} from './publish-repo';
import { publishJobDescriptionToBossLike } from './service';
import { bossLikePublishSkill } from './skill-registry';
import { runPublishingSkill } from './skill-executor';
import type { BrowserExecutor, PublishSkill } from './types';

jest.mock('./executors/playwright-executor', () => ({
  PlaywrightBrowserExecutor: jest.fn(),
}));

jest.mock('./publish-repo', () => ({
  completePublishTask: jest.fn(),
  createPublishTask: jest.fn(),
  getActivePublishSkillFromDb: jest.fn(),
  upsertDefaultPublishSkill: jest.fn(),
}));

jest.mock('./skill-executor', () => ({
  runPublishingSkill: jest.fn(),
}));

const completePublishTaskMock = completePublishTask as jest.MockedFunction<
  typeof completePublishTask
>;
const createPublishTaskMock = createPublishTask as jest.MockedFunction<typeof createPublishTask>;
const getActivePublishSkillFromDbMock = getActivePublishSkillFromDb as jest.MockedFunction<
  typeof getActivePublishSkillFromDb
>;
const upsertDefaultPublishSkillMock = upsertDefaultPublishSkill as jest.MockedFunction<
  typeof upsertDefaultPublishSkill
>;
const runPublishingSkillMock = runPublishingSkill as jest.MockedFunction<typeof runPublishingSkill>;
const PlaywrightBrowserExecutorMock = PlaywrightBrowserExecutor as jest.MockedClass<
  typeof PlaywrightBrowserExecutor
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

const dbSkill: PublishSkill = {
  ...bossLikePublishSkill,
  id: 'db-skill',
  steps: [{ id: 'open_from_db', type: 'end' }],
};

const originalEnv = { ...process.env };

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

describe('publishJobDescriptionToBossLike', () => {
  beforeEach(() => {
    jest.resetAllMocks();
    process.env.BOSS_LIKE_BASE_URL = originalEnv.BOSS_LIKE_BASE_URL;
    process.env.BOSS_LIKE_API_BASE_URL = originalEnv.BOSS_LIKE_API_BASE_URL;
    process.env.BOSS_LIKE_EMPLOYER_USERNAME = originalEnv.BOSS_LIKE_EMPLOYER_USERNAME;
    process.env.BOSS_LIKE_EMPLOYER_PASSWORD = originalEnv.BOSS_LIKE_EMPLOYER_PASSWORD;

    createPublishTaskMock.mockResolvedValue({
      id: 'task-1',
      userId: 'u1',
      jobDescriptionId: 'jd-1',
      skillId: 'db-skill',
      platform: 'boss-like',
      input: {},
      currentStep: 'open_from_db',
      status: 'running',
      errorMessage: null,
      trace: null,
      createdAt: '2026-06-26T00:00:00.000Z',
      updatedAt: '2026-06-26T00:00:00.000Z',
    });
  });

  afterAll(() => {
    process.env.BOSS_LIKE_BASE_URL = originalEnv.BOSS_LIKE_BASE_URL;
    process.env.BOSS_LIKE_API_BASE_URL = originalEnv.BOSS_LIKE_API_BASE_URL;
    process.env.BOSS_LIKE_EMPLOYER_USERNAME = originalEnv.BOSS_LIKE_EMPLOYER_USERNAME;
    process.env.BOSS_LIKE_EMPLOYER_PASSWORD = originalEnv.BOSS_LIKE_EMPLOYER_PASSWORD;
  });

  it('creates a task, runs the active DB skill, and stores a successful trace', async () => {
    const executor = createExecutor();
    process.env.BOSS_LIKE_BASE_URL = 'http://127.0.0.1:6183///';
    process.env.BOSS_LIKE_EMPLOYER_USERNAME = 'hr-admin';
    process.env.BOSS_LIKE_EMPLOYER_PASSWORD = 'secret';
    getActivePublishSkillFromDbMock.mockResolvedValueOnce(dbSkill);
    runPublishingSkillMock.mockResolvedValueOnce({
      taskId: 'task-1',
      skillId: 'db-skill',
      status: 'success',
      trace: {
        taskId: 'task-1',
        skillId: 'db-skill',
        status: 'success',
        steps: [{ stepId: 'open_from_db', action: 'end', params: {}, result: { success: true } }],
        createdAt: '2026-06-26T00:00:00.000Z',
      },
    });

    const result = await publishJobDescriptionToBossLike({
      jobDescription: sampleJobDescription,
      settings: {
        platform: 'boss-like',
        company: '星河智能',
        salary: '25-40K',
        location: '上海',
        keywords: ['TypeScript'],
      },
      executor,
    });

    expect(result.status).toBe('success');
    expect(upsertDefaultPublishSkillMock).toHaveBeenCalledWith(bossLikePublishSkill);
    expect(createPublishTaskMock).toHaveBeenCalledWith(
      expect.objectContaining({
        userId: 'u1',
        jobDescriptionId: 'jd-1',
        skillId: 'db-skill',
        currentStep: 'open_from_db',
        input: expect.objectContaining({
          title: '高级前端工程师',
          company: '星河智能',
          location: '上海',
        }),
      }),
    );
    expect(runPublishingSkillMock).toHaveBeenCalledWith(
      expect.objectContaining({
        taskId: 'task-1',
        skill: dbSkill,
        executor,
        context: expect.objectContaining({
          credentials: { username: 'hr-admin', password: 'secret' },
          target: {
            loginUrl: 'http://127.0.0.1:6183/employer/login',
            newJobUrl: 'http://127.0.0.1:6183/employer/jobs/new',
          },
        }),
      }),
    );
    expect(completePublishTaskMock).toHaveBeenCalledWith({
      taskId: 'task-1',
      skillId: 'db-skill',
      status: 'success',
      steps: [{ stepId: 'open_from_db', action: 'end', params: {}, result: { success: true } }],
      errorMessage: null,
    });
    expect(executor.close).not.toHaveBeenCalled();
  });

  it('falls back to the built-in skill and records unknown runtime errors', async () => {
    const executor = createExecutor();
    getActivePublishSkillFromDbMock.mockResolvedValueOnce(null);
    runPublishingSkillMock.mockRejectedValueOnce('browser stopped');

    const result = await publishJobDescriptionToBossLike({
      jobDescription: sampleJobDescription,
      settings: {
        platform: 'boss-like',
        company: '星河智能',
        salary: '25-40K',
        location: '上海',
        keywords: [],
      },
      executor,
    });

    expect(result.status).toBe('failed');
    expect(result.skillId).toBe('boss-like-publish-jd');
    expect(result.trace.steps[0]?.result.error).toBe('Unknown browser error');
    expect(createPublishTaskMock).toHaveBeenCalledWith(
      expect.objectContaining({
        skillId: 'boss-like-publish-jd',
        currentStep: 'open_new_job',
      }),
    );
    expect(completePublishTaskMock).toHaveBeenCalledWith(
      expect.objectContaining({
        taskId: 'task-1',
        skillId: 'boss-like-publish-jd',
        status: 'failed',
        errorMessage: 'Unknown browser error',
      }),
    );
  });

  it('uses and closes the default Playwright executor when no executor is injected', async () => {
    const executor = createExecutor();
    delete process.env.BOSS_LIKE_API_BASE_URL;
    getActivePublishSkillFromDbMock.mockResolvedValueOnce(dbSkill);
    PlaywrightBrowserExecutorMock.mockImplementationOnce(
      () => executor as unknown as PlaywrightBrowserExecutor,
    );
    runPublishingSkillMock.mockRejectedValueOnce(new Error('browser launch failed'));

    const result = await publishJobDescriptionToBossLike({
      jobDescription: sampleJobDescription,
      settings: {
        platform: 'boss-like',
        company: '星河智能',
        salary: '25-40K',
        location: '上海',
        keywords: [],
      },
    });

    expect(result.status).toBe('failed');
    expect(result.trace.steps[0]?.result.error).toBe('browser launch failed');
    expect(PlaywrightBrowserExecutorMock).toHaveBeenCalledWith({
      apiBaseUrl: 'http://localhost:6810',
    });
    expect(executor.close).toHaveBeenCalledTimes(1);
  });
});
