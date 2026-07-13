/** @jest-environment node */

import { runJobDescriptionRegenerateRun } from './regenerate-run-runner';
import {
  createJobDescriptionRegenerateRunEvent,
  getJobDescriptionRegenerateRun,
  updateJobDescriptionRegenerateRun,
  type JobDescriptionRegenerateRunDto,
} from './regenerate-run-repo';
import { getJobDescriptionById, updateMutableJobDescription } from './job-description-repo';
import { JDAgentContextRetrievalError, runJDAgent } from '@/lib/jd-agent/service';
import type { JDAgentResponse } from '@/types';

jest.mock('./regenerate-run-repo', () => ({
  createJobDescriptionRegenerateRunEvent: jest.fn(),
  getJobDescriptionRegenerateRun: jest.fn(),
  updateJobDescriptionRegenerateRun: jest.fn(),
}));

jest.mock('./job-description-repo', () => ({
  getJobDescriptionById: jest.fn(),
  updateMutableJobDescription: jest.fn(),
}));

jest.mock('@/lib/jd-agent/service', () => {
  class JDAgentContextRetrievalError extends Error {
    constructor(message: string) {
      super(message);
      this.name = 'JDAgentContextRetrievalError';
    }
  }
  return {
    JDAgentContextRetrievalError,
    runJDAgent: jest.fn(),
  };
});

const getRunMock = getJobDescriptionRegenerateRun as jest.MockedFunction<
  typeof getJobDescriptionRegenerateRun
>;
const updateRunMock = updateJobDescriptionRegenerateRun as jest.MockedFunction<
  typeof updateJobDescriptionRegenerateRun
>;
const createEventMock = createJobDescriptionRegenerateRunEvent as jest.MockedFunction<
  typeof createJobDescriptionRegenerateRunEvent
>;
const getJdMock = getJobDescriptionById as jest.MockedFunction<typeof getJobDescriptionById>;
const updateJdMock = updateMutableJobDescription as jest.MockedFunction<
  typeof updateMutableJobDescription
>;
const runJDAgentMock = runJDAgent as jest.MockedFunction<typeof runJDAgent>;

const now = '2026-07-13T08:00:00.000Z';

const currentJd = {
  title: '高级前端工程师',
  summary: '负责招聘助手工作台体验建设。',
  responsibilities: ['建设 JD 生成流程'],
  requirements: ['熟悉 TypeScript'],
  bonus: ['了解 RAG'],
  highlights: ['AI 招聘工作台'],
};

