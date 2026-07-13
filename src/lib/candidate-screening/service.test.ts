/** @jest-environment node */

import { createAndStartCandidateScreeningRun } from './service';
import { createCandidateScreeningRun, type CandidateScreeningRunDto } from './repo';
import { runCandidateScreening } from './runner';
import type { CreateScreeningRunRequest, ScreeningRunStats } from './types';
import type { JobDescriptionDto } from '@/types';

jest.mock('./repo', () => ({
  createCandidateScreeningRun: jest.fn(),
}));

jest.mock('./runner', () => ({
  createEmptyStats: jest.fn(() => ({
    fetched: 0,
    deduped: 0,
    stored: 0,
    vectorRecalled: 0,
    evaluated: 0,
    recommendedChat: 0,
    recommendedCollect: 0,
    skipped: 0,
    failed: 0,
  })),
  runCandidateScreening: jest.fn().mockResolvedValue(undefined),
}));

const createRunMock = createCandidateScreeningRun as jest.MockedFunction<
  typeof createCandidateScreeningRun
>;
const runCandidateScreeningMock = runCandidateScreening as jest.MockedFunction<
  typeof runCandidateScreening
>;

const createdAt = '2026-06-01T00:00:00.000Z';
const updatedAt = '2026-06-01T00:00:00.000Z';

const jobDescription: JobDescriptionDto = {
  id: 'jd-1',
  userId: 'user-1',
  department: 'Engineering',
  position: 'Frontend Engineer',
  positionDescription: 'Build hiring workflows',
  salaryRange: null,
  workLocations: [],
  tone: 'formal',
  status: 'created',
  content: {
    title: 'Frontend Engineer',
    summary: 'Build modern UIs',
    responsibilities: ['Build React apps'],
    requirements: ['React'],
    highlights: ['AI workflow'],
    bonus: ['Next.js'],
  },
  evaluation: null,
  generationMeta: null,
  createdAt,
  updatedAt,
};

const request: CreateScreeningRunRequest = {
  platform: 'boss-like',
  mode: 'dry_run',
  maxCandidates: 20,
  batchSize: 10,
  allowAlreadyContacted: false,
};

function emptyStats(overrides: Partial<ScreeningRunStats> = {}): ScreeningRunStats {
  return {
    fetched: 0,
    deduped: 0,
    stored: 0,
    vectorRecalled: 0,
    evaluated: 0,
    recommendedChat: 0,
    recommendedCollect: 0,
    skipped: 0,
    failed: 0,
    ...overrides,
  };
}

function makeRun(overrides: Partial<CandidateScreeningRunDto> = {}): CandidateScreeningRunDto {
  return {
    id: 'run-1',
    userId: 'user-1',
    jobDescriptionId: 'jd-1',
    platform: 'boss-like',
    mode: 'dry_run',
    status: 'pending',
    currentStage: null,
    skillId: null,
    currentWorkflowStep: null,
    searchPlan: null,
    evaluationSchema: null,
    stats: emptyStats(),
    errorMessage: null,
    startedAt: null,
    finishedAt: null,
    createdAt,
    updatedAt,
    ...overrides,
  };
}

describe('candidate screening service', () => {
  beforeEach(() => {
    createRunMock.mockReset();
    runCandidateScreeningMock.mockReset();
    runCandidateScreeningMock.mockResolvedValue(undefined);
  });

  it('creates a pending run and schedules the runner after persistence', async () => {
    const run = makeRun();
    createRunMock.mockResolvedValueOnce(run);

    const result = await createAndStartCandidateScreeningRun({
      userId: 'user-1',
      jobDescription,
      request,
    });

    expect(result).toBe(run);
    expect(createRunMock).toHaveBeenCalledWith({
      userId: 'user-1',
      jobDescriptionId: 'jd-1',
      platform: 'boss-like',
      mode: 'dry_run',
      status: 'pending',
      stats: emptyStats(),
    });
    expect(runCandidateScreeningMock).toHaveBeenCalledWith({
      runId: 'run-1',
      userId: 'user-1',
      jobDescription,
      request,
    });
    expect(createRunMock.mock.invocationCallOrder[0]).toBeLessThan(
      runCandidateScreeningMock.mock.invocationCallOrder[0] ?? Number.POSITIVE_INFINITY,
    );
  });

  it('observes background runner rejections from fire-and-forget scheduling', async () => {
    const run = makeRun();
    const error = new Error('background failed');
    const catchMock = jest.fn();
    const consoleErrorSpy = jest.spyOn(console, 'error').mockImplementation(() => undefined);
    createRunMock.mockResolvedValueOnce(run);
    runCandidateScreeningMock.mockReturnValueOnce({
      catch: catchMock,
    } as unknown as Promise<void>);

    await createAndStartCandidateScreeningRun({
      userId: 'user-1',
      jobDescription,
      request,
    });

    expect(catchMock).toHaveBeenCalledWith(expect.any(Function));
    const rejectionHandler = catchMock.mock.calls[0]?.[0] as (reason: unknown) => void;
    rejectionHandler(error);
    expect(consoleErrorSpy).toHaveBeenCalledWith('Candidate screening run failed', {
      runId: 'run-1',
      error,
    });
    consoleErrorSpy.mockRestore();
  });
});
