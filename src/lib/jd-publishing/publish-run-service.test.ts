/** @jest-environment node */

import { scheduleBackgroundTask } from '@/lib/jd/background';
import type { JobDescriptionDto } from '@/types';
import {
  createPublishRun,
  createPublishRunEvent,
  reconcilePublishBatchWithRetry,
  updatePublishRun,
  type JobDescriptionPublishRunDto,
} from './publish-run-repo';
import { runPublishRun } from './publish-run-runner';
import {
  failInitializedPublishRun,
  initializePublishRun,
  schedulePublishRuns,
} from './publish-run-service';

jest.mock('@/lib/jd/background', () => ({ scheduleBackgroundTask: jest.fn() }));
jest.mock('./publish-run-repo', () => ({
  createPublishRun: jest.fn(),
  createPublishRunEvent: jest.fn(),
  reconcilePublishBatchWithRetry: jest.fn(),
  updatePublishRun: jest.fn(),
}));
jest.mock('./publish-run-runner', () => ({ runPublishRun: jest.fn() }));

const scheduleBackgroundTaskMock = scheduleBackgroundTask as jest.MockedFunction<
  typeof scheduleBackgroundTask
>;
const reconcileMock = reconcilePublishBatchWithRetry as jest.MockedFunction<
  typeof reconcilePublishBatchWithRetry
>;
const createPublishRunMock = createPublishRun as jest.MockedFunction<typeof createPublishRun>;
const createPublishRunEventMock = createPublishRunEvent as jest.MockedFunction<
  typeof createPublishRunEvent
>;
const updatePublishRunMock = updatePublishRun as jest.MockedFunction<typeof updatePublishRun>;
const runPublishRunMock = runPublishRun as jest.MockedFunction<typeof runPublishRun>;

const timestamp = '2026-07-20T12:30:00.000Z';
const run: JobDescriptionPublishRunDto = {
  id: 'run-1',
  userId: 'u1',
  jobDescriptionId: 'jd-1',
  batchId: 'batch-1',
  platform: 'boss',
  status: 'pending',
  currentStage: 'queued',
  errorMessage: null,
  publishTaskId: null,
  skillId: null,
  startedAt: null,
  finishedAt: null,
  createdAt: timestamp,
  updatedAt: timestamp,
};
const jobDescription = {
  id: 'jd-1',
  userId: 'u1',
  department: '技术部',
  position: '前端工程师',
  positionDescription: '负责招聘产品前端体验',
  salaryRange: '30-50K',
  workLocations: ['上海'],
  hiringTarget: 2,
  onboardedCount: 0,
  tone: 'tech',
  status: 'publishing',
  content: {
    title: '前端工程师',
    summary: '负责招聘产品前端体验',
    responsibilities: [],
    requirements: [],
    bonus: [],
    highlights: [],
  },
  evaluation: null,
  generationMeta: null,
  createdAt: timestamp,
  updatedAt: timestamp,
} satisfies JobDescriptionDto;
const settings = {
  platform: 'boss' as const,
  company: '星河智能',
  salary: '30-50K',
  location: '上海',
  keywords: ['TypeScript'],
};

