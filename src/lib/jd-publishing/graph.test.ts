/**
 * @jest-environment node
 */
import type { JobDescriptionDto, JD } from '@/types';
import { runPublishingAgentGraph } from './graph';
import type {
  BrowserExecutor,
  BrowserStepResult,
  PublishSkill,
  PublishTaskDto,
  PublishTraceStep,
} from './types';

class GraphExecutor implements BrowserExecutor {
  readonly calls: string[] = [];

  constructor(private readonly failures: Record<string, BrowserStepResult> = {}) {}

  async navigate(url: string): Promise<BrowserStepResult> {
    this.calls.push(`navigate:${url}`);
    return this.failures.navigate ?? { success: true };
  }

  async fill(locator: string, value: string): Promise<BrowserStepResult> {
    this.calls.push(`fill:${locator}:${value}`);
    return this.failures[`fill:${locator}`] ?? { success: true };
  }

  async click(locator: string): Promise<BrowserStepResult> {
    this.calls.push(`click:${locator}`);
    return this.failures[`click:${locator}`] ?? { success: true };
  }

  async waitForUrl(url: string): Promise<BrowserStepResult> {
    this.calls.push(`waitForUrl:${url}`);
    return { success: true };
  }

  async check(check: { id?: string; text?: string }): Promise<boolean> {
    this.calls.push(`check:${check.id ?? check.text ?? ''}`);
    return true;
  }

  async snapshot(): Promise<string> {
    this.calls.push('snapshot');
    return '<html>snapshot</html>';
  }
}

const sampleJd: JD = {
  title: '高级前端工程师',
  summary: '负责招聘产品前端体验',
  responsibilities: ['建设 JD 发布链路'],
  requirements: ['熟悉 TypeScript'],
  bonus: ['有自动化经验'],
  highlights: ['核心业务'],
};

const sampleJobDescription: JobDescriptionDto = {
  id: 'jd-1',
  userId: 'u1',
  department: '技术部',
  position: '前端工程师',
  positionDescription: '负责招聘产品前端体验',
  tone: 'tech',
  status: 'ready_to_publish',
  content: sampleJd,
  evaluation: null,
  generationMeta: null,
  createdAt: '2026-06-26T00:00:00.000Z',
  updatedAt: '2026-06-26T00:00:00.000Z',
};

