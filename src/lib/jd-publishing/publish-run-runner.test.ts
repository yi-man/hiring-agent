/** @jest-environment node */

import type { JobDescriptionDto } from '@/types';
import { recoverStaleJobDescriptionPublishing } from '@/lib/jd/job-description-repo';
import { publishJobDescriptionToBossLike } from './service';
import {
  createPublishRunEvent,
  reconcilePublishBatchWithRetry,
  updatePublishRun,
  type JobDescriptionPublishRunDto,
} from './publish-run-repo';
import { runPublishRun } from './publish-run-runner';
import type { PublishJobDescriptionSettings } from './types';

jest.mock('./service', () => ({
  publishJobDescriptionToBossLike: jest.fn(),
}));

jest.mock('@/lib/jd/job-description-repo', () => ({
  recoverStaleJobDescriptionPublishing: jest.fn(),
}));

jest.mock('./publish-run-repo', () => ({
  updatePublishRun: jest.fn(),
  createPublishRunEvent: jest.fn(),
  reconcilePublishBatchWithRetry: jest.fn(),
}));

const reconcilePublishBatchWithRetryMock = reconcilePublishBatchWithRetry as jest.MockedFunction<
  typeof reconcilePublishBatchWithRetry
>;
const recoverStaleJobDescriptionPublishingMock =
  recoverStaleJobDescriptionPublishing as jest.MockedFunction<
    typeof recoverStaleJobDescriptionPublishing
  >;
const publishMock = publishJobDescriptionToBossLike as jest.MockedFunction<
  typeof publishJobDescriptionToBossLike
>;
const updatePublishRunMock = updatePublishRun as jest.MockedFunction<typeof updatePublishRun>;
const createPublishRunEventMock = createPublishRunEvent as jest.MockedFunction<
  typeof createPublishRunEvent
>;

const now = '2026-07-13T10:00:00.000Z';

const run: JobDescriptionPublishRunDto = {
  id: 'run-1',
  userId: 'u1',
  jobDescriptionId: 'jd-1',
  batchId: 'batch-1',
  platform: 'boss-like',
  status: 'pending',
  currentStage: 'queued',
  errorMessage: null,
  publishTaskId: null,
  skillId: null,
  startedAt: null,
  finishedAt: null,
  createdAt: now,
  updatedAt: now,
};

const jobDescription = {
  id: 'jd-1',
  userId: 'u1',
  department: '技术部',
  position: '前端工程师',
  positionDescription: '负责前端',
  tone: 'tech',
  status: 'ready_to_publish',
  content: {
    title: '汽水音乐-前端工程师',
    summary: 'summary',
    responsibilities: [],
    requirements: [],
    bonus: [],
    highlights: [],
  },
  evaluation: null,
  generationMeta: null,
  salaryRange: '30-50K',
  workLocations: ['上海张江'],
  hiringTarget: 1,
  onboardedCount: 0,
  createdAt: now,
  updatedAt: now,
} as JobDescriptionDto;

const settings: PublishJobDescriptionSettings = {
  platform: 'boss-like',
  company: '字节跳动',
  salary: '30-50K',
  location: '上海张江、远程',
  keywords: ['React'],
};

