/** @jest-environment node */

import type {
  BrowserExecutor,
  BrowserStepResult,
  LocatorMatchReport,
  StructuredDomSnapshot,
  TargetDescriptor,
} from '@/lib/browser/types';
import type { BrowserWorkflowRunResult } from '@/lib/jd-publishing/types';
import type { CandidateSourceAdapter } from '../adapters/types';
import type { CandidateActionPlan, SearchPlan } from '../types';
import { createCandidateScreeningWorkflowSession } from './executor';
import { buildBossLikeScreeningSkill } from './skill-registry';
import type { BossLikeScreeningExploration, ScreeningWorkflowSkill } from './types';

const searchPlan: SearchPlan = {
  keywords: ['Java'],
  filters: { location: 'Shanghai' },
  priorityTags: ['Spring'],
  retrievalQuery: 'Java Spring',
};

const listHtml = `
  <main>
    <article data-candidate-id="301" data-profile-url="/employer/resumes/301">
      <h2>Ada Lovelace</h2>
      <p data-field="title">Java Engineer</p>
      <p data-field="company">Analytical Engines</p>
      <p data-field="experience">5 years</p>
      <p data-field="resume">Java</p>
    </article>
  </main>
`;

const profileHtml = `
  <main>
    <article data-candidate-id="301" data-profile-url="/employer/resumes/301">
      <h2>Ada Lovelace</h2>
      <p data-field="title">Senior Java Engineer</p>
      <p data-field="company">Analytical Engines</p>
      <p data-field="experience">6 years</p>
      <p data-field="resume">Java Spring Boot PostgreSQL distributed systems</p>
    </article>
  </main>
`;

const repairedDetailSnapshot: StructuredDomSnapshot = {
  url: 'http://localhost:6183/employer/resumes/301',
  title: 'Candidate detail',
  pageState: 'list',
  headings: [],
  forms: [
    {
      name: 'candidate actions',
      fields: [],
      buttons: [
        {
          tag: 'button',
          role: 'button',
          accessibleName: '开始沟通',
          visible: true,
          enabled: true,
          editable: false,
        },
        {
          tag: 'button',
          role: 'button',
          accessibleName: '收藏',
          visible: true,
          enabled: true,
          editable: false,
        },
      ],
    },
  ],
  links: [],
  textBlocks: [],
};

const repairedComposerSnapshot: StructuredDomSnapshot = {
  url: 'http://localhost:6183/employer/resumes/301',
  title: 'Candidate composer',
  pageState: 'list',
  headings: [],
  forms: [
    {
      name: 'candidate composer',
      fields: [
        {
          tag: 'textarea',
          role: 'textbox',
          label: '消息',
          visible: true,
          enabled: true,
          editable: true,
        },
      ],
      buttons: [
        {
          tag: 'button',
          role: 'button',
          accessibleName: '发送',
          visible: true,
          enabled: true,
          editable: false,
        },
      ],
    },
  ],
  links: [],
  textBlocks: [],
};

function makeSkill(overrides: Partial<ScreeningWorkflowSkill> = {}): ScreeningWorkflowSkill {
  return {
    ...buildBossLikeScreeningSkill(),
    id: 'screen-v1',
    ...overrides,
  };
}

function successfulRun(
  observations: Record<string, string> = {},
  traceSteps: BrowserWorkflowRunResult['traceSteps'] = [],
): BrowserWorkflowRunResult {
  return {
    status: 'success',
    currentStepId: null,
    traceSteps,
    observations,
  };
}

function failedContactRun(target: TargetDescriptor): BrowserWorkflowRunResult {
  const result: BrowserStepResult = {
    success: false,
    error: `not_found_target: ${target.name}`,
  };
  return {
    status: 'fallback',
    currentStepId: 'contact_open_greeting',
    traceSteps: [
      {
        stepId: 'contact_open_greeting',
        action: 'click',
        params: { target },
        result,
      },
    ],
    observations: {},
    failedStep: {
      stepId: 'contact_open_greeting',
      action: 'click',
      params: { target },
      result,
    },
    onFail: { type: 'fallback_agent', reason: 'greeting changed' },
  };
}

