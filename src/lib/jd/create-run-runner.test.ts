/** @jest-environment node */

import { runJobDescriptionCreateRun } from './create-run-runner';
import {
  createJobDescriptionCreateRunEvent,
  getJobDescriptionCreateRun,
  updateJobDescriptionCreateRun,
  type JobDescriptionCreateRunDto,
} from './create-run-repo';
import { createJobDescription } from './job-description-repo';
import { runJDAgent } from '@/lib/jd-agent/service';
import type { JDAgentResponse } from '@/types';

jest.mock('./create-run-repo', () => ({
  createJobDescriptionCreateRunEvent: jest.fn(),
  getJobDescriptionCreateRun: jest.fn(),
  updateJobDescriptionCreateRun: jest.fn(),
}));

jest.mock('./job-description-repo', () => ({
  createJobDescription: jest.fn(),
}));

jest.mock('@/lib/jd-agent/service', () => ({
  runJDAgent: jest.fn(),
}));

const getRunMock = getJobDescriptionCreateRun as jest.MockedFunction<
  typeof getJobDescriptionCreateRun
>;
const updateRunMock = updateJobDescriptionCreateRun as jest.MockedFunction<
  typeof updateJobDescriptionCreateRun
>;
const createEventMock = createJobDescriptionCreateRunEvent as jest.MockedFunction<
  typeof createJobDescriptionCreateRunEvent
>;
const createJobDescriptionMock = createJobDescription as jest.MockedFunction<
  typeof createJobDescription
>;
const runJDAgentMock = runJDAgent as jest.MockedFunction<typeof runJDAgent>;

const now = '2026-07-10T08:00:00.000Z';

function makeRun(overrides: Partial<JobDescriptionCreateRunDto> = {}): JobDescriptionCreateRunDto {
  return {
    id: 'jd-create-run-1',
    userId: 'u1',
    jobDescriptionId: null,
    department: '技术部',
    position: '高级前端工程师',
    positionDescription: '负责招聘工作台体验',
    salaryRange: '25-40K',
    workLocations: ['上海'],
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

const agentResponse: JDAgentResponse = {
  jd: {
    title: '高级前端工程师',
    summary: '负责招聘助手工作台体验建设。',
    responsibilities: ['建设 JD 生成流程'],
    requirements: ['熟悉 TypeScript'],
    bonus: ['了解 RAG'],
    highlights: ['AI 招聘工作台'],
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
    improved: false,
    picked: 'original',
  },
  meta: {
    model: 'mock-jd-agent',
    promptVersion: 'jd_v3.2',
    action: 'initial_generate',
    timing: {
      totalMs: 1234,
      stages: [
        { id: 'context', label: '公司上下文检索', ms: 200 },
        { id: 'generation', label: 'JD 生成', ms: 900 },
      ],
      suggestions: ['上下文检索正常'],
    },
    tokens: {
      total: { promptTokens: 300, completionTokens: 200, totalTokens: 500 },
      stages: [],
    },
    context: {
      used: true,
      query: '高级前端工程师 招聘工作台体验',
      textLength: 1200,
      matches: [
        {
          documentId: 'doc-1',
          chunkId: 'chunk-1',
          chunkIndex: 0,
          filename: 'company.md',
          title: '公司招聘手册',
          sourceLabel: null,
          score: 0.91,
        },
      ],
      warnings: [],
    },
  },
  warnings: ['薪资范围来自表单设置'],
};

describe('JD create run runner', () => {
  beforeEach(() => {
    getRunMock.mockReset();
    updateRunMock.mockReset();
    createEventMock.mockReset();
    createJobDescriptionMock.mockReset();
    runJDAgentMock.mockReset();
    createEventMock.mockImplementation(async (params) => ({
      id: `event-${createEventMock.mock.calls.length}`,
      userId: params.userId,
      runId: params.runId,
      stage: params.stage,
      level: params.level ?? 'info',
      message: params.message,
      detail: params.detail ?? null,
      createdAt: now,
    }));
    updateRunMock.mockImplementation(async (params) =>
      makeRun({
        id: params.runId,
        jobDescriptionId: params.jobDescriptionId,
        status: params.status,
        currentStage: params.currentStage,
        errorMessage: params.errorMessage,
        startedAt: params.startedAt?.toISOString() ?? null,
        finishedAt: params.finishedAt?.toISOString() ?? null,
      }),
    );
  });

  it('runs the agent, saves the JD, and records detailed progress events', async () => {
    getRunMock.mockResolvedValueOnce(makeRun());
    runJDAgentMock.mockResolvedValueOnce(agentResponse);
    createJobDescriptionMock.mockResolvedValueOnce({
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

    await runJobDescriptionCreateRun({ userId: 'u1', runId: 'jd-create-run-1' });

    expect(runJDAgentMock).toHaveBeenCalledWith(
      {
        action: 'initial_generate',
        jobInput: expect.stringContaining('高级前端工程师'),
        tone: 'tech',
      },
      { userId: 'u1' },
    );
    expect(createJobDescriptionMock).toHaveBeenCalledWith(
      expect.objectContaining({
        userId: 'u1',
        department: '技术部',
        position: '高级前端工程师',
        content: agentResponse.jd,
        evaluation: agentResponse.evaluation,
        generationMeta: agentResponse.meta,
      }),
    );
    expect(updateRunMock).toHaveBeenLastCalledWith(
      expect.objectContaining({
        userId: 'u1',
        runId: 'jd-create-run-1',
        jobDescriptionId: 'jd-1',
        status: 'success',
        currentStage: 'completed',
        errorMessage: null,
        finishedAt: expect.any(Date),
      }),
    );
    expect(createEventMock).toHaveBeenCalledWith(
      expect.objectContaining({
        stage: 'llm_generation',
        level: 'success',
        message: 'JD 内容生成完成',
        detail: expect.objectContaining({
          model: 'mock-jd-agent',
          tokenTotal: 500,
          contextSources: 1,
          warnings: ['薪资范围来自表单设置'],
        }),
      }),
    );
    expect(createEventMock).toHaveBeenCalledWith(
      expect.objectContaining({
        stage: 'completed',
        level: 'success',
        message: 'JD 创建完成',
        detail: { jobDescriptionId: 'jd-1' },
      }),
    );
  });

  it('marks the run failed and records the failure reason when generation throws', async () => {
    getRunMock.mockResolvedValueOnce(makeRun());
    runJDAgentMock.mockRejectedValueOnce(new Error('OpenAI quota exceeded'));

    await runJobDescriptionCreateRun({ userId: 'u1', runId: 'jd-create-run-1' });

    expect(createJobDescriptionMock).not.toHaveBeenCalled();
    expect(updateRunMock).toHaveBeenLastCalledWith(
      expect.objectContaining({
        userId: 'u1',
        runId: 'jd-create-run-1',
        status: 'failed',
        errorMessage: 'OpenAI quota exceeded',
        finishedAt: expect.any(Date),
      }),
    );
    expect(createEventMock).toHaveBeenCalledWith(
      expect.objectContaining({
        stage: 'llm_generation',
        level: 'error',
        message: 'OpenAI quota exceeded',
      }),
    );
  });
});
