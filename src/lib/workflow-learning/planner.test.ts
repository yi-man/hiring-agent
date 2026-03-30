import type { TaskPlan } from './types';

const mockPlan: TaskPlan = {
  goal: '打开 localhost 健康检查页面并总结',
  steps: [
    {
      id: 'step-1',
      description: '打开健康检查页面',
      type: 'browser_action',
      browserSubSteps: [
        {
          action: 'navigate',
          params: { url: 'http://localhost:3000/api/health' },
          description: '访问 API',
        },
        { action: 'snapshot', params: {}, description: '读取页面' },
      ],
      onFailure: 'replan',
      status: 'pending',
    },
    {
      id: 'step-2',
      description: '总结健康检查结果',
      type: 'report',
      onFailure: 'abort',
      status: 'pending',
    },
  ],
  fallbackStrategy: '如果页面不可达，报告错误',
};

jest.mock('@langchain/openai', () => ({
  ChatOpenAI: jest.fn().mockImplementation(() => ({
    withStructuredOutput: jest.fn().mockReturnValue({
      invoke: jest.fn().mockResolvedValue(mockPlan),
    }),
  })),
}));

import { generatePlan } from './planner';

describe('generatePlan', () => {
  beforeEach(() => {
    process.env.OPENAI_API_KEY = 'test-key';
  });

  afterEach(() => {
    delete process.env.OPENAI_API_KEY;
  });

  it('returns a valid TaskPlan from LLM', async () => {
    const plan = await generatePlan({
      userMessage: '打开 http://localhost:3000/api/health 并总结',
      browserStatus: null,
      runId: 'test-123',
    });
    expect(plan.goal).toBe('打开 localhost 健康检查页面并总结');
    expect(plan.steps).toHaveLength(2);
    expect(plan.steps[0].id).toBe('step-1');
    expect(plan.steps[0].type).toBe('browser_action');
    expect(plan.steps[1].type).toBe('report');
  });

  it('passes browser status context when available', async () => {
    const plan = await generatePlan({
      userMessage: '继续分析页面',
      browserStatus: { url: 'https://example.com', title: 'Example' },
      runId: 'test-456',
    });
    expect(plan).toBeDefined();
  });
});