function uniqueTargetReport(target: TargetDescriptor): LocatorMatchReport {
  return {
    target,
    status: 'unique',
    strategy: 'role',
    candidateCount: 1,
    confidence: 1,
    candidates: [],
  };
}

type MockedExecutor = BrowserExecutor & {
  snapshotStructured: jest.MockedFunction<NonNullable<BrowserExecutor['snapshotStructured']>>;
  resolveTarget: jest.MockedFunction<NonNullable<BrowserExecutor['resolveTarget']>>;
};

function makeExecutor(): MockedExecutor {
  return {
    navigate: jest.fn().mockResolvedValue({ success: true }),
    fill: jest.fn().mockResolvedValue({ success: true }),
    click: jest.fn().mockResolvedValue({ success: true }),
    waitForUrl: jest.fn().mockResolvedValue({ success: true }),
    waitForText: jest.fn().mockResolvedValue({ success: true }),
    check: jest.fn().mockResolvedValue(true),
    snapshot: jest.fn().mockResolvedValue('<main />'),
    snapshotStructured: jest.fn(),
    resolveTarget: jest.fn(),
    close: jest.fn().mockResolvedValue(undefined),
  };
}

function makeAdapter(executor = makeExecutor()): jest.Mocked<CandidateSourceAdapter> {
  return {
    platform: 'boss-like',
    getBrowserExecutor: jest.fn(() => executor),
    getWorkflowExploreContext: jest.fn(() => ({
      baseUrl: 'http://localhost:6183',
      credentials: { username: 'admin', password: 'boss123' },
    })),
    loginIfNeeded: jest.fn().mockResolvedValue(undefined),
    searchCandidates: jest.fn(),
    enrichCandidate: jest.fn(),
    chatCandidate: jest.fn(),
    collectCandidate: jest.fn(),
    close: jest.fn().mockResolvedValue(undefined),
  };
}

function makeDependencies(overrides: Record<string, unknown> = {}) {
  const executor = makeExecutor();
  const adapter = makeAdapter(executor);
  const skill = makeSkill();
  return {
    adapter,
    executor,
    userId: 'user-1',
    runId: 'run-1',
    jobDescriptionId: 'jd-1',
    platform: 'boss-like' as const,
    getActiveSkill: jest.fn().mockResolvedValue(skill),
    getSkillById: jest.fn().mockResolvedValue(skill),
    exploreSkill: jest.fn(),
    createExploredSkill: jest.fn(async (value) => value),
    createNextSkillVersion: jest.fn(async ({ steps }) =>
      makeSkill({ id: 'screen-v2', version: 2, steps }),
    ),
    updateRun: jest.fn().mockResolvedValue(null),
    createRunEvent: jest.fn().mockResolvedValue(null),
    runBrowserWorkflow: jest.fn(),
    ...overrides,
  };
}

