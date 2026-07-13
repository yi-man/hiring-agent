/** @jest-environment node */

import { updateJobDescription } from '@/lib/jd/job-description-repo';
import type { JobDescriptionDto } from '@/types';
import { publishJobDescriptionToBossLike } from './service';
import {
  createPublishRunEvent,
  updatePublishRun,
  type JobDescriptionPublishRunDto,
} from './publish-run-repo';
import { runPublishRun } from './publish-run-runner';
import type { PublishJobDescriptionSettings } from './types';

jest.mock('@/lib/jd/job-description-repo', () => ({
  updateJobDescription: jest.fn(),
}));

jest.mock('./service', () => ({
  publishJobDescriptionToBossLike: jest.fn(),
}));

jest.mock('./publish-run-repo', () => ({
  updatePublishRun: jest.fn(),
  createPublishRunEvent: jest.fn(),
}));

const updateJobDescriptionMock = updateJobDescription as jest.MockedFunction<
  typeof updateJobDescription
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
    updateJobDescriptionMock.mockResolvedValue(jobDescription);
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

    expect(updateJobDescriptionMock).toHaveBeenCalledWith({
      userId: 'u1',
      id: 'jd-1',
      status: 'publishing',
    });
    expect(updateJobDescriptionMock).toHaveBeenCalledWith({
      userId: 'u1',
      id: 'jd-1',
      status: 'published',
    });
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

    expect(updateJobDescriptionMock).toHaveBeenCalledWith({
      userId: 'u1',
      id: 'jd-1',
      status: 'publish_failed',
    });
  });

  it('marks the JD publish_failed when publish throws', async () => {
    publishMock.mockRejectedValueOnce(new Error('connection refused'));

    await runPublishRun({ run, jobDescription, settings });

    expect(updateJobDescriptionMock).toHaveBeenCalledWith({
      userId: 'u1',
      id: 'jd-1',
      status: 'publish_failed',
    });
  });
});
