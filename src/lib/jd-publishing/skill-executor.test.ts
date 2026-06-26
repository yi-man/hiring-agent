import { runPublishingSkill } from './skill-executor';
import type { BrowserExecutor, BrowserStepResult, PublishSkill } from './types';

class RecordingExecutor implements BrowserExecutor {
  readonly calls: string[] = [];

  constructor(private readonly checks: Record<string, boolean> = {}) {}

  async navigate(url: string): Promise<BrowserStepResult> {
    this.calls.push(`navigate:${url}`);
    return { success: true };
  }

  async fill(locator: string, value: string): Promise<BrowserStepResult> {
    this.calls.push(`fill:${locator}:${value}`);
    return { success: true };
  }

  async click(locator: string): Promise<BrowserStepResult> {
    this.calls.push(`click:${locator}`);
    return { success: true };
  }

  async waitForUrl(url: string): Promise<BrowserStepResult> {
    this.calls.push(`waitForUrl:${url}`);
    return { success: true };
  }

  async addKeywords(
    locator: string,
    values: string[],
    submitLocator: string,
  ): Promise<BrowserStepResult> {
    this.calls.push(`addKeywords:${locator}:${values.join(',')}:${submitLocator}`);
    return { success: true };
  }

  async check(check: { id?: string }): Promise<boolean> {
    this.calls.push(`check:${check.id}`);
    return this.checks[String(check.id)] ?? false;
  }
}

const skill: PublishSkill = {
  id: 'skill-1',
  name: 'publish_jd',
  platform: 'boss-like',
  version: 1,
  isActive: true,
  description: 'Publish a JD to boss-like.',
  inputSchema: {},
  variables: {},
  steps: [
    {
      id: 'open',
      type: 'action',
      action: 'navigate',
      params: { url: '{{target.loginUrl}}' },
      next: 'check_login',
    },
    {
      id: 'check_login',
      type: 'condition',
      check: { id: 'already_logged_in', type: 'url_contains', text: '/employer/jobs' },
      ifTrue: { next: 'new_job' },
      ifFalse: { next: 'fill_user' },
    },
    {
      id: 'fill_user',
      type: 'action',
      action: 'fill',
      params: { locator: '用户名', value: '{{credentials.username}}' },
      next: 'fill_password',
    },
    {
      id: 'fill_password',
      type: 'action',
      action: 'fill',
      params: { locator: '密码', value: '{{credentials.password}}' },
      next: 'login',
    },
    {
      id: 'login',
      type: 'action',
      action: 'click',
      params: { locator: '登录' },
      next: 'new_job',
    },
    {
      id: 'new_job',
      type: 'action',
      action: 'navigate',
      params: { url: '{{target.newJobUrl}}' },
      next: 'fill_title',
    },
    {
      id: 'fill_title',
      type: 'action',
      action: 'fill',
      params: { locator: '职位名称', value: '{{input.title}}' },
      next: 'done',
    },
    { id: 'done', type: 'end' },
  ],
};

describe('runPublishingSkill', () => {
  it('executes action and condition steps through a browser executor interface', async () => {
    const executor = new RecordingExecutor();

    const result = await runPublishingSkill({
      taskId: 'task-1',
      skill,
      executor,
      context: {
        input: { title: '高级前端工程师' },
        credentials: { username: 'admin', password: 'boss123' },
        target: {
          loginUrl: 'http://127.0.0.1:6183/employer/login',
          newJobUrl: 'http://127.0.0.1:6183/employer/jobs/new',
        },
      },
    });

    expect(result.status).toBe('success');
    expect(executor.calls).toEqual([
      'navigate:http://127.0.0.1:6183/employer/login',
      'check:already_logged_in',
      'fill:用户名:admin',
      'fill:密码:boss123',
      'click:登录',
      'navigate:http://127.0.0.1:6183/employer/jobs/new',
      'fill:职位名称:高级前端工程师',
    ]);
    expect(result.trace.steps.map((step) => step.stepId)).toEqual([
      'open',
      'check_login',
      'fill_user',
      'fill_password',
      'login',
      'new_job',
      'fill_title',
    ]);
  });

  it('stops and records a failed action result', async () => {
    const executor = new RecordingExecutor();
    executor.fill = async () => ({
      success: false,
      error: 'selector not found',
      domSnapshot: '<html />',
    });

    const result = await runPublishingSkill({
      taskId: 'task-2',
      skill,
      executor,
      context: {
        input: { title: '高级前端工程师' },
        credentials: { username: 'admin', password: 'boss123' },
        target: {
          loginUrl: 'http://127.0.0.1:6183/employer/login',
          newJobUrl: 'http://127.0.0.1:6183/employer/jobs/new',
        },
      },
    });

    expect(result.status).toBe('failed');
    expect(result.trace.status).toBe('failed');
    expect(result.trace.steps.at(-1)?.result).toEqual({
      success: false,
      error: 'selector not found',
      domSnapshot: '<html />',
    });
  });

  it('preserves array values when an action parameter is a single template expression', async () => {
    const executor = new RecordingExecutor();

    const result = await runPublishingSkill({
      taskId: 'task-3',
      skill: {
        ...skill,
        steps: [
          {
            id: 'add_keywords',
            type: 'action',
            action: 'add_keywords',
            params: {
              locator: '技能标签',
              values: '{{input.keywords}}',
              submitLocator: '添加',
            },
            next: 'done',
          },
          { id: 'done', type: 'end' },
        ],
      },
      executor,
      context: {
        input: { keywords: ['TypeScript', 'React'] },
        credentials: {},
        target: {},
      },
    });

    expect(result.status).toBe('success');
    expect(executor.calls).toEqual(['addKeywords:技能标签:TypeScript,React:添加']);
  });

  it('fails when step traversal exceeds the iteration guard', async () => {
    const executor = new RecordingExecutor();

    const result = await runPublishingSkill({
      taskId: 'task-loop',
      skill: {
        ...skill,
        steps: [
          {
            id: 'loop',
            type: 'action',
            action: 'navigate',
            params: { url: '{{target.loginUrl}}' },
            next: 'loop',
          },
        ],
      },
      executor,
      context: {
        input: {},
        credentials: {},
        target: { loginUrl: 'http://127.0.0.1:6183/employer/login' },
      },
    });

    expect(result.status).toBe('failed');
    expect(result.trace.status).toBe('failed');
    expect(result.trace.steps.at(-1)?.stepId).toBe('loop');
    expect(result.trace.steps.at(-1)?.action).toBe('iteration_guard');
  });
});
