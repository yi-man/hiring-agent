/** @jest-environment node */

import { reconcileJobDescriptionPublishResult } from '@/lib/jd/job-description-repo';
import {
  reconcilePublishBatchWithRetry,
  reconcileTerminalPublishRunWithRetry,
  type JobDescriptionPublishRunDto,
} from './publish-run-repo';

jest.mock('@/lib/prisma', () => ({ prisma: {} }));
jest.mock('@/lib/jd/job-description-repo', () => ({
  reconcileJobDescriptionPublishResult: jest.fn(),
}));

const reconcileMock = reconcileJobDescriptionPublishResult as jest.MockedFunction<
  typeof reconcileJobDescriptionPublishResult
>;

const timestamp = '2026-07-20T12:30:00.000Z';
const terminalRun: JobDescriptionPublishRunDto = {
  id: 'run-1',
  userId: 'u1',
  jobDescriptionId: 'jd-1',
  batchId: 'batch-1',
  platform: 'boss',
  status: 'success',
  currentStage: 'completed',
  errorMessage: null,
  publishTaskId: 'task-1',
  skillId: 'skill-1',
  startedAt: timestamp,
  finishedAt: timestamp,
  createdAt: timestamp,
  updatedAt: timestamp,
};

describe('publish run reconciliation recovery', () => {
  beforeEach(() => {
    reconcileMock.mockReset();
  });

  it('retries with bounded exponential delays and returns after recovery', async () => {
    const wait = jest.fn().mockResolvedValue(undefined);
    reconcileMock
      .mockRejectedValueOnce(new Error('first'))
      .mockRejectedValueOnce(new Error('second'))
      .mockResolvedValueOnce(null);

    await expect(
      reconcilePublishBatchWithRetry(
        {
          userId: 'u1',
          id: 'jd-1',
          batchId: 'batch-1',
          mode: 'batch',
          result: 'success',
        },
        { maxAttempts: 3, wait },
      ),
    ).resolves.toBeNull();

    expect(reconcileMock).toHaveBeenCalledTimes(3);
    expect(wait).toHaveBeenNthCalledWith(1, 25);
    expect(wait).toHaveBeenNthCalledWith(2, 50);
  });

  it('stops after the configured maximum number of attempts', async () => {
    const wait = jest.fn().mockResolvedValue(undefined);
    reconcileMock.mockRejectedValue(new Error('database unavailable'));

    await expect(
      reconcilePublishBatchWithRetry(
        {
          userId: 'u1',
          id: 'jd-1',
          batchId: 'batch-1',
          mode: 'batch',
          result: 'failed',
        },
        { maxAttempts: 2, wait },
      ),
    ).rejects.toThrow('database unavailable');

    expect(reconcileMock).toHaveBeenCalledTimes(2);
    expect(wait).toHaveBeenCalledTimes(1);
  });

  it.each(['success', 'failed'] as const)(
    'self-heals from a %s run using its persisted batch identity',
    async (status) => {
      reconcileMock.mockResolvedValueOnce(null);

      await expect(
        reconcileTerminalPublishRunWithRetry(
          { ...terminalRun, status },
          {
            maxAttempts: 1,
          },
        ),
      ).resolves.toBe(true);

      expect(reconcileMock).toHaveBeenCalledWith({
        userId: 'u1',
        id: 'jd-1',
        batchId: 'batch-1',
        mode: 'batch',
        result: status,
      });
    },
  );

  it('does not reconcile a non-terminal run', async () => {
    await expect(
      reconcileTerminalPublishRunWithRetry({
        ...terminalRun,
        status: 'running',
        currentStage: 'publishing',
        finishedAt: null,
      }),
    ).resolves.toBe(false);

    expect(reconcileMock).not.toHaveBeenCalled();
  });
});