const simpleSkill: PublishSkill = {
  id: 'skill-1',
  name: 'publish_jd',
  platform: 'boss-like',
  description: 'Publish one field',
  version: 1,
  isActive: true,
  inputSchema: {},
  variables: {},
  meta: { created_from: 'explore', success_rate: 0, usage_count: 0 },
  steps: [
    {
      id: 'open_new_job',
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

function taskFor(skill: PublishSkill): PublishTaskDto {
  return {
    id: 'task-1',
    userId: 'u1',
    jobDescriptionId: 'jd-1',
    skillId: skill.id,
    platform: 'boss-like',
    input: {},
    currentStep: skill.steps[0]?.id ?? null,
    status: 'running',
    errorMessage: null,
    trace: null,
    createdAt: '2026-06-26T00:00:00.000Z',
    updatedAt: '2026-06-26T00:00:00.000Z',
  };
}

function settings() {
  return {
    platform: 'boss-like' as const,
    company: '星河智能',
    salary: '25-40K',
    location: '上海',
    keywords: ['TypeScript'],
  };
}

describe('runPublishingAgentGraph', () => {
  it('explores and stores a skill before creating the task when DB has no active skill', async () => {
    const executor = new GraphExecutor();
    const getActiveSkill = jest.fn().mockResolvedValue(null);
    const exploreSkill = jest.fn().mockResolvedValue(simpleSkill);
    const createExploredSkill = jest.fn().mockResolvedValue({ ...simpleSkill, id: 'db-skill-1' });
    const createTask = jest.fn().mockResolvedValue(taskFor({ ...simpleSkill, id: 'db-skill-1' }));
    const completeTask = jest.fn().mockResolvedValue(undefined);

    const result = await runPublishingAgentGraph({
      jobDescription: sampleJobDescription,
      settings: settings(),
      executor,
      target: {
        loginUrl: 'http://localhost:6183/employer/login',
        newJobUrl: 'http://localhost:6183/employer/jobs/new',
      },
      credentials: { username: 'admin', password: 'boss123' },
      dependencies: {
        getActiveSkill,
        exploreSkill,
        createExploredSkill,
        createTask,
        completeTask,
      },
    });

    expect(result.status).toBe('success');
    expect(getActiveSkill).toHaveBeenCalledWith('boss-like');
    expect(exploreSkill).toHaveBeenCalledWith(
      expect.objectContaining({
        executor,
        context: expect.objectContaining({
          target: expect.objectContaining({
            newJobUrl: 'http://localhost:6183/employer/jobs/new',
          }),
        }),
      }),
    );
    expect(createExploredSkill).toHaveBeenCalledWith(simpleSkill);
    expect(createTask).toHaveBeenCalledWith(
      expect.objectContaining({
        skillId: 'db-skill-1',
        currentStep: 'open_new_job',
      }),
    );
    expect(completeTask).toHaveBeenCalledWith(
      expect.objectContaining({
        taskId: 'task-1',
        skillId: 'db-skill-1',
        status: 'success',
        steps: expect.arrayContaining([
          expect.objectContaining({ stepId: 'open_new_job', action: 'navigate' }),
          expect.objectContaining({ stepId: 'fill_title', action: 'fill' }),
        ]),
      }),
    );
  });

  it('executes skill steps one at a time through the graph', async () => {
    const executor = new GraphExecutor();
    const createTask = jest.fn().mockResolvedValue(taskFor(simpleSkill));
    const completeTask = jest.fn().mockResolvedValue(undefined);

    const result = await runPublishingAgentGraph({
      jobDescription: sampleJobDescription,
      settings: settings(),
      executor,
      target: {
        loginUrl: 'http://localhost:6183/employer/login',
        newJobUrl: 'http://localhost:6183/employer/jobs/new',
      },
      credentials: { username: 'admin', password: 'boss123' },
      dependencies: {
        getActiveSkill: jest.fn().mockResolvedValue(simpleSkill),
        createTask,
        completeTask,
      },
    });

    expect(result.trace.steps.map((step) => step.stepId)).toEqual(['open_new_job', 'fill_title']);
    expect(executor.calls).toEqual([
      'navigate:http://localhost:6183/employer/jobs/new',
      'fill:职位名称:高级前端工程师',
    ]);
  });

  it('supports long step-by-step skills beyond the default LangGraph recursion limit', async () => {
    const actionSteps: PublishSkill['steps'] = Array.from({ length: 18 }, (_item, index) => ({
      id: `step_${index}`,
      type: 'action' as const,
      action: 'click' as const,
      params: { locator: `按钮 ${index}` },
      next: index === 17 ? 'done' : `step_${index + 1}`,
    }));
    const longSteps: PublishSkill['steps'] = [...actionSteps, { id: 'done', type: 'end' }];
    const longSkill: PublishSkill = {
      ...simpleSkill,
      id: 'long-skill',
      steps: longSteps,
    };
    const executor = new GraphExecutor();

    const result = await runPublishingAgentGraph({
      jobDescription: sampleJobDescription,
      settings: settings(),
      executor,
      target: {
        loginUrl: 'http://localhost:6183/employer/login',
        newJobUrl: 'http://localhost:6183/employer/jobs/new',
      },
      credentials: { username: 'admin', password: 'boss123' },
      dependencies: {
        getActiveSkill: jest.fn().mockResolvedValue(longSkill),
        createTask: jest.fn().mockResolvedValue(taskFor(longSkill)),
        completeTask: jest.fn().mockResolvedValue(undefined),
      },
    });

    expect(result.status).toBe('success');
    expect(result.trace.steps).toHaveLength(18);
  });

  it('records fallback_agent trace and creates a new active version when repair steps are provided', async () => {
    const repairedSteps: PublishSkill['steps'] = [
      {
        id: 'fill_title_repaired',
        type: 'action',
        action: 'fill',
        params: { locator: '职位标题', value: '{{input.title}}' },
        next: 'done',
      },
      { id: 'done', type: 'end' },
    ];
    const failingSkill: PublishSkill = {
      ...simpleSkill,
      steps: [
        {
          id: 'fill_title',
          type: 'action',
          action: 'fill',
          params: { locator: '职位名称', value: '{{input.title}}' },
          next: 'done',
          onFail: {
            type: 'fallback_agent',
            reason: 'title selector changed',
            repairSteps: repairedSteps,
          },
        },
        { id: 'done', type: 'end' },
      ],
    };
    const executor = new GraphExecutor({
      'fill:职位名称': {
        success: false,
        error: 'selector not found',
        domSnapshot: '<label>职位标题</label>',
      },
    });
    const createNextSkillVersion = jest.fn().mockResolvedValue({
      ...failingSkill,
      id: 'skill-2',
      version: 2,
      steps: repairedSteps,
    });
    const completeTask = jest.fn().mockResolvedValue(undefined);

    const result = await runPublishingAgentGraph({
      jobDescription: sampleJobDescription,
      settings: settings(),
      executor,
      target: {
        loginUrl: 'http://localhost:6183/employer/login',
        newJobUrl: 'http://localhost:6183/employer/jobs/new',
      },
      credentials: { username: 'admin', password: 'boss123' },
      dependencies: {
        getActiveSkill: jest.fn().mockResolvedValue(failingSkill),
        createTask: jest.fn().mockResolvedValue(taskFor(failingSkill)),
        completeTask,
        createNextSkillVersion,
      },
    });

    expect(result.status).toBe('failed');
    expect(result.trace.steps.map((step: PublishTraceStep) => step.stepId)).toEqual([
      'fill_title',
      'fallback_agent',
      'skill_upgrade',
    ]);
    expect(result.trace.steps[1]).toEqual(
      expect.objectContaining({
        action: 'fallback_agent',
        params: expect.objectContaining({
          failedStepId: 'fill_title',
          reason: 'title selector changed',
        }),
        result: expect.objectContaining({
          success: true,
          domSnapshot: '<label>职位标题</label>',
        }),
      }),
    );
    expect(createNextSkillVersion).toHaveBeenCalledWith({
      previousSkill: failingSkill,
      steps: repairedSteps,
      meta: expect.objectContaining({ created_from: 'agent' }),
    });
    expect(completeTask).toHaveBeenCalledWith(
      expect.objectContaining({
        status: 'failed',
        errorMessage: 'selector not found',
      }),
    );
  });
});