function makeRun(
  overrides: Partial<JobDescriptionRegenerateRunDto> = {},
): JobDescriptionRegenerateRunDto {
  return {
    id: 'jd-regen-run-1',
    userId: 'u1',
    jobDescriptionId: 'jd-1',
    tone: 'tech',
    extraInstruction: '强调 AI 招聘经验',
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

const agentResponse: JDAgentResponse = {
  jd: {
    ...currentJd,
    summary: '改写后的摘要，强调 AI 招聘经验。',
  },
  evaluation: {
    scores: {
      clarity: 90,
      completeness: 86,
      attractiveness: 82,
      specificity: 84,
    },
    issues: [],
    evidence: ['职责清晰'],
    suggestions: [],
    rewrite_required: false,
  },
  decision: {
    improved: true,
    picked: 'improved',
  },
  meta: {
    model: 'mock-jd-agent',
    promptVersion: 'jd_v3.2',
    action: 'continue_generate',
    timing: {
      totalMs: 2345,
      stages: [
        { id: 'evaluate', label: '评估', ms: 400 },
        { id: 'improve', label: '改写', ms: 1500 },
      ],
      suggestions: [],
    },
    tokens: {
      total: { promptTokens: 400, completionTokens: 300, totalTokens: 700 },
      stages: [],
    },
    context: {
      used: true,
      query: '高级前端工程师',
      textLength: 800,
      matches: [
        {
          documentId: 'doc-1',
          chunkId: 'chunk-1',
          chunkIndex: 0,
          filename: 'company.md',
          title: '公司招聘手册',
          sourceLabel: null,
          score: 0.9,
        },
      ],
      warnings: [],
    },
  },
  warnings: [],
};

describe('JD regenerate run runner', () => {
  beforeEach(() => {
    getRunMock.mockReset();
    updateRunMock.mockReset();
    createEventMock.mockReset();
    getJdMock.mockReset();
    updateJdMock.mockReset();
    runJDAgentMock.mockReset();
    createEventMock.mockImplementation(async (params) => ({
      id: `event-${createEventMock.mock.calls.length}`,
      userId: params.userId,
      runId: params.runId,
      jobDescriptionId: params.jobDescriptionId,
      stage: params.stage,
      level: params.level ?? 'info',
      message: params.message,
      detail: params.detail ?? null,
      createdAt: now,
    }));
    updateRunMock.mockImplementation(async (params) =>
      makeRun({
        id: params.runId,
        status: params.status,
        currentStage: params.currentStage,
        errorMessage: params.errorMessage,
        startedAt: params.startedAt?.toISOString() ?? null,
        finishedAt: params.finishedAt?.toISOString() ?? null,
      }),
    );
  });

  it('runs continue_generate, updates JD in place, and records progress events', async () => {
    const run = makeRun();
    getRunMock.mockResolvedValueOnce(run);
    getJdMock.mockResolvedValueOnce({
      id: 'jd-1',
      userId: 'u1',
      department: '技术部',
      position: '高级前端工程师',
      positionDescription: '负责招聘工作台体验',
      salaryRange: '25-40K',
      workLocations: ['上海'],
      tone: 'tech',
      status: 'created',
      content: currentJd,
      evaluation: null,
      generationMeta: null,
      createdAt: now,
      updatedAt: now,
    });
    runJDAgentMock.mockResolvedValueOnce(agentResponse);
    updateJdMock.mockResolvedValueOnce({
      id: 'jd-1',
      userId: 'u1',
      department: '技术部',
      position: '高级前端工程师',
      positionDescription: '负责招聘工作台体验',
      salaryRange: '25-40K',
      workLocations: ['上海'],
      tone: 'tech',
      status: 'created',
      content: agentResponse.jd,
      evaluation: agentResponse.evaluation,
      generationMeta: agentResponse.meta,
      createdAt: now,
      updatedAt: now,
    });

    await runJobDescriptionRegenerateRun({ userId: 'u1', runId: 'jd-regen-run-1' });

    expect(runJDAgentMock).toHaveBeenCalledWith(
      {
        action: 'continue_generate',
        currentJd: run.currentJd,
        extraInstruction: run.extraInstruction,
        tone: run.tone,
      },
      { userId: 'u1' },
    );
    expect(updateJdMock).toHaveBeenCalledWith(
      expect.objectContaining({
        userId: 'u1',
        id: 'jd-1',
        content: agentResponse.jd,
        evaluation: agentResponse.evaluation,
        generationMeta: agentResponse.meta,
        tone: 'tech',
        status: 'created',
      }),
    );
    expect(updateRunMock).toHaveBeenLastCalledWith(
      expect.objectContaining({
        userId: 'u1',
        runId: 'jd-regen-run-1',
        status: 'success',
        currentStage: 'completed',
        errorMessage: null,
        finishedAt: expect.any(Date),
      }),
    );
    expect(createEventMock).toHaveBeenCalledWith(
      expect.objectContaining({
        stage: 'completed',
        level: 'success',
        message: 'JD 重新生成完成',
        detail: { jobDescriptionId: 'jd-1' },
      }),
    );
  });

  it('no-ops when the run is already terminal', async () => {
    getRunMock.mockResolvedValueOnce(makeRun({ status: 'success', currentStage: 'completed' }));

    await runJobDescriptionRegenerateRun({ userId: 'u1', runId: 'jd-regen-run-1' });

    expect(runJDAgentMock).not.toHaveBeenCalled();
    expect(updateJdMock).not.toHaveBeenCalled();
    expect(updateRunMock).not.toHaveBeenCalled();
  });

  it('fails when the JD is published during input_preparation', async () => {
    getRunMock.mockResolvedValueOnce(makeRun());
    getJdMock.mockResolvedValueOnce({
      id: 'jd-1',
      userId: 'u1',
      department: '技术部',
      position: '高级前端工程师',
      positionDescription: '负责招聘工作台体验',
      salaryRange: '25-40K',
      workLocations: ['上海'],
      tone: 'tech',
      status: 'published',
      content: currentJd,
      evaluation: null,
      generationMeta: null,
      createdAt: now,
      updatedAt: now,
    });

    await runJobDescriptionRegenerateRun({ userId: 'u1', runId: 'jd-regen-run-1' });

    expect(runJDAgentMock).not.toHaveBeenCalled();
    expect(updateRunMock).toHaveBeenLastCalledWith(
      expect.objectContaining({
        status: 'failed',
        currentStage: 'input_preparation',
        errorMessage: expect.stringMatching(/published|已发布|不可/),
        finishedAt: expect.any(Date),
      }),
    );
  });

  it('fails when updateMutableJobDescription returns null', async () => {
    getRunMock.mockResolvedValueOnce(makeRun());
    getJdMock.mockResolvedValueOnce({
      id: 'jd-1',
      userId: 'u1',
      department: '技术部',
      position: '高级前端工程师',
      positionDescription: '负责招聘工作台体验',
      salaryRange: '25-40K',
      workLocations: ['上海'],
      tone: 'tech',
      status: 'created',
      content: currentJd,
      evaluation: null,
      generationMeta: null,
      createdAt: now,
      updatedAt: now,
    });
    runJDAgentMock.mockResolvedValueOnce(agentResponse);
    updateJdMock.mockResolvedValueOnce(null);

    await runJobDescriptionRegenerateRun({ userId: 'u1', runId: 'jd-regen-run-1' });

    expect(updateRunMock).toHaveBeenLastCalledWith(
      expect.objectContaining({
        status: 'failed',
        currentStage: 'saving',
        finishedAt: expect.any(Date),
      }),
    );
  });

  it('records JD_CONTEXT_RETRIEVAL_FAILED in event detail on context errors', async () => {
    getRunMock.mockResolvedValueOnce(makeRun());
    getJdMock.mockResolvedValueOnce({
      id: 'jd-1',
      userId: 'u1',
      department: '技术部',
      position: '高级前端工程师',
      positionDescription: '负责招聘工作台体验',
      salaryRange: '25-40K',
      workLocations: ['上海'],
      tone: 'tech',
      status: 'created',
      content: currentJd,
      evaluation: null,
      generationMeta: null,
      createdAt: now,
      updatedAt: now,
    });
    runJDAgentMock.mockRejectedValueOnce(new JDAgentContextRetrievalError('公司上下文检索失败'));

    await runJobDescriptionRegenerateRun({ userId: 'u1', runId: 'jd-regen-run-1' });

    expect(updateRunMock).toHaveBeenLastCalledWith(
      expect.objectContaining({
        status: 'failed',
        errorMessage: '公司上下文检索失败',
      }),
    );
    expect(createEventMock).toHaveBeenCalledWith(
      expect.objectContaining({
        level: 'error',
        message: '公司上下文检索失败',
        detail: expect.objectContaining({ code: 'JD_CONTEXT_RETRIEVAL_FAILED' }),
      }),
    );
  });
});
