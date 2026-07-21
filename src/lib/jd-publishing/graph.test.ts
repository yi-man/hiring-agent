/**
 * @jest-environment node
 */
import type { JobDescriptionDto, JD } from '@/types';
import { runPublishingAgentGraph } from './graph';
import type {
  BrowserExecutor,
  BrowserStepResult,
  BrowserTargetInput,
  LocatorMatchReport,
  PublishSkill,
  PublishTaskDto,
  PublishTraceStep,
  StructuredDomSnapshot,
  TargetDescriptor,
} from './types';

class GraphExecutor implements BrowserExecutor {
  readonly calls: string[] = [];
  readonly commandContexts: Array<{ taskId?: string; stepId?: string }> = [];

  constructor(
    private readonly failures: Record<string, BrowserStepResult> = {},
    private readonly targetReport?: LocatorMatchReport,
  ) {}

  private targetName(target: BrowserTargetInput): string {
    return typeof target === 'string' ? target : target.name;
  }

  setCommandContext(context: { taskId?: string; stepId?: string }): void {
    this.commandContexts.push(context);
  }

  async navigate(url: string): Promise<BrowserStepResult> {
    this.calls.push(`navigate:${url}`);
    return this.failures.navigate ?? { success: true };
  }

  async fill(target: BrowserTargetInput, value: string): Promise<BrowserStepResult> {
    const name = this.targetName(target);
    this.calls.push(`fill:${name}:${value}`);
    return this.failures[`fill:${name}`] ?? { success: true };
  }

  async click(target: BrowserTargetInput): Promise<BrowserStepResult> {
    const name = this.targetName(target);
    this.calls.push(`click:${name}`);
    return this.failures[`click:${name}`] ?? { success: true };
  }

  async waitForUrl(url: string): Promise<BrowserStepResult> {
    this.calls.push(`waitForUrl:${url}`);
    return { success: true };
  }

  async addKeywords(
    target: BrowserTargetInput,
    values: string[],
    submitTarget: BrowserTargetInput,
  ): Promise<BrowserStepResult> {
    const targetName = this.targetName(target);
    const submitName = this.targetName(submitTarget);
    this.calls.push(`addKeywords:${targetName}:${submitName}:${values.join(',')}`);
    return this.failures[`addKeywords:${targetName}:${submitName}`] ?? { success: true };
  }

  async check(check: { id?: string; text?: string }): Promise<boolean> {
    this.calls.push(`check:${check.id ?? check.text ?? ''}`);
    return true;
  }

  async snapshot(): Promise<string> {
    this.calls.push('snapshot');
    return '<html>snapshot</html>';
  }

  async snapshotStructured(): Promise<StructuredDomSnapshot> {
    this.calls.push('snapshotStructured');
    return {
      url: 'http://localhost:6183/employer/jobs/new',
      title: '发布职位',
      pageState: 'publish_form',
      headings: [],
      forms: [],
      links: [],
      textBlocks: [],
    };
  }