describe('publish run initialization and scheduling', () => {
  beforeEach(() => {
    jest.clearAllMocks();
    createPublishRunMock.mockResolvedValue(run);
    createPublishRunEventMock.mockResolvedValue({
      id: 'event-1',
      userId: 'u1',
      runId: 'run-1',
      stage: 'queued',
      level: 'info',
      message: '发布任务已创建',
      detail: null,
      createdAt: timestamp,
    });
    updatePublishRunMock.mockResolvedValue(run);
    reconcileMock.mockResolvedValue(jobDescription);
    runPublishRunMock.mockResolvedValue();
  });

  it('initializes the run without scheduling, then starts with the claimed JD snapshot', async () => {
    const initialized = await initializePublishRun({
      userId: 'u1',
      jobDescriptionId: 'jd-1',
      jobDescription,
      batchId: 'batch-1',
      settings,
    });

    expect(createPublishRunMock).toHaveBeenCalledWith({
      userId: 'u1',
      jobDescriptionId: 'jd-1',
      batchId: 'batch-1',
      platform: 'boss',
    });
    expect(scheduleBackgroundTaskMock).not.toHaveBeenCalled();

    schedulePublishRuns([initialized]);
    const backgroundTask = scheduleBackgroundTaskMock.mock.calls[0]?.[0];
    expect(backgroundTask).toBeDefined();
    await backgroundTask?.();
    expect(runPublishRunMock).toHaveBeenCalledWith({ run, jobDescription, settings });
  });

  it('marks a created run failed if initialization stops before background scheduling', async () => {
    createPublishRunEventMock.mockRejectedValueOnce(new Error('event insert failed'));

    await expect(
      initializePublishRun({
        userId: 'u1',
        jobDescriptionId: 'jd-1',
        jobDescription,
        batchId: 'batch-1',
        settings,
      }),
    ).rejects.toThrow('event insert failed');

    expect(updatePublishRunMock).toHaveBeenCalledWith(
      expect.objectContaining({
        runId: 'run-1',
        status: 'failed',
        currentStage: 'completed',
        errorMessage: '发布任务初始化失败：event insert failed',
      }),
    );
    expect(scheduleBackgroundTaskMock).not.toHaveBeenCalled();
  });

  it('registers one background task for a fully initialized multi-platform batch', async () => {
    const liepinRun = { ...run, id: 'run-2', platform: 'liepin' };
    const liepinSettings = { ...settings, platform: 'liepin' as const };

    schedulePublishRuns([
      { run, jobDescription, settings },
      { run: liepinRun, jobDescription, settings: liepinSettings },
    ]);

    expect(scheduleBackgroundTaskMock).toHaveBeenCalledTimes(1);
    const backgroundTask = scheduleBackgroundTaskMock.mock.calls[0]?.[0];
    await backgroundTask?.();
    expect(runPublishRunMock).toHaveBeenCalledTimes(2);
    expect(runPublishRunMock).toHaveBeenNthCalledWith(1, { run, jobDescription, settings });
    expect(runPublishRunMock).toHaveBeenNthCalledWith(2, {
      run: liepinRun,
      jobDescription,
      settings: liepinSettings,
    });
  });

  it('marks an initialized sibling failed without scheduling when its batch cannot start', async () => {
    await failInitializedPublishRun(
      { run, jobDescription, settings },
      new Error('boss publish run initialization failed'),
    );

    expect(updatePublishRunMock).toHaveBeenCalledWith({
      userId: 'u1',
      runId: 'run-1',
      status: 'failed',
      currentStage: 'completed',
      errorMessage:
        '同批次存在发布任务初始化失败，本任务未启动：boss publish run initialization failed',
      finishedAt: expect.any(Date),
    });
    expect(createPublishRunEventMock).toHaveBeenCalledWith({
      userId: 'u1',
      runId: 'run-1',
      stage: 'completed',
      level: 'error',
      message: '发布任务未启动',
      detail: {
        error: '同批次存在发布任务初始化失败，本任务未启动：boss publish run initialization failed',
      },
    });
    expect(scheduleBackgroundTaskMock).not.toHaveBeenCalled();
  });

  it('fails and reconciles the batch if background startup throws unexpectedly', async () => {
    runPublishRunMock.mockRejectedValueOnce(new Error('startup failed'));
    const initialized = await initializePublishRun({
      userId: 'u1',
      jobDescriptionId: 'jd-1',
      jobDescription,
      batchId: 'batch-1',
      settings,
    });
    schedulePublishRuns([initialized]);

    const backgroundTask = scheduleBackgroundTaskMock.mock.calls[0]?.[0];
    await expect(backgroundTask?.()).rejects.toThrow('startup failed');
    expect(updatePublishRunMock).toHaveBeenCalledWith(
      expect.objectContaining({ runId: 'run-1', status: 'failed', currentStage: 'completed' }),
    );
    expect(reconcileMock).toHaveBeenCalledWith({
      userId: 'u1',
      id: 'jd-1',
      batchId: 'batch-1',
      mode: 'batch',
      result: 'failed',
    });
  });
});
