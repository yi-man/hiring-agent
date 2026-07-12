/** @jest-environment node */

import { createAndStartJobDescriptionCreateRun } from './create-run-service';
import {
  createJobDescriptionCreateRun,
  createJobDescriptionCreateRunEvent,
  type JobDescriptionCreateRunDto,
} from './create-run-repo';
import { runJobDescriptionCreateRun } from './create-run-runner';
import type { CreateJobDescriptionRequest } from '@/types';

jest.mock('./create-run-repo', () => ({
  createJobDescriptionCreateRun: jest.fn(),
  createJobDescriptionCreateRunEvent: jest.fn(),
}));

jest.mock('./create-run-runner', () => ({
  runJobDescriptionCreateRun: jest.fn().mockResolvedValue(undefined),
}));

const createRunMock = createJobDescriptionCreateRun as jest.MockedFunction<
  typeof createJobDescriptionCreateRun
>;
const createEventMock = createJobDescriptionCreateRunEvent as jest.MockedFunction<
  typeof createJobDescriptionCreateRunEvent
>;
const runCreateRunMock = runJobDescriptionCreateRun as jest.MockedFunction<
  typeof runJobDescriptionCreateRun
>;

const now = '2026-07-10T08:00:00.000Z';

const request: CreateJobDescriptionRequest = {
  department: '技术部',
  position: '高级前端工程师',
  positionDescription: '负责招聘工作台体验',
  salaryRange: '25-40K',
  workLocations: ['上海'],
  tone: 'tech',
};

function makeRun(overrides: Partial<JobDescriptionCreateRunDto> = {}): JobDescriptionCreateRunDto {
  return {
    id: 'jd-create-run-1',
    userId: 'u1',
    jobDescriptionId: null,
    department: request.department,
    position: request.position,
    positionDescription: request.positionDescription,
    salaryRange: request.salaryRange,
    workLocations: request.workLocations,
    tone: 'tech',
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

describe('JD create run service', () => {
  beforeEach(() => {
    createRunMock.mockReset();
    createEventMock.mockReset();
    runCreateRunMock.mockReset();
    runCreateRunMock.mockResolvedValue(undefined);
  });

  it('creates a pending run, records the first event, and starts generation asynchronously', async () => {
    const run = makeRun();
    createRunMock.mockResolvedValueOnce(run);
    createEventMock.mockResolvedValueOnce({
      id: 'event-1',
      userId: 'u1',
      runId: run.id,
      stage: 'queued',
      level: 'info',
      message: 'JD 生成任务已创建',
      detail: null,
      createdAt: now,
    });

    const result = await createAndStartJobDescriptionCreateRun({
      userId: 'u1',
      request,
    });

    expect(result).toBe(run);
    expect(createRunMock).toHaveBeenCalledWith({
      userId: 'u1',
      request,
      status: 'pending',
      currentStage: 'queued',
    });
    expect(createEventMock).toHaveBeenCalledWith({
      userId: 'u1',
      runId: run.id,
      stage: 'queued',
      level: 'info',
      message: 'JD 生成任务已创建',
      detail: {
        department: '技术部',
        position: '高级前端工程师',
        salaryRange: '25-40K',
        workLocations: ['上海'],
      },
    });
    expect(runCreateRunMock).toHaveBeenCalledWith({ userId: 'u1', runId: run.id });
    expect(createRunMock.mock.invocationCallOrder[0]).toBeLessThan(
      runCreateRunMock.mock.invocationCallOrder[0] ?? Number.POSITIVE_INFINITY,
    );
  });

  it('returns the run without waiting for generation to finish', async () => {
    const run = makeRun();
    let resolveRunner!: () => void;
    createRunMock.mockResolvedValueOnce(run);
    createEventMock.mockResolvedValueOnce({
      id: 'event-1',
      userId: 'u1',
      runId: run.id,
      stage: 'queued',
      level: 'info',
      message: 'JD 生成任务已创建',
      detail: null,
      createdAt: now,
    });
    runCreateRunMock.mockReturnValueOnce(
      new Promise<void>((resolve) => {
        resolveRunner = resolve;
      }),
    );

    const resultPromise = createAndStartJobDescriptionCreateRun({
      userId: 'u1',
      request,
    });

    await Promise.resolve();
    await Promise.resolve();

    await expect(Promise.race([resultPromise, Promise.resolve('still-waiting')])).resolves.toBe(
      run,
    );
    expect(runCreateRunMock).toHaveBeenCalledWith({ userId: 'u1', runId: run.id });

    resolveRunner();
  });
});
