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
import {
  SCREENING_STEP_IDS,
  type BossLikeScreeningExploration,
  type ScreeningWorkflowSkill,
} from './types';

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

const repairedSearchSnapshot: StructuredDomSnapshot = {
  url: 'http://localhost:6183/employer/resumes',
  title: 'Candidate search',
  pageState: 'list',
  headings: [],
  forms: [
    {
      name: 'candidate search',
      fields: [
        {
          tag: 'input',
          role: 'textbox',
          label: '搜索候选人',
          visible: true,
          enabled: true,
          editable: true,
        },
      ],
      buttons: [
        {
          tag: 'button',
          role: 'button',
          accessibleName: '开始检索',
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

const ambiguousSearchSnapshot: StructuredDomSnapshot = {
  ...repairedSearchSnapshot,
  forms: [
    {
      name: '人才搜索',
      fields: repairedSearchSnapshot.forms[0]!.fields,
      buttons: [
        {
          tag: 'button',
          role: 'button',
          accessibleName: '执行检索',
          id: 'search-preview',
          visible: true,
          enabled: true,
          editable: false,
        },
        {
          tag: 'button',
          role: 'button',
          accessibleName: '执行检索',
          id: 'search-now',
          visible: true,
          enabled: true,
          editable: false,
        },
      ],
    },
  ],
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

function ambiguousTargetReport(target: TargetDescriptor): LocatorMatchReport {
  return {
    target,
    status: 'ambiguous',
    strategy: 'role',
    candidateCount: 2,
    confidence: 0.5,
    candidates: [],
    reason: 'multiple matching buttons',
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

  it('replaces an active browser-v2 workflow with stale search and send semantics', async () => {
    const staleSkill = makeSkill({
      id: 'screen-v5',
      version: 5,
      steps: makeSkill().steps.map((step) => {
        if (step.id === SCREENING_STEP_IDS.searchWait && step.type === 'action') {
          return {
            ...step,
            action: 'wait_for_url' as const,
            params: { url: '{{input.searchUrl}}' },
          };
        }
        if (step.id === SCREENING_STEP_IDS.contactWaitSuccess && step.type === 'action') {
          return {
            ...step,
            action: 'wait_for_url' as const,
            params: { url: '{{input.profileUrl}}/messages' },
          };
        }
        return step;
      }),
    });
    const exploredSkill = makeSkill({ id: 'screen-v6', version: 6 });
    const exploration: BossLikeScreeningExploration & ScreeningWorkflowSkill = {
      ...exploredSkill,
      skill: exploredSkill,
      firstKeyword: 'Java',
      firstListHtml: listHtml,
    };
    const dependencies = makeDependencies({
      getActiveSkill: jest.fn().mockResolvedValue(staleSkill),
      exploreSkill: jest.fn().mockResolvedValue(exploration),
      createExploredSkill: jest.fn().mockResolvedValue(exploredSkill),
    });
    const session = createCandidateScreeningWorkflowSession(dependencies);

    await expect(session.loadOrExplore({ searchPlan, stage: 'searching_live' })).resolves.toEqual(
      expect.objectContaining({ id: 'screen-v6', version: 6 }),
    );

    expect(dependencies.exploreSkill).toHaveBeenCalledTimes(1);
    expect(dependencies.createExploredSkill).toHaveBeenCalledTimes(1);
    expect(dependencies.createRunEvent).toHaveBeenCalledWith(
      expect.objectContaining({
        message: expect.stringContaining('重新探索'),
        detail: expect.objectContaining({
          previousSkillId: 'screen-v5',
          workflowVersion: 5,
        }),
      }),
    );
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

  it('restarts a repaired search at fill so the retry captures a fresh pre-submit snapshot', async () => {
    const skill = makeSkill();
    const failedTarget = skill.steps.find(
      (step): step is Extract<(typeof skill.steps)[number], { type: 'action' }> =>
        step.id === SCREENING_STEP_IDS.searchSubmit && step.type === 'action',
    )?.params.target as TargetDescriptor;
    const failedResult = {
      success: false,
      error: `not_found_target: ${failedTarget.name}`,
    };
    const dependencies = makeDependencies();
    dependencies.runBrowserWorkflow
      .mockResolvedValueOnce({
        status: 'fallback',
        currentStepId: SCREENING_STEP_IDS.searchSubmit,
        traceSteps: [
          {
            stepId: SCREENING_STEP_IDS.searchSubmit,
            action: 'click',
            params: { target: failedTarget },
            result: failedResult,
          },
        ],
        observations: {},
        failedStep: {
          stepId: SCREENING_STEP_IDS.searchSubmit,
          action: 'click',
          params: { target: failedTarget },
          result: failedResult,
        },
        onFail: { type: 'fallback_agent', reason: 'search submit changed' },
      })
      .mockResolvedValueOnce(successfulRun({ listHtml }));
    dependencies.executor.snapshotStructured.mockResolvedValue(repairedSearchSnapshot);
    dependencies.executor.resolveTarget.mockImplementation(async (target) =>
      uniqueTargetReport(target as TargetDescriptor),
    );
    const session = createCandidateScreeningWorkflowSession(dependencies);

    await session.loadOrExplore({ searchPlan, stage: 'searching_live' });
    await expect(session.runSearchKeyword({ keyword: 'Java', maxCandidates: 5 })).resolves.toEqual(
      expect.objectContaining({ candidates: expect.any(Array) }),
    );

    expect(dependencies.runBrowserWorkflow).toHaveBeenNthCalledWith(
      2,
      expect.objectContaining({ currentStepId: SCREENING_STEP_IDS.searchFill }),
    );
  });

  it('asks the LLM fallback agent to repair an ambiguous target, versions it, and retries', async () => {
    const skill = makeSkill({ id: 'screen-v5', version: 5 });
    const failedTarget = skill.steps.find(
      (step): step is Extract<(typeof skill.steps)[number], { type: 'action' }> =>
        step.id === SCREENING_STEP_IDS.searchSubmit && step.type === 'action',
    )?.params.target as TargetDescriptor;
    const agentTarget: TargetDescriptor = {
      kind: 'button',
      role: 'button',
      name: '执行检索',
      exact: true,
      stableAttrs: { id: 'search-now' },
      scope: { kind: 'form', name: '人才搜索' },
    };
    const repairWorkflowWithAgent = jest.fn().mockResolvedValue({
      target: agentTarget,
      reason: 'LLM selected the uniquely identifiable search button',
      promptId: 'candidate-screening.workflow-repair',
      promptVersion: 'candidate-workflow-repair-v1',
      provider: 'test',
      model: 'test-model',
    });
    const failedResult = {
      success: false,
      error: `ambiguous_target: ${failedTarget.name}`,
    };
    const dependencies = makeDependencies({
      getActiveSkill: jest.fn().mockResolvedValue(skill),
      repairWorkflowWithAgent,
    });
    dependencies.runBrowserWorkflow
      .mockResolvedValueOnce({
        status: 'fallback',
        currentStepId: SCREENING_STEP_IDS.searchSubmit,
        traceSteps: [
          {
            stepId: SCREENING_STEP_IDS.searchSubmit,
            action: 'click',
            params: { target: failedTarget },
            result: failedResult,
          },
        ],
        observations: {},
        failedStep: {
          stepId: SCREENING_STEP_IDS.searchSubmit,
          action: 'click',
          params: { target: failedTarget },
          result: failedResult,
        },
        onFail: { type: 'fallback_agent', reason: 'search submit changed' },
      })
      .mockResolvedValueOnce(successfulRun({ listHtml }));
    dependencies.executor.snapshotStructured.mockResolvedValue(ambiguousSearchSnapshot);
    dependencies.executor.resolveTarget.mockImplementation(async (target) =>
      (target as TargetDescriptor).stableAttrs?.id === 'search-now'
        ? uniqueTargetReport(target as TargetDescriptor)
        : ambiguousTargetReport(target as TargetDescriptor),
    );
    const session = createCandidateScreeningWorkflowSession(dependencies);

    await session.loadOrExplore({ searchPlan, stage: 'searching_live' });
    await expect(session.runSearchKeyword({ keyword: 'Java', maxCandidates: 5 })).resolves.toEqual(
      expect.objectContaining({ candidates: expect.any(Array) }),
    );

    expect(repairWorkflowWithAgent).toHaveBeenCalledWith(
      expect.objectContaining({
        skillId: 'screen-v5',
        workflowVersion: 5,
        failedStepId: SCREENING_STEP_IDS.searchSubmit,
        targetKey: 'searchSubmit',
        structuredSnapshot: ambiguousSearchSnapshot,
      }),
    );
    expect(dependencies.createNextSkillVersion).toHaveBeenCalledWith(
      expect.objectContaining({
        meta: expect.objectContaining({
          created_from: 'agent',
          repair_strategy: 'llm',
          repaired_from_version: 5,
          repair_agent_prompt_version: 'candidate-workflow-repair-v1',
        }),
        steps: expect.arrayContaining([
          expect.objectContaining({
            id: SCREENING_STEP_IDS.searchSubmit,
            params: expect.objectContaining({ target: agentTarget }),
          }),
        ]),
      }),
    );
    expect(dependencies.createRunEvent).toHaveBeenCalledWith(
      expect.objectContaining({
        level: 'info',
        message: `Workflow Fallback Agent 介入：${SCREENING_STEP_IDS.searchSubmit}`,
      }),
    );
    expect(dependencies.runBrowserWorkflow).toHaveBeenCalledTimes(2);
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

  it('reopens the real detail page before relearning a grouped composer repair', async () => {
    const skill = makeSkill();
    const failedMessage = skill.steps.find(
      (step): step is Extract<(typeof skill.steps)[number], { type: 'action' }> =>
        step.id === 'contact_fill_message' && step.type === 'action',
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
    dependencies.executor.snapshotStructured
      .mockResolvedValueOnce(repairedComposerSnapshot)
      .mockResolvedValueOnce(repairedDetailSnapshot)
      .mockResolvedValueOnce(repairedComposerSnapshot);
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
    expect(dependencies.executor.navigate).toHaveBeenCalledWith(
      'http://localhost:6183/employer/resumes/301',
    );
    expect(dependencies.executor.click).toHaveBeenCalledWith(
      expect.objectContaining({ name: '开始沟通' }),
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

  it('reports a successful greeting and failed collection separately for recovery', async () => {
    const dependencies = makeDependencies();
    dependencies.runBrowserWorkflow.mockResolvedValue({
      status: 'failed',
      currentStepId: 'collect_click',
      observations: {},
      traceSteps: [
        {
          stepId: 'contact_wait_success',
          action: 'wait_for_text',
          params: { text: '已发送' },
          result: { success: true },
        },
        {
          stepId: 'collect_click',
          action: 'click',
          params: { target: { kind: 'role', name: '收藏', role: 'button' } },
          result: { success: false, error: 'collect target missing' },
        },
      ],
      failedStep: {
        stepId: 'collect_click',
        action: 'click',
        params: { target: { kind: 'role', name: '收藏', role: 'button' } },
        result: { success: false, error: 'collect target missing' },
      },
    });
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

    expect(result).toMatchObject({
      success: false,
      error: 'collect target missing',
      browserTrace: { contact: 'success', collect: 'failed' },
    });
  });

  it('preserves confirmed contact evidence when a repaired collect retry succeeds', async () => {
    const skill = makeSkill();
    const collectTarget = skill.steps.find(
      (step): step is Extract<(typeof skill.steps)[number], { type: 'action' }> =>
        step.id === SCREENING_STEP_IDS.collectClick && step.type === 'action',
    )?.params.target as TargetDescriptor;
    const collectFailure = {
      success: false,
      error: 'not_found_target: 收藏',
    };
    const dependencies = makeDependencies({ getActiveSkill: jest.fn().mockResolvedValue(skill) });
    dependencies.runBrowserWorkflow
      .mockResolvedValueOnce({
        status: 'fallback',
        currentStepId: SCREENING_STEP_IDS.collectClick,
        traceSteps: [
          {
            stepId: SCREENING_STEP_IDS.contactWaitSuccess,
            action: 'wait_for_text',
            params: { text: '消息已发送' },
            result: { success: true },
          },
          {
            stepId: SCREENING_STEP_IDS.collectClick,
            action: 'click',
            params: { target: collectTarget },
            result: collectFailure,
          },
        ],
        observations: {},
        failedStep: {
          stepId: SCREENING_STEP_IDS.collectClick,
          action: 'click',
          params: { target: collectTarget },
          result: collectFailure,
        },
        onFail: { type: 'fallback_agent', reason: 'collect button changed' },
      })
      .mockResolvedValueOnce(
        successfulRun({}, [
          {
            stepId: SCREENING_STEP_IDS.collectClick,
            action: 'click',
            params: { target: collectTarget },
            result: { success: true },
          },
        ]),
      );
    dependencies.executor.snapshotStructured.mockResolvedValue(repairedDetailSnapshot);
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

    expect(result).toEqual(
      expect.objectContaining({
        success: true,
        browserTrace: expect.objectContaining({ contact: 'success', collect: 'success' }),
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

  it('does not expose high-level screening actions for a browser-v2 skill', async () => {
    const dependencies = makeDependencies();
    const session = createCandidateScreeningWorkflowSession(dependencies);

    await session.loadExact({ skillId: 'screen-v1', stage: 'searching_live' });

    expect('searchCandidates' in session).toBe(false);
    expect('enrichCandidate' in session).toBe(false);
    expect('chatCandidate' in session).toBe(false);
  });
});
