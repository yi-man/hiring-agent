/** @jest-environment node */

import { createAndStartJobDescriptionRegenerateRun } from './regenerate-run-service';
import {
  createJobDescriptionRegenerateRun,
  createJobDescriptionRegenerateRunEvent,
  type JobDescriptionRegenerateRunDto,
} from './regenerate-run-repo';
import { runJobDescriptionRegenerateRun } from './regenerate-run-runner';
import type { JD } from '@/types';

jest.mock('./regenerate-run-repo', () => ({
  createJobDescriptionRegenerateRun: jest.fn(),
  createJobDescriptionRegenerateRunEvent: jest.fn(),
}));

jest.mock('./regenerate-run-runner', () => ({
  runJobDescriptionRegenerateRun: jest.fn().mockResolvedValue(undefined),
}));

const createRunMock = createJobDescriptionRegenerateRun as jest.MockedFunction<
  typeof createJobDescriptionRegenerateRun
>;
const createEventMock = createJobDescriptionRegenerateRunEvent as jest.MockedFunction<
  typeof createJobDescriptionRegenerateRunEvent
>;
const runRegenMock = runJobDescriptionRegenerateRun as jest.MockedFunction<
  typeof runJobDescriptionRegenerateRun
>;

const now = '2026-07-13T08:00:00.000Z';

const currentJd: JD = {
  title: '高级前端工程师',
  summary: '摘要',
  responsibilities: ['职责'],
  requirements: ['要求'],
  bonus: [],
  highlights: [],
};

function makeRun(
  overrides: Partial<JobDescriptionRegenerateRunDto> = {},
): JobDescriptionRegenerateRunDto {
  return {
    id: 'jd-regen-run-1',
    userId: 'u1',
    jobDescriptionId: 'jd-1',
    tone: 'tech',
    extraInstruction: '强调 AI',
    currentJd,
    status: 'pending',
    currentStage: 'queued',
    errorMessage: null,
    startedAt: null,
    finishedAt: null,
    createdAt: now,
    updatedAt: now,
    ...overrides,
  };
}

describe('JD regenerate run service', () => {
  beforeEach(() => {
    createRunMock.mockReset();
    createEventMock.mockReset();
    runRegenMock.mockReset();
    runRegenMock.mockResolvedValue(undefined);
  });

  it('creates a pending run, records the queued event, and starts generation asynchronously', async () => {
    const run = makeRun();
    createRunMock.mockResolvedValueOnce(run);
    createEventMock.mockResolvedValueOnce({
      id: 'event-1',
      userId: 'u1',
      runId: run.id,
      jobDescriptionId: 'jd-1',
      stage: 'queued',
      level: 'info',
      message: 'JD 重新生成任务已创建',
      detail: null,
      createdAt: now,
    });

    const result = await createAndStartJobDescriptionRegenerateRun({
      userId: 'u1',
      jobDescriptionId: 'jd-1',
      tone: 'tech',
      extraInstruction: '强调 AI',
      currentJd,
    });

    expect(result).toBe(run);
    expect(createRunMock).toHaveBeenCalledWith({
      userId: 'u1',
      jobDescriptionId: 'jd-1',
      tone: 'tech',
      extraInstruction: '强调 AI',
      currentJd,
      status: 'pending',
      currentStage: 'queued',
    });
    expect(createEventMock).toHaveBeenCalledWith({
      userId: 'u1',
      runId: run.id,
      jobDescriptionId: 'jd-1',
      stage: 'queued',
      level: 'info',
      message: 'JD 重新生成任务已创建',
      detail: {
        tone: 'tech',
        extraInstruction: '强调 AI',
      },
    });
    expect(runRegenMock).toHaveBeenCalledWith({ userId: 'u1', runId: run.id });
  });
});
