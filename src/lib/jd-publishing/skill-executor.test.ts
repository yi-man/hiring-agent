import { executePublishingStep, runPublishingSkill } from './skill-executor';
import type { BrowserExecutor, BrowserStepResult, PublishSkill } from './types';

class RecordingExecutor implements BrowserExecutor {
  readonly calls: string[] = [];
  readonly fillCalls: Array<{ target: unknown; value: string }> = [];

  constructor(private readonly checks: Record<string, boolean> = {}) {}

  async navigate(url: string): Promise<BrowserStepResult> {
    this.calls.push(`navigate:${url}`);
    return { success: true };
  }

  async fill(locator: string, value: string): Promise<BrowserStepResult> {
    this.fillCalls.push({ target: locator, value });
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
  it('executes one action step and returns the next step for graph routing', async () => {
    const executor = new RecordingExecutor();

    const result = await executePublishingStep({
      stepId: 'open',
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

    expect(result.status).toBe('running');
    expect(result.nextStepId).toBe('check_login');
    expect(result.traceStep).toEqual({
      stepId: 'open',
      action: 'navigate',
      params: { url: 'http://127.0.0.1:6183/employer/login' },
      result: { success: true },
    });
  });

  it('returns fallback status when a failed action asks for fallback_agent', async () => {
    const executor = new RecordingExecutor();
    executor.fill = async () => ({
      success: false,
      error: 'selector not found',
      domSnapshot: '<form />',
    });

    const result = await executePublishingStep({
      stepId: 'fill_title',
      skill: {
        ...skill,
        steps: [
          {
            id: 'fill_title',
            type: 'action',
            action: 'fill',
            params: { locator: '职位名称', value: '{{input.title}}' },
            next: 'done',
            onFail: { type: 'fallback_agent', reason: 'title field changed' },
          },
          { id: 'done', type: 'end' },
        ],
      },
      executor,
      context: {
        input: { title: '高级前端工程师' },
        credentials: {},
        target: {},
      },
    });

    expect(result.status).toBe('fallback');
    expect(result.nextStepId).toBeNull();
    expect(result.onFail).toEqual({ type: 'fallback_agent', reason: 'title field changed' });
    expect(result.traceStep?.result).toEqual({
      success: false,
      error: 'selector not found',
      domSnapshot: '<form />',
    });
  });

  it('rejects screening-only actions without dispatching a browser command', async () => {
    const executor = new RecordingExecutor();

    const result = await executePublishingStep({
      stepId: 'search_candidates',
      skill: {
        ...skill,
        steps: [
          {
            id: 'search_candidates',
            type: 'action',
            action: 'search_candidates',
            params: {},
            next: 'done',
          },
          { id: 'done', type: 'end' },
        ],
      },
      executor,
      context: { input: {}, credentials: {}, target: {} },
    });

    expect(result.status).toBe('failed');
    expect(result.traceStep).toEqual({
      stepId: 'search_candidates',
      action: 'search_candidates',
      params: {},
      result: { success: false, error: 'unsupported action: search_candidates' },
    });
    expect(executor.calls).toEqual([]);
  });

  it('passes structured target descriptors to browser actions', async () => {
    const executor = new RecordingExecutor();
    const target = {
      kind: 'field',
      role: 'textbox',
      name: '职位名称',
      exact: true,
      valueHint: 'title',
      scope: { kind: 'form', name: '发布职位' },
    };

    const result = await executePublishingStep({
      stepId: 'fill_title',
      skill: {
        ...skill,
        steps: [
          {
            id: 'fill_title',
            type: 'action',
            action: 'fill',
            params: { target, value: '{{input.title}}' },
            next: 'done',
          },
          { id: 'done', type: 'end' },
        ],
      },
      executor,
      context: {
        input: { title: '高级前端工程师' },
        credentials: {},
        target: {},
      },
    });

    expect(result.status).toBe('running');
    expect(executor.fillCalls).toEqual([{ target, value: '高级前端工程师' }]);
    expect(result.traceStep?.params).toEqual({
      target,
      value: '高级前端工程师',
    });
  });

  it('routes a failed condition to fallback_agent when no false branch exists', async () => {
    const executor = new RecordingExecutor({ title_visible: false });

    const result = await executePublishingStep({
      stepId: 'verify_title',
      skill: {
        ...skill,
        steps: [
          {
            id: 'verify_title',
            type: 'condition',
            check: { id: 'title_visible', type: 'text_contains', text: '{{input.title}}' },
            ifTrue: { next: 'done' },
            onFail: { type: 'fallback_agent', reason: 'published title not visible' },
          },
          { id: 'done', type: 'end' },
        ],
      },
      executor,
      context: {
        input: { title: '高级前端工程师' },
        credentials: {},
        target: {},
      },
    });

    expect(result.status).toBe('fallback');
    expect(result.traceStep).toEqual({
      stepId: 'verify_title',
      action: 'condition',
      params: { id: 'title_visible', type: 'text_contains', text: '高级前端工程师' },
      result: { success: false },
    });
  });

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
