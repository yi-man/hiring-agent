/**
 * @jest-environment node
 */
import { runJDAgent } from '@/lib/jd-agent/service';
import { runLLM } from '@/lib/jd-agent/llm';
import { retrieveUserKnowledgeContext } from '@/lib/rag/knowledge-retrieval';
import type { EvaluationResult, JD } from '@/types';

jest.mock('@/lib/jd-agent/llm', () => ({
  runLLM: jest.fn(),
}));

jest.mock('@/lib/rag/knowledge-retrieval', () => ({
  retrieveUserKnowledgeContext: jest.fn(),
}));

const runLLMMock = runLLM as jest.MockedFunction<typeof runLLM>;
const retrieveUserKnowledgeContextMock = retrieveUserKnowledgeContext as jest.MockedFunction<
  typeof retrieveUserKnowledgeContext
>;

const generatedJd: JD = {
  title: '高级前端工程师',
  summary: '负责招聘助手核心产品体验与增长业务交付。',
  responsibilities: ['负责核心页面与交互开发'],
  requirements: ['熟悉 TypeScript 与 React'],
  bonus: [],
  highlights: ['招聘助手核心业务', 'AI 招聘产品场景'],
};

const improvedJd: JD = {
  ...generatedJd,
  summary: '结合招聘助手 AI 对话和知识库场景，负责核心产品体验与增长业务交付。',
  highlights: ['招聘助手核心业务', 'AI 招聘产品场景', '知识库驱动的招聘协作'],
};

const goodEvaluation: EvaluationResult = {
  scores: { clarity: 8, completeness: 8, attractiveness: 8, specificity: 8 },
  issues: ['公司上下文表达可以继续量化'],
  evidence: ['JD 提到了招聘助手核心业务'],
  suggestions: ['补充 AI 对话和知识库协作场景'],
  rewrite_required: false,
};

const betterEvaluation: EvaluationResult = {
  scores: { clarity: 9, completeness: 9, attractiveness: 9, specificity: 9 },
  issues: [],
  evidence: ['JD 明确提到招聘助手 AI 对话和知识库场景'],
  suggestions: [],
  rewrite_required: false,
};

function mockLlmResult(output: JD | EvaluationResult) {
  return {
    model: 'mock-jd-agent',
    output,
    usage: { promptTokens: 0, completionTokens: 0, totalTokens: 0 },
  };
}

describe('runJDAgent', () => {
  beforeEach(() => {
    runLLMMock.mockReset();
    retrieveUserKnowledgeContextMock.mockReset();
    retrieveUserKnowledgeContextMock.mockResolvedValue({
      contextText:
        '[knowledge source filename="company.md" chunkIndex=0]\n招聘助手是面向 HR 的 AI 招聘协作产品，包含对话、JD 生成和知识库能力。',
      matches: [
        {
          score: 0.91,
          documentId: 'doc-1',
          chunkId: 'chunk-1',
          chunkIndex: 0,
          filename: 'company.md',
          title: '公司介绍',
          sourceLabel: null,
        },
      ],
    });
  });

  it('runs initial_generate through user knowledge context', async () => {
    runLLMMock
      .mockResolvedValueOnce(mockLlmResult(generatedJd))
      .mockResolvedValueOnce(mockLlmResult(goodEvaluation));

    const result = await runJDAgent(
      {
        action: 'initial_generate',
        jobInput: '高级前端工程师，负责增长业务',
        tone: 'tech',
      },
      {
        userId: 'user-1',
      },
    );

    expect(result.jd.title).toBeTruthy();
    expect(result.meta.promptVersion).toBe('jd_v3.2');
    expect(result.meta.context?.used).toBe(true);
    expect(result.meta.context?.matches).toEqual([
      expect.objectContaining({ documentId: 'doc-1', filename: 'company.md' }),
    ]);
    expect(retrieveUserKnowledgeContextMock).toHaveBeenCalledWith({
      userId: 'user-1',
      query: expect.stringContaining('高级前端工程师'),
      topK: expect.any(Number),
    });
    expect(runLLMMock).toHaveBeenNthCalledWith(
      1,
      expect.objectContaining({
        stage: 'generate',
        companyContext: expect.stringContaining('AI 招聘协作产品'),
      }),
    );
    expect(runLLMMock).toHaveBeenNthCalledWith(
      2,
      expect.objectContaining({
        stage: 'evaluate',
        companyContext: expect.stringContaining('AI 招聘协作产品'),
      }),
    );
    expect(result.meta.timing?.stages.length).toBeGreaterThan(0);
    expect(result.meta.timing?.stages.map((s) => s.id)).toContain('retrieve_context');
    expect(result.meta.timing?.totalMs).toBeGreaterThanOrEqual(0);
    expect(Array.isArray(result.meta.timing?.suggestions)).toBe(true);
    expect(result.meta.tokens?.total.totalTokens).toBeGreaterThanOrEqual(0);
    expect(Array.isArray(result.meta.tokens?.stages)).toBe(true);
  });

  it('uses company context and user instruction when continuing from edited JD', async () => {
    runLLMMock
      .mockResolvedValueOnce(mockLlmResult(goodEvaluation))
      .mockResolvedValueOnce(mockLlmResult(improvedJd))
      .mockResolvedValueOnce(mockLlmResult(betterEvaluation));

    const result = await runJDAgent(
      {
        action: 'continue_generate',
        currentJd: {
          title: '高级前端工程师',
          summary: 'summary',
          responsibilities: ['r1'],
          requirements: ['q1'],
          bonus: [],
          highlights: ['h1'],
        },
        extraInstruction: '更专业一些',
      },
      {
        userId: 'user-1',
      },
    );

    expect(result.decision.improved).toBe(true);
    expect(result.decision.picked).toBe('improved');
    expect(retrieveUserKnowledgeContextMock).toHaveBeenCalledWith({
      userId: 'user-1',
      query: expect.stringContaining('更专业一些'),
      topK: expect.any(Number),
    });
    expect(runLLMMock).toHaveBeenNthCalledWith(
      2,
      expect.objectContaining({
        stage: 'improve',
        extraInstruction: '更专业一些',
        companyContext: expect.stringContaining('AI 招聘协作产品'),
      }),
    );
  });

  it('generates with a warning when no company context is retrieved', async () => {
    retrieveUserKnowledgeContextMock.mockResolvedValueOnce({ contextText: '', matches: [] });
    runLLMMock
      .mockResolvedValueOnce(mockLlmResult(generatedJd))
      .mockResolvedValueOnce(mockLlmResult(goodEvaluation));

    const result = await runJDAgent(
      {
        action: 'initial_generate',
        jobInput: '高级前端工程师',
        tone: 'tech',
      },
      { userId: 'user-1' },
    );

    expect(result.meta.context?.used).toBe(false);
    expect(result.warnings).toEqual(
      expect.arrayContaining([expect.stringContaining('公司上下文')]),
    );
  });
});