describe('runPublishRun', () => {
  beforeEach(() => {
    jest.clearAllMocks();
    updatePublishRunMock.mockResolvedValue(run);
    createPublishRunEventMock.mockResolvedValue({
      id: 'event-1',
      userId: 'u1',
      runId: 'run-1',
      stage: 'publishing',
      level: 'info',
      message: 'ok',
      detail: null,
      createdAt: now,
    });
    reconcilePublishBatchWithRetryMock.mockResolvedValue(jobDescription);
    recoverStaleJobDescriptionPublishingMock.mockResolvedValue(jobDescription);
  });

  it('marks the JD published when boss-like publish succeeds', async () => {
    publishMock.mockResolvedValueOnce({
      taskId: 'task-1',
      skillId: 'skill-1',
      status: 'success',
      trace: {
        taskId: 'task-1',
        skillId: 'skill-1',
        status: 'success',
        steps: [],
        createdAt: now,
      },
    });

    await runPublishRun({ run, jobDescription, settings });

    expect(publishMock).toHaveBeenCalledWith({
      jobDescription,
      settings,
      batchId: 'batch-1',
    });
    expect(reconcilePublishBatchWithRetryMock).toHaveBeenCalledWith({
      userId: 'u1',
      id: 'jd-1',
      batchId: 'batch-1',
      mode: 'batch',
      result: 'success',
    });
    expect(updatePublishRunMock).toHaveBeenNthCalledWith(
      1,
      expect.objectContaining({ expectedStatus: 'pending', status: 'running' }),
    );
    expect(updatePublishRunMock).toHaveBeenNthCalledWith(
      2,
      expect.objectContaining({ expectedStatus: 'running', status: 'success' }),
    );
  });

  it('does not call the browser after losing the pending-to-running claim', async () => {
    updatePublishRunMock.mockResolvedValueOnce(null);

    await expect(runPublishRun({ run, jobDescription, settings })).resolves.toBeUndefined();

    expect(updatePublishRunMock).toHaveBeenCalledTimes(1);
    expect(updatePublishRunMock).toHaveBeenCalledWith(
      expect.objectContaining({ expectedStatus: 'pending', status: 'running' }),
    );
    expect(publishMock).not.toHaveBeenCalled();
    expect(createPublishRunEventMock).not.toHaveBeenCalled();
    expect(reconcilePublishBatchWithRetryMock).not.toHaveBeenCalled();
  });

  it('does not reconcile or write a completion event after losing the terminal CAS', async () => {
    updatePublishRunMock.mockResolvedValueOnce(run).mockResolvedValueOnce(null);
    publishMock.mockResolvedValueOnce({
      taskId: 'task-1',
      skillId: 'skill-1',
      status: 'success',
      trace: {
        taskId: 'task-1',
        skillId: 'skill-1',
        status: 'success',
        steps: [],
        createdAt: now,
      },
    });

    await expect(runPublishRun({ run, jobDescription, settings })).resolves.toBeUndefined();

    expect(updatePublishRunMock).toHaveBeenNthCalledWith(
      2,
      expect.objectContaining({ expectedStatus: 'running', status: 'success' }),
    );
    expect(reconcilePublishBatchWithRetryMock).not.toHaveBeenCalled();
    expect(createPublishRunEventMock).toHaveBeenCalledTimes(1);
    expect(createPublishRunEventMock).not.toHaveBeenCalledWith(
      expect.objectContaining({ stage: 'completed' }),
    );
  });

  it('does not reconcile or write a failure event when recovery already failed the run', async () => {
    updatePublishRunMock.mockResolvedValueOnce(run).mockResolvedValueOnce(null);
    publishMock.mockRejectedValueOnce(new Error('connection refused'));

    await expect(runPublishRun({ run, jobDescription, settings })).resolves.toBeUndefined();

    expect(updatePublishRunMock).toHaveBeenNthCalledWith(
      2,
      expect.objectContaining({ expectedStatus: 'running', status: 'failed' }),
    );
    expect(reconcilePublishBatchWithRetryMock).not.toHaveBeenCalled();
    expect(createPublishRunEventMock).toHaveBeenCalledTimes(1);
  });

  it('does not overwrite a successful run when batch reconciliation fails afterward', async () => {
    const consoleError = jest.spyOn(console, 'error').mockImplementation(() => {});
    publishMock.mockResolvedValueOnce({
      taskId: 'task-1',
      skillId: 'skill-1',
      status: 'success',
      trace: {
        taskId: 'task-1',
        skillId: 'skill-1',
        status: 'success',
        steps: [],
        createdAt: now,
      },
    });
    reconcilePublishBatchWithRetryMock.mockRejectedValueOnce(new Error('database busy'));

    await expect(runPublishRun({ run, jobDescription, settings })).resolves.toBeUndefined();

    expect(updatePublishRunMock).toHaveBeenCalledWith(
      expect.objectContaining({ runId: 'run-1', status: 'success' }),
    );
    expect(updatePublishRunMock).not.toHaveBeenCalledWith(
      expect.objectContaining({ runId: 'run-1', status: 'failed' }),
    );
    expect(reconcilePublishBatchWithRetryMock).toHaveBeenCalledTimes(1);
    consoleError.mockRestore();
  });

  it('recovers from the successful task instead of downgrading when run success persistence fails', async () => {
    const consoleError = jest.spyOn(console, 'error').mockImplementation(() => {});
    updatePublishRunMock
      .mockResolvedValueOnce(run)
      .mockRejectedValueOnce(new Error('run outcome write failed'));
    publishMock.mockResolvedValueOnce({
      taskId: 'task-1',
      skillId: 'skill-1',
      status: 'success',
      trace: {
        taskId: 'task-1',
        skillId: 'skill-1',
        status: 'success',
        steps: [],
        createdAt: now,
      },
    });

    await expect(runPublishRun({ run, jobDescription, settings })).resolves.toBeUndefined();

    expect(publishMock).toHaveBeenCalledTimes(1);
    expect(updatePublishRunMock).toHaveBeenCalledTimes(2);
    expect(updatePublishRunMock).not.toHaveBeenCalledWith(
      expect.objectContaining({ runId: 'run-1', status: 'failed' }),
    );
    expect(recoverStaleJobDescriptionPublishingMock).toHaveBeenCalledWith({
      userId: 'u1',
      id: 'jd-1',
    });
    expect(reconcilePublishBatchWithRetryMock).not.toHaveBeenCalled();
    expect(createPublishRunEventMock).toHaveBeenCalledTimes(1);
    consoleError.mockRestore();
  });

  it('keeps a successful run terminal after reconciliation exhausts finite retries', async () => {
    const consoleError = jest.spyOn(console, 'error').mockImplementation(() => {});
    publishMock.mockResolvedValueOnce({
      taskId: 'task-1',
      skillId: 'skill-1',
      status: 'success',
      trace: {
        taskId: 'task-1',
        skillId: 'skill-1',
        status: 'success',
        steps: [],
        createdAt: now,
      },
    });
    reconcilePublishBatchWithRetryMock.mockRejectedValue(new Error('database unavailable'));

    await expect(runPublishRun({ run, jobDescription, settings })).resolves.toBeUndefined();

    expect(reconcilePublishBatchWithRetryMock).toHaveBeenCalledTimes(1);
    expect(updatePublishRunMock).not.toHaveBeenCalledWith(
      expect.objectContaining({ runId: 'run-1', status: 'failed' }),
    );
    consoleError.mockRestore();
  });

  it('does not overwrite a successful run when its completion event fails', async () => {
    const consoleError = jest.spyOn(console, 'error').mockImplementation(() => {});
    publishMock.mockResolvedValueOnce({
      taskId: 'task-1',
      skillId: 'skill-1',
      status: 'success',
      trace: {
        taskId: 'task-1',
        skillId: 'skill-1',
        status: 'success',
        steps: [],
        createdAt: now,
      },
    });
    createPublishRunEventMock
      .mockResolvedValueOnce({
        id: 'event-start',
        userId: 'u1',
        runId: 'run-1',
        stage: 'publishing',
        level: 'info',
        message: 'ok',
        detail: null,
        createdAt: now,
      })
      .mockRejectedValueOnce(new Error('event insert failed'));

    await expect(runPublishRun({ run, jobDescription, settings })).resolves.toBeUndefined();

    expect(updatePublishRunMock).toHaveBeenCalledWith(
      expect.objectContaining({ runId: 'run-1', status: 'success' }),
    );
    expect(updatePublishRunMock).not.toHaveBeenCalledWith(
      expect.objectContaining({ runId: 'run-1', status: 'failed' }),
    );
    consoleError.mockRestore();
  });

  it('marks the JD publish_failed when boss-like publish fails', async () => {
    publishMock.mockResolvedValueOnce({
      taskId: 'task-1',
      skillId: 'skill-1',
      status: 'failed',
      trace: {
        taskId: 'task-1',
        skillId: 'skill-1',
        status: 'failed',
        steps: [
          {
            stepId: 's1',
            action: 'click',
            params: {},
            result: { success: false, error: 'boom' },
          },
        ],
        createdAt: now,
      },
    });

    await runPublishRun({ run, jobDescription, settings });

    expect(reconcilePublishBatchWithRetryMock).toHaveBeenCalledWith({
      userId: 'u1',
      id: 'jd-1',
      batchId: 'batch-1',
      mode: 'batch',
      result: 'failed',
    });
  });

  it('marks the JD publish_failed when publish throws', async () => {
    const consoleError = jest.spyOn(console, 'error').mockImplementation(() => {});
    publishMock.mockRejectedValueOnce(new Error('connection refused'));
    reconcilePublishBatchWithRetryMock.mockRejectedValueOnce(new Error('database busy'));

    await runPublishRun({ run, jobDescription, settings });

    expect(reconcilePublishBatchWithRetryMock).toHaveBeenCalledWith({
      userId: 'u1',
      id: 'jd-1',
      batchId: 'batch-1',
      mode: 'batch',
      result: 'failed',
    });
    expect(reconcilePublishBatchWithRetryMock).toHaveBeenCalledTimes(1);
    consoleError.mockRestore();
  });
});