describe('CandidateScreeningWorkflowSession', () => {
  it('parses listHtml and profileHtml from shared workflow observations', async () => {
    const dependencies = makeDependencies();
    dependencies.runBrowserWorkflow
      .mockResolvedValueOnce(successfulRun({ listHtml }))
      .mockResolvedValueOnce(successfulRun({ profileHtml }));
    const session = createCandidateScreeningWorkflowSession(dependencies);

    await session.loadOrExplore({ searchPlan, stage: 'searching_live' });
    const searched = await session.runSearchKeyword({ keyword: 'Java', maxCandidates: 5 });
    const detail = await session.observeCandidateProfile(searched.candidates[0]!);

    expect(searched).toEqual({
      keyword: 'Java',
      candidates: [
        expect.objectContaining({ name: 'Ada Lovelace', profileUrl: expect.any(String) }),
      ],
    });
    expect(detail.resumeText).toContain('Java Spring Boot');
    expect(dependencies.adapter.searchCandidates).not.toHaveBeenCalled();
    expect(dependencies.adapter.enrichCandidate).not.toHaveBeenCalled();
    expect(dependencies.runBrowserWorkflow).toHaveBeenNthCalledWith(
      1,
      expect.objectContaining({
        currentStepId: 'search_open',
        context: expect.objectContaining({
          input: expect.objectContaining({
            keyword: 'Java',
            searchUrl: 'http://localhost:6183/employer/resumes?keyword=Java',
          }),
        }),
      }),
    );
    expect(dependencies.runBrowserWorkflow).toHaveBeenNthCalledWith(
      2,
      expect.objectContaining({ currentStepId: 'detail_open' }),
    );
  });

  it('reuses the explorer first list observation exactly once', async () => {
    const exploredSkill = makeSkill({ id: 'explored-v1' });
    const exploration: BossLikeScreeningExploration & ScreeningWorkflowSkill = {
      ...exploredSkill,
      skill: exploredSkill,
      firstKeyword: 'Java',
      firstListHtml: listHtml,
    };
    const dependencies = makeDependencies({
      getActiveSkill: jest.fn().mockResolvedValue(null),
      exploreSkill: jest.fn().mockResolvedValue(exploration),
      createExploredSkill: jest.fn().mockResolvedValue(exploredSkill),
    });
    dependencies.runBrowserWorkflow.mockResolvedValue(successfulRun({ listHtml }));
    const session = createCandidateScreeningWorkflowSession(dependencies);

    await session.loadOrExplore({ searchPlan, stage: 'searching_live' });
    await session.runSearchKeyword({ keyword: 'Java', maxCandidates: 5 });
    await session.runSearchKeyword({ keyword: 'Java', maxCandidates: 5 });

    expect(dependencies.runBrowserWorkflow).toHaveBeenCalledTimes(1);
  });

  it('records every shared-runner primitive step and clears the terminal step', async () => {
    const dependencies = makeDependencies();
    dependencies.runBrowserWorkflow.mockImplementation(async ({ onStep }) => {
      await onStep?.({ stepId: 'search_open' });
      await onStep?.({ stepId: 'search_observe' });
      return successfulRun({ listHtml });
    });
    const session = createCandidateScreeningWorkflowSession(dependencies);

    await session.loadOrExplore({ searchPlan, stage: 'searching_live' });
    await session.runSearchKeyword({ keyword: 'Java', maxCandidates: 5 });

    expect(dependencies.updateRun).toHaveBeenCalledWith(
      expect.objectContaining({ skillId: 'screen-v1', currentWorkflowStep: 'search_open' }),
    );
    expect(dependencies.updateRun).toHaveBeenCalledWith(
      expect.objectContaining({ skillId: 'screen-v1', currentWorkflowStep: 'search_observe' }),
    );
    expect(dependencies.updateRun).toHaveBeenLastCalledWith(
      expect.objectContaining({ skillId: 'screen-v1', currentWorkflowStep: null }),
    );
    expect(dependencies.createRunEvent).toHaveBeenCalledWith(
      expect.objectContaining({
        level: 'info',
        detail: expect.objectContaining({ workflowStep: 'search_observe', skillId: 'screen-v1' }),
      }),
    );
  });

  it('patches greeting, message, and send then retries one failed contact segment', async () => {
    const skill = makeSkill();
    const failedGreeting = skill.steps.find(
      (step): step is Extract<(typeof skill.steps)[number], { type: 'action' }> =>
        step.id === 'contact_open_greeting' && step.type === 'action',
    )?.params.target as TargetDescriptor;
    const dependencies = makeDependencies({ getActiveSkill: jest.fn().mockResolvedValue(skill) });
    dependencies.runBrowserWorkflow
      .mockResolvedValueOnce(failedContactRun(failedGreeting))
      .mockResolvedValueOnce(successfulRun());
    dependencies.executor.snapshotStructured
      .mockResolvedValueOnce(repairedDetailSnapshot)
      .mockResolvedValueOnce(repairedComposerSnapshot);
    dependencies.executor.resolveTarget.mockImplementation(async (target) =>
      uniqueTargetReport(target as TargetDescriptor),
    );
    const session = createCandidateScreeningWorkflowSession(dependencies);
    const candidate = {
      candidateId: 'candidate-301',
      displayName: 'Ada Lovelace',
      profileUrl: 'http://localhost:6183/employer/resumes/301',
    };
    const plan: CandidateActionPlan = {
      action: 'chat',
      priority: 'high',
      message: 'Hello Ada',
      reason: 'Java match',
    };

    await session.loadOrExplore({ searchPlan, stage: 'executing_actions' });
    await expect(session.contactAndCollectCandidate(candidate, plan)).resolves.toEqual(
      expect.objectContaining({ success: true }),
    );

    const repairedSkill = dependencies.createNextSkillVersion.mock.calls[0]?.[0]?.steps;
    expect(repairedSkill).toEqual(
      expect.arrayContaining([
        expect.objectContaining({
          id: 'contact_open_greeting',
          params: expect.objectContaining({
            target: expect.objectContaining({ name: '开始沟通' }),
          }),
        }),
        expect.objectContaining({
          id: 'contact_fill_message',
          params: expect.objectContaining({ target: expect.objectContaining({ name: '消息' }) }),
        }),
        expect.objectContaining({
          id: 'contact_send',
          params: expect.objectContaining({ target: expect.objectContaining({ name: '发送' }) }),
        }),
      ]),
    );
    expect(dependencies.createNextSkillVersion).toHaveBeenCalledTimes(1);
    expect(dependencies.runBrowserWorkflow).toHaveBeenCalledTimes(2);
    expect(dependencies.updateRun).toHaveBeenCalledWith(
      expect.objectContaining({
        skillId: 'screen-v2',
        currentWorkflowStep: 'contact_open_greeting',
      }),
    );
  });

  it('repairs message and send from a composer snapshot while preserving the grouped greeting step', async () => {
    const skill = makeSkill();
    const failedMessage = skill.steps.find(
      (step): step is Extract<(typeof skill.steps)[number], { type: 'action' }> =>
        step.id === 'contact_fill_message' && step.type === 'action',
    )?.params.target as TargetDescriptor;
    const existingGreeting = skill.steps.find(
      (step): step is Extract<(typeof skill.steps)[number], { type: 'action' }> =>
        step.id === 'contact_open_greeting' && step.type === 'action',
    )?.params.target as TargetDescriptor;
    const dependencies = makeDependencies({ getActiveSkill: jest.fn().mockResolvedValue(skill) });
    dependencies.runBrowserWorkflow
      .mockResolvedValueOnce({
        ...failedContactRun(failedMessage),
        currentStepId: 'contact_fill_message',
        traceSteps: [
          {
            stepId: 'contact_fill_message',
            action: 'fill',
            params: { target: failedMessage, value: 'Hello Ada' },
            result: { success: false, error: `not_found_target: ${failedMessage.name}` },
          },
        ],
        failedStep: {
          stepId: 'contact_fill_message',
          action: 'fill',
          params: { target: failedMessage, value: 'Hello Ada' },
          result: { success: false, error: `not_found_target: ${failedMessage.name}` },
        },
      })
      .mockResolvedValueOnce(successfulRun());
    dependencies.executor.snapshotStructured.mockResolvedValue(repairedComposerSnapshot);
    dependencies.executor.resolveTarget.mockImplementation(async (target) =>
      uniqueTargetReport(target as TargetDescriptor),
    );
    const session = createCandidateScreeningWorkflowSession(dependencies);

    await session.loadOrExplore({ searchPlan, stage: 'executing_actions' });
    await expect(
      session.contactAndCollectCandidate(
        {
          candidateId: 'candidate-301',
          displayName: 'Ada Lovelace',
          profileUrl: 'http://localhost:6183/employer/resumes/301',
        },
        { action: 'chat', priority: 'high', message: 'Hello Ada', reason: 'Java match' },
      ),
    ).resolves.toEqual(expect.objectContaining({ success: true }));

    const repairedSteps = dependencies.createNextSkillVersion.mock.calls[0]?.[0]?.steps;
    expect(repairedSteps).toEqual(
      expect.arrayContaining([
        expect.objectContaining({
          id: 'contact_open_greeting',
          params: expect.objectContaining({ target: existingGreeting }),
        }),
        expect.objectContaining({
          id: 'contact_fill_message',
          params: expect.objectContaining({ target: expect.objectContaining({ name: '消息' }) }),
        }),
        expect.objectContaining({
          id: 'contact_send',
          params: expect.objectContaining({ target: expect.objectContaining({ name: '发送' }) }),
        }),
      ]),
    );
    expect(dependencies.runBrowserWorkflow).toHaveBeenCalledTimes(2);
  });

  it('records a second contact failure and returns it without another repair', async () => {
    const skill = makeSkill();
    const failedGreeting = skill.steps.find(
      (step): step is Extract<(typeof skill.steps)[number], { type: 'action' }> =>
        step.id === 'contact_open_greeting' && step.type === 'action',
    )?.params.target as TargetDescriptor;
    const dependencies = makeDependencies({ getActiveSkill: jest.fn().mockResolvedValue(skill) });
    dependencies.runBrowserWorkflow
      .mockResolvedValueOnce(failedContactRun(failedGreeting))
      .mockResolvedValueOnce(failedContactRun(failedGreeting));
    dependencies.executor.snapshotStructured
      .mockResolvedValueOnce(repairedDetailSnapshot)
      .mockResolvedValueOnce(repairedComposerSnapshot);
    dependencies.executor.resolveTarget.mockImplementation(async (target) =>
      uniqueTargetReport(target as TargetDescriptor),
    );
    const session = createCandidateScreeningWorkflowSession(dependencies);

    await session.loadOrExplore({ searchPlan, stage: 'executing_actions' });
    const result = await session.contactAndCollectCandidate(
      {
        candidateId: 'candidate-301',
        displayName: 'Ada Lovelace',
        profileUrl: 'http://localhost:6183/employer/resumes/301',
      },
      { action: 'chat', priority: 'high', message: 'Hello Ada', reason: 'Java match' },
    );

    expect(result).toEqual(expect.objectContaining({ success: false }));
    expect(dependencies.createNextSkillVersion).toHaveBeenCalledTimes(1);
    expect(dependencies.runBrowserWorkflow).toHaveBeenCalledTimes(2);
    expect(dependencies.createRunEvent).toHaveBeenCalledWith(
      expect.objectContaining({
        level: 'error',
        message: 'Workflow 重试失败：contact_open_greeting',
      }),
    );
  });

  it('uses no adapter browser action while collecting through collect_open', async () => {
    const dependencies = makeDependencies();
    dependencies.runBrowserWorkflow.mockResolvedValue(successfulRun());
    const session = createCandidateScreeningWorkflowSession(dependencies);

    await session.loadOrExplore({ searchPlan, stage: 'executing_actions' });
    await session.collectCandidate({
      candidateId: 'candidate-301',
      displayName: 'Ada Lovelace',
      profileUrl: 'http://localhost:6183/employer/resumes/301',
    });

    expect(dependencies.runBrowserWorkflow).toHaveBeenCalledWith(
      expect.objectContaining({ currentStepId: 'collect_open' }),
    );
    expect(dependencies.adapter.collectCandidate).not.toHaveBeenCalled();
    expect(dependencies.adapter.chatCandidate).not.toHaveBeenCalled();
  });
});