  async resolveTarget(target: BrowserTargetInput): Promise<LocatorMatchReport> {
    this.calls.push(`resolveTarget:${this.targetName(target)}`);
    if (this.targetReport) return this.targetReport;
    const descriptor =
      typeof target === 'string' ? { kind: 'field' as const, name: target, exact: false } : target;
    return {
      target: descriptor,
      status: 'unique',
      strategy: 'role_name',
      candidateCount: 1,
      confidence: 0.9,
      chosen: {
        tag: descriptor.kind === 'button' ? 'button' : 'input',
        accessibleName: descriptor.name,
        visible: true,
        enabled: true,
        editable: descriptor.kind === 'field',
      },
      candidates: [],
    };
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
  salaryRange: null,
  workLocations: [],
  hiringTarget: 1,
  onboardedCount: 0,
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
    batchId: 'batch-1',
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
  it('does not issue a browser command after the task loses its batch lease fence', async () => {
    const executor = new GraphExecutor();
    const updateTaskCurrentStep = jest
      .fn()
      .mockResolvedValueOnce(true)
      .mockResolvedValueOnce(false);

    await expect(
      runPublishingAgentGraph({
        jobDescription: sampleJobDescription,
        batchId: 'batch-1',
        settings: settings(),
        executor,
        target: { newJobUrl: 'http://localhost:6183/employer/jobs/new' },
        credentials: {},
        dependencies: {
          getActiveSkill: jest.fn().mockResolvedValue(simpleSkill),
          createTask: jest.fn().mockResolvedValue(taskFor(simpleSkill)),
          updateTaskCurrentStep,
          completeTask: jest.fn(),
        },
      }),
    ).rejects.toThrow('publish task is no longer active');

    expect(executor.calls).toEqual(['navigate:http://localhost:6183/employer/jobs/new']);
    expect(updateTaskCurrentStep).toHaveBeenNthCalledWith(1, {
      taskId: 'task-1',
      userId: 'u1',
      jobDescriptionId: 'jd-1',
      batchId: 'batch-1',
      expectedCurrentStep: 'open_new_job',
      currentStep: 'open_new_job',
    });
    expect(updateTaskCurrentStep).toHaveBeenNthCalledWith(2, {
      taskId: 'task-1',
      userId: 'u1',
      jobDescriptionId: 'jd-1',
      batchId: 'batch-1',
      expectedCurrentStep: 'open_new_job',
      currentStep: 'fill_title',
    });
  });

  it('checks the task fence before the first browser command', async () => {
    const executor = new GraphExecutor();

    await expect(
      runPublishingAgentGraph({
        jobDescription: sampleJobDescription,
        batchId: 'batch-1',
        settings: settings(),
        executor,
        target: { newJobUrl: 'http://localhost:6183/employer/jobs/new' },
        credentials: {},
        dependencies: {
          getActiveSkill: jest.fn().mockResolvedValue(simpleSkill),
          createTask: jest.fn().mockResolvedValue(taskFor(simpleSkill)),
          updateTaskCurrentStep: jest.fn().mockResolvedValue(false),
          completeTask: jest.fn(),
        },
      }),
    ).rejects.toThrow('publish task is no longer active');

    expect(executor.calls).toEqual([]);
  });

  it('rechecks the task fence before each fallback browser command', async () => {
    const staleTarget: TargetDescriptor = {
      kind: 'field',
      role: 'textbox',
      name: '旧版职位名称',
      exact: true,
    };
    const failingSkill: PublishSkill = {
      ...simpleSkill,
      steps: [
        {
          id: 'fill_title',
          type: 'action',
          action: 'fill',
          params: { target: staleTarget, value: '{{input.title}}' },
          next: 'done',
          onFail: { type: 'fallback_agent', reason: 'title target changed' },
        },
        { id: 'done', type: 'end' },
      ],
    };
    const executor = new GraphExecutor({
      'fill:旧版职位名称': { success: false, error: 'not_found_target: old title' },
    });
    const updateTaskCurrentStep = jest
      .fn()
      .mockResolvedValueOnce(true)
      .mockResolvedValueOnce(true)
      .mockResolvedValueOnce(true)
      .mockResolvedValueOnce(false);

    await expect(
      runPublishingAgentGraph({
        jobDescription: sampleJobDescription,
        batchId: 'batch-1',
        settings: settings(),
        executor,
        target: {},
        credentials: {},
        dependencies: {
          getActiveSkill: jest.fn().mockResolvedValue(failingSkill),
          createTask: jest.fn().mockResolvedValue(taskFor(failingSkill)),
          updateTaskCurrentStep,
          completeTask: jest.fn(),
          createNextSkillVersion: jest.fn(),
        },
      }),
    ).rejects.toThrow('publish task is no longer active');

    expect(executor.calls).toEqual(['fill:旧版职位名称:高级前端工程师', 'snapshotStructured']);
    expect(executor.calls).not.toContain('resolveTarget:旧版职位名称');
  });

  it('rechecks the task fence before persisting a repaired skill version', async () => {
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
            reason: 'title target changed',
            repairSteps: repairedSteps,
          },
        },
        { id: 'done', type: 'end' },
      ],
    };
    const createNextSkillVersion = jest.fn();

    await expect(
      runPublishingAgentGraph({
        jobDescription: sampleJobDescription,
        batchId: 'batch-1',
        settings: settings(),
        executor: new GraphExecutor({
          'fill:职位名称': { success: false, error: 'selector not found' },
        }),
        target: {},
        credentials: {},
        dependencies: {
          getActiveSkill: jest.fn().mockResolvedValue(failingSkill),
          createTask: jest.fn().mockResolvedValue(taskFor(failingSkill)),
          updateTaskCurrentStep: jest
            .fn()
            .mockResolvedValueOnce(true)
            .mockResolvedValueOnce(true)
            .mockResolvedValueOnce(false),
          completeTask: jest.fn(),
          createNextSkillVersion,
        },
      }),
    ).rejects.toThrow('publish task is no longer active');

    expect(createNextSkillVersion).not.toHaveBeenCalled();
  });

  it('fails and finalizes an active task when the executor rejects', async () => {
    const executor = new GraphExecutor();
    executor.navigate = jest.fn().mockRejectedValue(new Error('browser transport disconnected'));
    const completeTask = jest.fn().mockResolvedValue(true);

    const result = await runPublishingAgentGraph({
      jobDescription: sampleJobDescription,
      batchId: 'batch-1',
      settings: settings(),
      executor,
      target: { newJobUrl: 'http://localhost:6183/employer/jobs/new' },
      credentials: {},
      dependencies: {
        getActiveSkill: jest.fn().mockResolvedValue(simpleSkill),
        createTask: jest.fn().mockResolvedValue(taskFor(simpleSkill)),
        updateTaskCurrentStep: jest.fn().mockResolvedValue(true),
        completeTask,
      },
    });

    expect(result.status).toBe('failed');
    expect(result.trace.steps.at(-1)).toEqual(
      expect.objectContaining({
        stepId: 'open_new_job',
        action: 'navigate',
        result: { success: false, error: 'browser transport disconnected' },
      }),
    );
    expect(completeTask).toHaveBeenCalledWith(
      expect.objectContaining({
        taskId: 'task-1',
        userId: 'u1',
        jobDescriptionId: 'jd-1',
        batchId: 'batch-1',
        status: 'failed',
        errorMessage: 'browser transport disconnected',
      }),
    );
  });

  it('does not overwrite recovery when the task fence is lost while handling an executor error', async () => {
    const executor = new GraphExecutor();
    executor.navigate = jest.fn().mockRejectedValue(new Error('browser transport disconnected'));
    const completeTask = jest.fn();

    await expect(
      runPublishingAgentGraph({
        jobDescription: sampleJobDescription,
        batchId: 'batch-1',
        settings: settings(),
        executor,
        target: { newJobUrl: 'http://localhost:6183/employer/jobs/new' },
        credentials: {},
        dependencies: {
          getActiveSkill: jest.fn().mockResolvedValue(simpleSkill),
          createTask: jest.fn().mockResolvedValue(taskFor(simpleSkill)),
          updateTaskCurrentStep: jest.fn().mockResolvedValueOnce(true).mockResolvedValueOnce(false),
          completeTask,
        },
      }),
    ).rejects.toThrow('publish task is no longer active');

    expect(completeTask).not.toHaveBeenCalled();
  });

  it('fails and finalizes an active task when fallback processing rejects', async () => {
    const staleTarget: TargetDescriptor = {
      kind: 'field',
      role: 'textbox',
      name: '旧版职位名称',
      exact: true,
    };
    const failingSkill: PublishSkill = {
      ...simpleSkill,
      steps: [
        {
          id: 'fill_title',
          type: 'action',
          action: 'fill',
          params: { target: staleTarget, value: '{{input.title}}' },
          next: 'done',
          onFail: { type: 'fallback_agent', reason: 'title target changed' },
        },
        { id: 'done', type: 'end' },
      ],
    };
    const executor = new GraphExecutor({
      'fill:旧版职位名称': { success: false, error: 'not_found_target: old title' },
    });
    executor.snapshotStructured = () => {
      throw new Error('fallback snapshot crashed');
    };
    const completeTask = jest.fn().mockResolvedValue(true);

    const result = await runPublishingAgentGraph({
      jobDescription: sampleJobDescription,
      batchId: 'batch-1',
      settings: settings(),
      executor,
      target: {},
      credentials: {},
      dependencies: {
        getActiveSkill: jest.fn().mockResolvedValue(failingSkill),
        createTask: jest.fn().mockResolvedValue(taskFor(failingSkill)),
        updateTaskCurrentStep: jest.fn().mockResolvedValue(true),
        completeTask,
        createNextSkillVersion: jest.fn(),
      },
    });

    expect(result.status).toBe('failed');
    expect(result.trace.steps.at(-1)).toEqual(
      expect.objectContaining({
        stepId: 'fallback_agent',
        action: 'fallback_agent',
        result: expect.objectContaining({
          success: false,
          error: 'fallback snapshot crashed',
        }),
      }),
    );
    expect(completeTask).toHaveBeenCalledWith(
      expect.objectContaining({
        status: 'failed',
        errorMessage: 'fallback snapshot crashed',
      }),
    );
  });

  it('fails and finalizes an active task when skill upgrade persistence rejects', async () => {
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
            reason: 'title target changed',
            repairSteps: repairedSteps,
          },
        },
        { id: 'done', type: 'end' },
      ],
    };
    const completeTask = jest.fn().mockResolvedValue(true);

    const result = await runPublishingAgentGraph({
      jobDescription: sampleJobDescription,
      batchId: 'batch-1',
      settings: settings(),
      executor: new GraphExecutor({
        'fill:职位名称': { success: false, error: 'selector not found' },
      }),
      target: {},
      credentials: {},
      dependencies: {
        getActiveSkill: jest.fn().mockResolvedValue(failingSkill),
        createTask: jest.fn().mockResolvedValue(taskFor(failingSkill)),
        updateTaskCurrentStep: jest.fn().mockResolvedValue(true),
        completeTask,
        createNextSkillVersion: jest
          .fn()
          .mockRejectedValue(new Error('skill version write failed')),
      },
    });

    expect(result.status).toBe('failed');
    expect(result.trace.steps.at(-1)).toEqual(
      expect.objectContaining({
        stepId: 'skill_upgrade',
        action: 'skill_upgrade',
        result: { success: false, error: 'skill version write failed' },
      }),
    );
    expect(completeTask).toHaveBeenCalledWith(
      expect.objectContaining({
        status: 'failed',
        errorMessage: 'skill version write failed',
      }),
    );
  });

  it('stops a late worker after losing the task terminal CAS', async () => {
    const executor = new GraphExecutor();

    await expect(
      runPublishingAgentGraph({
        jobDescription: sampleJobDescription,
        batchId: 'batch-1',
        settings: settings(),
        executor,
        target: { newJobUrl: 'http://localhost:6183/employer/jobs/new' },
        credentials: {},
        dependencies: {
          getActiveSkill: jest.fn().mockResolvedValue(simpleSkill),
          createTask: jest.fn().mockResolvedValue(taskFor(simpleSkill)),
          updateTaskCurrentStep: jest.fn().mockResolvedValue(true),
          completeTask: jest.fn().mockResolvedValue(false),
        },
      }),
    ).rejects.toThrow('publish task is no longer active');
  });

  it('explores and stores a skill before creating the task when DB has no active skill', async () => {
    const executor = new GraphExecutor();
    const getActiveSkill = jest.fn().mockResolvedValue(null);
    const exploreSkill = jest.fn().mockResolvedValue(simpleSkill);
    const createExploredSkill = jest.fn().mockResolvedValue({ ...simpleSkill, id: 'db-skill-1' });
    const createTask = jest.fn().mockResolvedValue(taskFor({ ...simpleSkill, id: 'db-skill-1' }));
    const updateTaskCurrentStep = jest.fn().mockResolvedValue(true);
    const completeTask = jest.fn().mockResolvedValue(true);

    const result = await runPublishingAgentGraph({
      jobDescription: sampleJobDescription,
      batchId: 'batch-1',
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
        updateTaskCurrentStep,
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
        batchId: 'batch-1',
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
    const completeTask = jest.fn().mockResolvedValue(true);
    const updateTaskCurrentStep = jest.fn().mockResolvedValue(true);

    const result = await runPublishingAgentGraph({
      jobDescription: sampleJobDescription,
      batchId: 'batch-1',
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
        updateTaskCurrentStep,
      },
    });

    expect(result.trace.steps.map((step) => step.stepId)).toEqual(['open_new_job', 'fill_title']);
    expect(executor.calls).toEqual([
      'navigate:http://localhost:6183/employer/jobs/new',
      'fill:职位名称:高级前端工程师',
    ]);
    expect(updateTaskCurrentStep.mock.calls.map(([call]) => call.currentStep)).toEqual([
      'open_new_job',
      'fill_title',
      'fill_title',
      'done',
      'done',
      null,
    ]);
  });

  it('sets task and step command context for browser adapters before execution', async () => {
    const executor = new GraphExecutor();

    await runPublishingAgentGraph({
      jobDescription: sampleJobDescription,
      batchId: 'batch-1',
      settings: settings(),
      executor,
      target: {
        loginUrl: 'http://localhost:6183/employer/login',
        newJobUrl: 'http://localhost:6183/employer/jobs/new',
      },
      credentials: { username: 'admin', password: 'boss123' },
      dependencies: {
        getActiveSkill: jest.fn().mockResolvedValue(simpleSkill),
        createTask: jest.fn().mockResolvedValue(taskFor(simpleSkill)),
        updateTaskCurrentStep: jest.fn().mockResolvedValue(true),
        completeTask: jest.fn().mockResolvedValue(true),
      },
    });

    expect(executor.commandContexts).toEqual(
      expect.arrayContaining([
        { stepId: 'explore_or_load_skill' },
        { taskId: 'task-1', stepId: 'open_new_job' },
        { taskId: 'task-1', stepId: 'fill_title' },
      ]),
    );
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
      batchId: 'batch-1',
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
        updateTaskCurrentStep: jest.fn().mockResolvedValue(true),
        completeTask: jest.fn().mockResolvedValue(true),
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
    const updateTaskCurrentStep = jest.fn().mockResolvedValue(true);
    const completeTask = jest.fn().mockResolvedValue(true);

    const result = await runPublishingAgentGraph({
      jobDescription: sampleJobDescription,
      batchId: 'batch-1',
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
        updateTaskCurrentStep,
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
      meta: expect.objectContaining({
        created_from: 'agent',
        repaired_from_skill_id: 'skill-1',
        repaired_from_version: 1,
        failed_step_id: 'fill_title',
        repair_reason: 'title selector changed',
      }),
    });
    expect(completeTask).toHaveBeenCalledWith(
      expect.objectContaining({
        status: 'failed',
        errorMessage: 'selector not found',
      }),
    );
  });

  it('re-explores a failed structured target and patches only that step into a new version', async () => {
    const staleTarget: TargetDescriptor = {
      kind: 'field',
      role: 'textbox',
      name: '旧版职位名称',
      exact: true,
      valueHint: 'title',
      scope: { kind: 'form', name: '发布职位' },
    };
    const repairedTarget: TargetDescriptor = {
      ...staleTarget,
      name: '职位名称',
      stableAttrs: { name: 'title' },
    };
    const failingSkill: PublishSkill = {
      ...simpleSkill,
      steps: [
        {
          id: 'fill_title',
          type: 'action',
          action: 'fill',
          params: { target: staleTarget, value: '{{input.title}}' },
          next: 'fill_company',
          onFail: {
            type: 'fallback_agent',
            reason: 'title target changed',
          },
        },
        {
          id: 'fill_company',
          type: 'action',
          action: 'fill',
          params: { locator: '公司名称', value: '{{input.company}}' },
          next: 'done',
        },
        { id: 'done', type: 'end' },
      ],
    };
    const repairReport: LocatorMatchReport = {
      target: repairedTarget,
      status: 'unique',
      strategy: 'stable_attr:name',
      candidateCount: 1,
      confidence: 0.96,
      chosen: {
        tag: 'input',
        name: 'title',
        accessibleName: '职位名称',
        visible: true,
        enabled: true,
        editable: true,
      },
      candidates: [],
    };
    const executor = new GraphExecutor(
      {
        'fill:旧版职位名称': {
          success: false,
          error: 'not_found_target: old title',
          match: {
            ...repairReport,
            target: staleTarget,
            status: 'not_found',
            candidateCount: 0,
            confidence: 0,
            chosen: undefined,
          },
        },
      },
      repairReport,
    );
    const createNextSkillVersion = jest.fn().mockResolvedValue({
      ...failingSkill,
      id: 'skill-2',
      version: 2,
      steps: [
        {
          ...failingSkill.steps[0],
          params: { target: repairedTarget, value: '{{input.title}}' },
        },
        failingSkill.steps[1],
        failingSkill.steps[2],
      ],
    });

    const result = await runPublishingAgentGraph({
      jobDescription: sampleJobDescription,
      batchId: 'batch-1',
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
        updateTaskCurrentStep: jest.fn().mockResolvedValue(true),
        completeTask: jest.fn().mockResolvedValue(true),
        createNextSkillVersion,
      },
    });

    expect(result.status).toBe('failed');
    expect(executor.calls).toEqual(
      expect.arrayContaining(['snapshotStructured', 'resolveTarget:旧版职位名称']),
    );
    expect(createNextSkillVersion).toHaveBeenCalledWith({
      previousSkill: failingSkill,
      steps: [
        {
          ...failingSkill.steps[0],
          params: { target: repairedTarget, value: '{{input.title}}' },
        },
        failingSkill.steps[1],
        failingSkill.steps[2],
      ],
      meta: expect.objectContaining({
        created_from: 'agent',
        failed_step_id: 'fill_title',
        repair_reason: expect.stringContaining('stable_attr:name'),
      }),
    });
    expect(result.trace.steps).toEqual(
      expect.arrayContaining([
        expect.objectContaining({
          stepId: 'fallback_agent',
          result: expect.objectContaining({
            success: true,
            match: repairReport,
            domSnapshot: expect.objectContaining({ pageState: 'publish_form' }),
          }),
        }),
      ]),
    );
  });

  it('fails with ambiguous_target and does not upgrade when re-explore remains ambiguous', async () => {
    const target: TargetDescriptor = {
      kind: 'button',
      role: 'button',
      name: '发布职位',
      exact: true,
    };
    const ambiguousReport: LocatorMatchReport = {
      target,
      status: 'ambiguous',
      strategy: 'role_name',
      candidateCount: 2,
      confidence: 0.5,
      candidates: [
        {
          tag: 'button',
          accessibleName: '发布职位',
          visible: true,
          enabled: true,
          editable: false,
        },
        {
          tag: 'button',
          accessibleName: '发布职位',
          visible: true,
          enabled: true,
          editable: false,
        },
      ],
      reason: 'two publish buttons',
    };
    const failingSkill: PublishSkill = {
      ...simpleSkill,
      steps: [
        {
          id: 'submit_job',
          type: 'action',
          action: 'click',
          params: { target },
          next: 'done',
          onFail: {
            type: 'fallback_agent',
            reason: 'submit target ambiguous',
          },
        },
        { id: 'done', type: 'end' },
      ],
    };
    const createNextSkillVersion = jest.fn();
    const completeTask = jest.fn().mockResolvedValue(true);

    const result = await runPublishingAgentGraph({
      jobDescription: sampleJobDescription,
      batchId: 'batch-1',
      settings: settings(),
      executor: new GraphExecutor(
        {
          'click:发布职位': {
            success: false,
            error: 'ambiguous_target: two publish buttons',
            match: ambiguousReport,
          },
        },
        ambiguousReport,
      ),
      target: {
        loginUrl: 'http://localhost:6183/employer/login',
        newJobUrl: 'http://localhost:6183/employer/jobs/new',
      },
      credentials: { username: 'admin', password: 'boss123' },
      dependencies: {
        getActiveSkill: jest.fn().mockResolvedValue(failingSkill),
        createTask: jest.fn().mockResolvedValue(taskFor(failingSkill)),
        updateTaskCurrentStep: jest.fn().mockResolvedValue(true),
        completeTask,
        createNextSkillVersion,
      },
    });

    expect(result.status).toBe('failed');
    expect(createNextSkillVersion).not.toHaveBeenCalled();
    expect(completeTask).toHaveBeenCalledWith(
      expect.objectContaining({
        status: 'failed',
        errorMessage: expect.stringContaining('ambiguous_target'),
      }),
    );
    expect(result.trace.steps).toEqual(
      expect.arrayContaining([
        expect.objectContaining({
          stepId: 'fallback_agent',
          result: expect.objectContaining({
            success: false,
            error: expect.stringContaining('ambiguous_target'),
            match: ambiguousReport,
          }),
        }),
      ]),
    );
  });

  it('re-explores and patches submitTarget when add_keywords fails on the submit button', async () => {
    const keywordTarget: TargetDescriptor = {
      kind: 'field',
      role: 'textbox',
      name: '技能标签',
      exact: true,
      valueHint: 'keyword',
      scope: { kind: 'form', name: '发布职位' },
    };
    const staleSubmitTarget: TargetDescriptor = {
      kind: 'button',
      role: 'button',
      name: '旧添加按钮',
      exact: true,
      scope: { kind: 'form', name: '发布职位' },
    };
    const repairedSubmitTarget: TargetDescriptor = {
      ...staleSubmitTarget,
      name: '添加',
      stableAttrs: { id: 'add-keyword' },
    };
    const repairReport: LocatorMatchReport = {
      target: repairedSubmitTarget,
      status: 'unique',
      strategy: 'stable_attr:id',
      candidateCount: 1,
      confidence: 0.98,
      chosen: {
        tag: 'button',
        id: 'add-keyword',
        accessibleName: '添加',
        visible: true,
        enabled: true,
        editable: false,
      },
      candidates: [],
    };
    const failingSkill: PublishSkill = {
      ...simpleSkill,
      steps: [
        {
          id: 'add_keywords',
          type: 'action',
          action: 'add_keywords',
          params: {
            target: keywordTarget,
            values: '{{input.keywords}}',
            submitTarget: staleSubmitTarget,
          },
          next: 'done',
          onFail: {
            type: 'fallback_agent',
            reason: 'keyword submit button changed',
          },
        },
        { id: 'done', type: 'end' },
      ],
    };
    const executor = new GraphExecutor({}, repairReport);
    executor.addKeywords = async (
      target: BrowserTargetInput,
      values: string[],
      submitTarget: BrowserTargetInput,
    ) => {
      const targetName = typeof target === 'string' ? target : target.name;
      const submitName = typeof submitTarget === 'string' ? submitTarget : submitTarget.name;
      executor.calls.push(`addKeywords:${targetName}:${submitName}:${values.join(',')}`);
      return {
        success: false,
        error: 'not_found_target: old keyword submit',
        failedTargetKey: 'submitTarget',
        match: {
          ...repairReport,
          target: staleSubmitTarget,
          status: 'not_found',
          candidateCount: 0,
          confidence: 0,
          chosen: undefined,
        },
      };
    };
    const createNextSkillVersion = jest.fn().mockResolvedValue({
      ...failingSkill,
      id: 'skill-2',
      version: 2,
      steps: [
        {
          ...failingSkill.steps[0],
          params: {
            target: keywordTarget,
            values: '{{input.keywords}}',
            submitTarget: repairedSubmitTarget,
          },
        },
        failingSkill.steps[1],
      ],
    });

    await runPublishingAgentGraph({
      jobDescription: sampleJobDescription,
      batchId: 'batch-1',
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
        updateTaskCurrentStep: jest.fn().mockResolvedValue(true),
        completeTask: jest.fn().mockResolvedValue(true),
        createNextSkillVersion,
      },
    });

    expect(executor.calls).toEqual(expect.arrayContaining(['resolveTarget:旧添加按钮']));
    expect(executor.calls).not.toContain('resolveTarget:技能标签');
    expect(createNextSkillVersion).toHaveBeenCalledWith({
      previousSkill: failingSkill,
      steps: [
        {
          ...failingSkill.steps[0],
          params: {
            target: keywordTarget,
            values: '{{input.keywords}}',
            submitTarget: repairedSubmitTarget,
          },
        },
        failingSkill.steps[1],
      ],
      meta: expect.objectContaining({
        created_from: 'agent',
        failed_step_id: 'add_keywords',
        repair_reason: expect.stringContaining('stable_attr:id'),
      }),
    });
  });
});
