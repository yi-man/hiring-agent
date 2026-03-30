import { renderPlanToMarkdown, updateStepInMarkdown } from './plan-markdown';
import type { TaskPlan } from './types';

describe('renderPlanToMarkdown', () => {
  const plan: TaskPlan = {
    goal: '了解竞品XX的功能',
    steps: [
      {
        id: 'step-1',
        description: '打开竞品官网',
        type: 'browser_action',
        browserSubSteps: [
          { action: 'navigate', params: { url: 'https://xx.com' }, description: '打开首页' },
          { action: 'snapshot', params: {}, description: '读取内容' },
        ],
        onFailure: 'replan',
        status: 'pending',
      },
      {
        id: 'step-2',
        description: '总结分析',
        type: 'analysis',
        onFailure: 'abort',
        status: 'pending',
      },
    ],
    fallbackStrategy: '如果页面无法访问，尝试搜索引擎查找',
  };

  it('renders a complete markdown document', () => {
    const md = renderPlanToMarkdown({
      plan,
      runId: 'test-run-123',
      createdAt: '2026-03-30T14:00:00Z',
    });
    expect(md).toContain('# Workflow Plan: 了解竞品XX的功能');
    expect(md).toContain('**RunId:** test-run-123');
    expect(md).toContain('### Step 1: 打开竞品官网 [pending]');
    expect(md).toContain('### Step 2: 总结分析 [pending]');
    expect(md).toContain('navigate → {"url":"https://xx.com"}');
  });
});

describe('updateStepInMarkdown', () => {
  it('updates step status and appends summary', () => {
    const original = '### Step 1: 打开竞品官网 [pending]\n- 类型: browser_action\n';
    const updated = updateStepInMarkdown(original, 'step-1', 'completed', '成功打开页面');
    expect(updated).toContain('[completed]');
    expect(updated).toContain('- 结果: 成功打开页面');
  });
});
