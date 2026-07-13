/** @jest-environment node */

import type {
  BrowserExecutor,
  BrowserStepResult,
  LocatorMatchReport,
  StructuredDomSnapshot,
  TargetDescriptor,
} from '@/lib/browser/types';
import type {
  CandidateBrowserActionOptions,
  CandidateSourceAdapter,
  RawCandidateBatch,
  SearchOptions,
} from '../adapters/types';
import { CandidateAdapterTargetError } from '../adapters/types';
import type { RawCandidate } from '../ingest';
import type { CandidateActionPlan, SearchPlan } from '../types';
import { buildBossLikeScreeningSkill } from './skill-registry';
import { createCandidateScreeningWorkflowSession, ScreeningWorkflowTargetError } from './executor';
import type { ScreeningWorkflowSkill } from './types';

const searchPlan: SearchPlan = {
  keywords: ['TypeScript'],
  filters: { location: 'Shanghai' },
  priorityTags: ['React'],
  retrievalQuery: 'TypeScript React',
};

const rawCandidate: RawCandidate = {
  platformCandidateId: 'candidate-1',
  name: 'Ada Lovelace',
  title: 'Senior Frontend Engineer',
  company: 'Analytical Engines',
  resumeText: 'TypeScript React browser automation',
  profileUrl: '/employer/resumes/1',
};

const shortResumeCandidate: RawCandidate = {
  ...rawCandidate,
  resumeText: 'React',
};

const enrichedCandidate: RawCandidate = {
  ...shortResumeCandidate,
  resumeText: 'React TypeScript browser automation accessible UI testing',
};

const oldTarget: TargetDescriptor = {
  kind: 'button',
  role: 'button',
  name: '搜索',
  exact: true,
};

const repairedTarget: TargetDescriptor = {
  kind: 'button',
  role: 'button',
  name: '开始检索',
  exact: true,
  stableAttrs: { testId: 'candidate-search-submit' },
};

const repairedComposerTarget: TargetDescriptor = {
  kind: 'button',
  role: 'button',
  name: '确认发送',
  exact: true,
  stableAttrs: { testId: 'candidate-send-submit' },
};

const repairedDetailTarget: TargetDescriptor = {
  kind: 'container',
  name: '候选人简历详情',
  exact: true,
  stableAttrs: { testId: 'candidate-resume-detail' },
  scope: { kind: 'page' },
};

const repairedListSnapshot: StructuredDomSnapshot = {
  url: 'http://localhost:6183/employer/resumes',
  title: '人才搜索',
  pageState: 'list',
  headings: [],
  forms: [
    {
      name: '人才搜索',
      fields: [
        {
          tag: 'input',
          role: 'textbox',
          label: '关键词',
          name: 'keyword',
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
          name: 'candidate-search-submit',
          testId: 'candidate-search-submit',
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
  url: 'http://localhost:6183/employer/resumes/1',
  title: '沟通候选人',
  pageState: 'list',
  headings: [],
  forms: [
    {
      name: '沟通候选人',
      fields: [
        {
          tag: 'textarea',
          role: 'textbox',
          label: '消息内容',
          name: 'message',
          visible: true,
          enabled: true,
          editable: true,
        },
      ],
      buttons: [
        {
          tag: 'button',
          role: 'button',
          accessibleName: '确认发送',
          name: 'candidate-send-submit',
          testId: 'candidate-send-submit',
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

const repairedDetailSnapshot: StructuredDomSnapshot = {
  url: 'http://localhost:6183/employer/resumes/1',
  title: '候选人详情',
  pageState: 'list',
  headings: [
    {
      tag: 'h1',
      text: '候选人简历详情',
      testId: 'candidate-resume-detail',
      visible: true,
      enabled: true,
      editable: false,
    },
  ],
  forms: [
    {
      name: '候选人操作',
      fields: [],
      buttons: [
        {
          tag: 'button',
          role: 'button',
          accessibleName: '打招呼',
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

async function* batches(...items: RawCandidateBatch[]): AsyncIterable<RawCandidateBatch> {
  for (const item of items) {
    yield item;
  }
}

async function collectBatches(
  source: AsyncIterable<RawCandidateBatch>,
): Promise<RawCandidateBatch[]> {
  const result: RawCandidateBatch[] = [];
  for await (const batch of source) {
    result.push(batch);
  }
  return result;
}

function makeSkill(overrides: Partial<ScreeningWorkflowSkill> = {}): ScreeningWorkflowSkill {
  return {
    ...buildBossLikeScreeningSkill(),
    id: 'screen-v1',
    ...overrides,
  };
}

function uniqueTargetReport(target: TargetDescriptor): LocatorMatchReport {
  return {
    target,
    status: 'unique',
    strategy: 'test-id',
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
    reason: 'two search buttons are visible',
  };
}

function browserTargetError(
  stepId: string,
  targetKey: string,
  target: TargetDescriptor,
): ScreeningWorkflowTargetError {
  const result: BrowserStepResult = {
    success: false,
    error: `not_found_target: ${target.name}`,
    failedTargetKey: 'target',
  };
  return new ScreeningWorkflowTargetError({ stepId, targetKey, target, result });
}

function workflowTarget(
  skill: ScreeningWorkflowSkill,
  stepId: string,
  targetKey: string,
): TargetDescriptor {
  const step = skill.steps.find(
    (candidate): candidate is Extract<(typeof skill.steps)[number], { type: 'action' }> =>
      candidate.id === stepId && candidate.type === 'action',
  );
  const targets = step?.params.targets as Record<string, unknown> | undefined;
  const target = targets?.[targetKey];
  if (!target || typeof target === 'string') {
    throw new Error(`workflow target fixture is missing: ${stepId}.${targetKey}`);
  }
  return target as TargetDescriptor;
}

function adapterTargetError(params: {
  target: TargetDescriptor;
  targetKey: 'greetButton' | 'messageInput' | 'sendButton' | 'collectButton';
}): CandidateAdapterTargetError {
  return new CandidateAdapterTargetError({
    result: { success: false, error: `not_found_target: ${params.target.name}` },
    target: params.target,
    targetKey: params.targetKey,
  });
}

type MockedBrowserExecutor = BrowserExecutor & {
  snapshotStructured: jest.MockedFunction<NonNullable<BrowserExecutor['snapshotStructured']>>;
  resolveTarget: jest.MockedFunction<NonNullable<BrowserExecutor['resolveTarget']>>;
};

function makeExecutor(): MockedBrowserExecutor {
  return {
    navigate: jest.fn().mockResolvedValue({ success: true }),
    fill: jest.fn().mockResolvedValue({ success: true }),
    click: jest.fn().mockResolvedValue({ success: true }),
    waitForUrl: jest.fn().mockResolvedValue({ success: true }),
    check: jest.fn().mockResolvedValue(true),
    snapshotStructured: jest.fn().mockResolvedValue(repairedListSnapshot),
    resolveTarget: jest.fn().mockResolvedValue(uniqueTargetReport(repairedTarget)),
  } as MockedBrowserExecutor;
}

function makeAdapter(executor: BrowserExecutor): jest.Mocked<CandidateSourceAdapter> {
  return {
    platform: 'boss-like',
    getBrowserExecutor: jest.fn(() => executor),
    loginIfNeeded: jest.fn().mockResolvedValue(undefined),
    searchCandidates: jest.fn<
      AsyncIterable<RawCandidateBatch>,
      [SearchPlan, SearchOptions, CandidateBrowserActionOptions?]
    >(() => batches({ candidates: [rawCandidate] })),
    enrichCandidate: jest.fn().mockResolvedValue(rawCandidate),
    chatCandidate: jest.fn().mockResolvedValue({
      success: true,
      browserTrace: { action: 'chat', candidateId: 'candidate-1' },
    }),
    collectCandidate: jest.fn().mockResolvedValue({
      success: true,
      browserTrace: { action: 'collect', candidateId: 'candidate-1' },
    }),
    close: jest.fn().mockResolvedValue(undefined),
  };
}

function makeDependencies(overrides: Record<string, unknown> = {}) {
  const executor = makeExecutor();
  const adapter = makeAdapter(executor);
  const skill = makeSkill();
  const dependencies = {
    adapter,
    executor,
    userId: 'user-1',
    runId: 'run-1',
    jobDescriptionId: 'jd-1',
    platform: 'boss-like' as const,
    getActiveSkill: jest.fn().mockResolvedValue(null),
    exploreSkill: jest.fn().mockResolvedValue(skill),
    createExploredSkill: jest.fn().mockResolvedValue(skill),
    createNextSkillVersion: jest
      .fn()
      .mockImplementation(async ({ steps }) => makeSkill({ id: 'screen-v2', version: 2, steps })),
    updateRun: jest.fn().mockResolvedValue(null),
    createRunEvent: jest.fn().mockResolvedValue(null),
    ...overrides,
  };
  return dependencies;
}

describe('CandidateScreeningWorkflowSession', () => {
  it('explores once, persists v1, and runs the requested browser steps through it', async () => {
    const dependencies = makeDependencies();
    const session = createCandidateScreeningWorkflowSession(dependencies);

    await session.loadOrExplore({ searchPlan, stage: 'searching_live' });
    const result = await collectBatches(
      session.searchCandidates(searchPlan, { maxCandidates: 1, batchSize: 1 }),
    );

    expect(result).toEqual([{ candidates: [rawCandidate] }]);
    expect(dependencies.getActiveSkill).toHaveBeenCalledWith({
      name: 'screen_candidates',
      platform: 'boss-like',
    });
    expect(dependencies.createExploredSkill).toHaveBeenCalledWith(
      expect.objectContaining({ name: 'screen_candidates', version: 1 }),
    );
    expect(dependencies.adapter.loginIfNeeded).toHaveBeenCalledWith(
      expect.objectContaining({
        targets: expect.objectContaining({ loginButton: expect.any(Object) }),
      }),
    );
    expect(dependencies.adapter.searchCandidates).toHaveBeenCalledWith(
      searchPlan,
      { maxCandidates: 1, batchSize: 1, deferEnrichment: true },
      expect.objectContaining({
        targets: expect.objectContaining({ searchSubmit: oldTarget }),
      }),
    );
    expect(dependencies.updateRun).toHaveBeenCalledWith(
      expect.objectContaining({ skillId: 'screen-v1', currentWorkflowStep: 'search_candidates' }),
    );
    expect(dependencies.createRunEvent).toHaveBeenCalledWith(
      expect.objectContaining({
        level: 'info',
        detail: expect.objectContaining({
          workflowStep: 'search_candidates',
          skillId: 'screen-v1',
        }),
      }),
    );
    expect(dependencies.createRunEvent).toHaveBeenCalledWith(
      expect.objectContaining({
        level: 'success',
        detail: expect.objectContaining({
          workflowStep: 'search_candidates',
          skillId: 'screen-v1',
        }),
      }),
    );
  });

  it('passes the injected adapter workflow context to exploration', async () => {
    const skill = makeSkill();
    const exploreSkill = jest.fn().mockResolvedValue(skill);
    const dependencies = makeDependencies({ exploreSkill });
    const context = {
      baseUrl: 'http://boss-like.fixture',
      credentials: {
        username: 'fixture-user',
        password: 'fixture-password',
      },
    };
    Object.assign(dependencies.adapter, {
      getWorkflowExploreContext: jest.fn().mockReturnValue(context),
    });
    const session = createCandidateScreeningWorkflowSession(dependencies);

    await session.loadOrExplore({ searchPlan, stage: 'searching_live' });

    expect(exploreSkill).toHaveBeenCalledWith({
      adapter: dependencies.adapter,
      searchPlan,
      ...context,
    });
  });

  it('reuses the active screening workflow without exploring again', async () => {
    const skill = makeSkill();
    const dependencies = makeDependencies({ getActiveSkill: jest.fn().mockResolvedValue(skill) });
    const session = createCandidateScreeningWorkflowSession(dependencies);

    await session.loadOrExplore({ searchPlan, stage: 'searching_live' });
    await session.loadOrExplore({ searchPlan, stage: 'searching_live' });

    expect(dependencies.exploreSkill).not.toHaveBeenCalled();
    expect(dependencies.createExploredSkill).not.toHaveBeenCalled();
    expect(dependencies.getActiveSkill).toHaveBeenCalledTimes(1);
    expect(session.skill).toEqual(skill);
  });

  it('loads an exact stored workflow version without consulting the active workflow', async () => {
    const skill = makeSkill({ id: 'screen-v3', version: 3, isActive: false });
    const getSkillById = jest.fn().mockResolvedValue(skill);
    const dependencies = makeDependencies({ getSkillById });
    const session = createCandidateScreeningWorkflowSession(dependencies);

    await expect(
      session.loadExact({ skillId: 'screen-v3', stage: 'executing_actions' }),
    ).resolves.toEqual(skill);

    expect(getSkillById).toHaveBeenCalledWith('screen-v3');
    expect(dependencies.getActiveSkill).not.toHaveBeenCalled();
    expect(dependencies.exploreSkill).not.toHaveBeenCalled();
    expect(dependencies.createExploredSkill).not.toHaveBeenCalled();
    expect(dependencies.adapter.loginIfNeeded).toHaveBeenCalledTimes(1);
    expect(session.skill).toEqual(skill);
  });

  it('fails missing stored workflows without falling back to exploration or the active version', async () => {
    const getSkillById = jest.fn().mockResolvedValue(null);
    const dependencies = makeDependencies({ getSkillById });
    const session = createCandidateScreeningWorkflowSession(dependencies);

    await expect(
      session.loadExact({ skillId: 'screen-missing', stage: 'executing_actions' }),
    ).rejects.toThrow('screening workflow skill not found: screen-missing');

    expect(getSkillById).toHaveBeenCalledWith('screen-missing');
    expect(dependencies.getActiveSkill).not.toHaveBeenCalled();
    expect(dependencies.exploreSkill).not.toHaveBeenCalled();
    expect(dependencies.createExploredSkill).not.toHaveBeenCalled();
    expect(dependencies.adapter.loginIfNeeded).not.toHaveBeenCalled();
  });

  it('defers a short resume to enrich_candidate, repairs a drifted detail target once, and yields the enriched candidate', async () => {
    const skill = makeSkill();
    const dependencies = makeDependencies({ getActiveSkill: jest.fn().mockResolvedValue(skill) });
    const oldDetailTarget = workflowTarget(skill, 'enrich_candidate', 'detailContent');
    dependencies.adapter.searchCandidates.mockImplementationOnce(() =>
      batches({ candidates: [shortResumeCandidate] }),
    );
    dependencies.adapter.enrichCandidate
      .mockRejectedValueOnce(
        new CandidateAdapterTargetError({
          result: {
            success: false,
            error: `not_found_target: ${oldDetailTarget.name}`,
          },
          target: oldDetailTarget,
          targetKey: 'detailContent',
        }),
      )
      .mockResolvedValueOnce(enrichedCandidate);
    dependencies.executor.snapshotStructured.mockResolvedValue(repairedDetailSnapshot);
    dependencies.executor.resolveTarget.mockResolvedValue(uniqueTargetReport(repairedDetailTarget));
    const session = createCandidateScreeningWorkflowSession(dependencies);

    const result = await collectBatches(
      session.searchCandidates(searchPlan, { maxCandidates: 1, batchSize: 1 }),
    );

    expect(result).toEqual([{ candidates: [enrichedCandidate] }]);
    expect(dependencies.adapter.searchCandidates).toHaveBeenCalledWith(
      searchPlan,
      { maxCandidates: 1, batchSize: 1, deferEnrichment: true },
      expect.objectContaining({
        targets: expect.objectContaining({ searchSubmit: oldTarget }),
      }),
    );
    expect(dependencies.createNextSkillVersion).toHaveBeenCalledWith(
      expect.objectContaining({
        previousSkill: expect.objectContaining({ id: 'screen-v1' }),
        steps: expect.arrayContaining([
          expect.objectContaining({
            id: 'enrich_candidate',
            params: expect.objectContaining({
              targets: expect.objectContaining({
                detailContent: expect.objectContaining({
                  name: repairedDetailTarget.name,
                  stableAttrs: expect.objectContaining(repairedDetailTarget.stableAttrs),
                }),
              }),
            }),
          }),
        ]),
        meta: expect.objectContaining({
          failed_step_id: 'enrich_candidate',
          repaired_from_skill_id: 'screen-v1',
        }),
      }),
    );
    expect(dependencies.executor.resolveTarget).toHaveBeenCalledWith(
      expect.objectContaining({
        name: repairedDetailTarget.name,
        stableAttrs: expect.objectContaining(repairedDetailTarget.stableAttrs),
      }),
      expect.objectContaining({ action: 'wait_for_text' }),
    );
    expect(dependencies.adapter.enrichCandidate).toHaveBeenCalledTimes(2);
    expect(dependencies.adapter.enrichCandidate).toHaveBeenNthCalledWith(
      2,
      shortResumeCandidate,
      expect.objectContaining({
        targets: expect.objectContaining({
          detailContent: expect.objectContaining({ name: repairedDetailTarget.name }),
        }),
      }),
    );
  });

  it('repairs one unique failed target, persists v2, and retries the step exactly once', async () => {
    const skill = makeSkill();
    const dependencies = makeDependencies({ getActiveSkill: jest.fn().mockResolvedValue(skill) });
    dependencies.adapter.searchCandidates
      .mockImplementationOnce(() => {
        throw browserTargetError('search_candidates', 'searchSubmit', oldTarget);
      })
      .mockImplementationOnce(() => batches({ candidates: [rawCandidate] }));
    dependencies.executor.snapshotStructured.mockResolvedValue(repairedListSnapshot);
    dependencies.executor.resolveTarget.mockResolvedValue(uniqueTargetReport(repairedTarget));
    const session = createCandidateScreeningWorkflowSession(dependencies);

    await collectBatches(session.searchCandidates(searchPlan, { maxCandidates: 1, batchSize: 1 }));

    expect(dependencies.createNextSkillVersion).toHaveBeenCalledWith(
      expect.objectContaining({
        previousSkill: expect.objectContaining({ id: 'screen-v1' }),
        steps: expect.arrayContaining([
          expect.objectContaining({
            id: 'search_candidates',
            params: expect.objectContaining({
              targets: expect.objectContaining({
                searchSubmit: expect.objectContaining({
                  name: repairedTarget.name,
                  stableAttrs: expect.objectContaining(repairedTarget.stableAttrs),
                }),
              }),
            }),
          }),
        ]),
        meta: expect.objectContaining({
          repaired_from_skill_id: 'screen-v1',
          repaired_from_version: 1,
          failed_step_id: 'search_candidates',
        }),
      }),
    );
    expect(dependencies.updateRun).toHaveBeenCalledWith(
      expect.objectContaining({ skillId: 'screen-v2' }),
    );
    expect(dependencies.executor.resolveTarget).toHaveBeenCalledWith(
      expect.objectContaining({
        name: repairedTarget.name,
        stableAttrs: expect.objectContaining(repairedTarget.stableAttrs),
      }),
      expect.objectContaining({ action: 'click' }),
    );
    expect(dependencies.executor.resolveTarget).not.toHaveBeenCalledWith(
      oldTarget,
      expect.anything(),
    );
    expect(dependencies.adapter.searchCandidates).toHaveBeenCalledTimes(2);
    expect(dependencies.createRunEvent).toHaveBeenCalledWith(
      expect.objectContaining({
        detail: {
          workflowStep: 'search_candidates',
          skillId: 'screen-v2',
          previousSkillId: 'screen-v1',
          repair: true,
        },
      }),
    );
    expect(dependencies.createRunEvent).toHaveBeenCalledWith(
      expect.objectContaining({
        detail: expect.objectContaining({
          workflowStep: 'search_candidates',
          skillId: 'screen-v2',
          retry: true,
        }),
      }),
    );
  });

  it('does not repair or retry an ambiguous target failure', async () => {
    const skill = makeSkill();
    const dependencies = makeDependencies({ getActiveSkill: jest.fn().mockResolvedValue(skill) });
    dependencies.adapter.searchCandidates.mockImplementationOnce(() => {
      throw browserTargetError('search_candidates', 'searchSubmit', oldTarget);
    });
    dependencies.executor.resolveTarget.mockResolvedValue(ambiguousTargetReport(oldTarget));
    const session = createCandidateScreeningWorkflowSession(dependencies);

    await expect(
      collectBatches(session.searchCandidates(searchPlan, { maxCandidates: 1, batchSize: 1 })),
    ).rejects.toThrow('ambiguous_target');

    expect(dependencies.createNextSkillVersion).not.toHaveBeenCalled();
    expect(dependencies.adapter.searchCandidates).toHaveBeenCalledTimes(1);
  });

  it('lets a non-target failure escape without a repair attempt', async () => {
    const skill = makeSkill();
    const dependencies = makeDependencies({
      getActiveSkill: jest.fn().mockResolvedValue(skill),
    });
    const failure = new Error('resume list navigation timed out');
    dependencies.adapter.searchCandidates.mockImplementationOnce(() => {
      throw failure;
    });
    const session = createCandidateScreeningWorkflowSession(dependencies);

    await expect(
      collectBatches(session.searchCandidates(searchPlan, { maxCandidates: 1, batchSize: 1 })),
    ).rejects.toBe(failure);

    expect(dependencies.createNextSkillVersion).not.toHaveBeenCalled();
    expect(dependencies.adapter.searchCandidates).toHaveBeenCalledTimes(1);
  });

  it('does not repair or retry an unresolved target failure', async () => {
    const skill = makeSkill();
    const dependencies = makeDependencies({
      getActiveSkill: jest.fn().mockResolvedValue(skill),
    });
    dependencies.adapter.searchCandidates.mockImplementationOnce(() => {
      throw browserTargetError('search_candidates', 'searchSubmit', oldTarget);
    });
    dependencies.executor.resolveTarget.mockResolvedValue({
      ...uniqueTargetReport(oldTarget),
      status: 'not_found',
      candidateCount: 0,
      confidence: 0,
      reason: 'search submit button is no longer present',
    });
    const session = createCandidateScreeningWorkflowSession(dependencies);

    await expect(
      collectBatches(session.searchCandidates(searchPlan, { maxCandidates: 1, batchSize: 1 })),
    ).rejects.toThrow('not_found_target');

    expect(dependencies.createNextSkillVersion).not.toHaveBeenCalled();
    expect(dependencies.adapter.searchCandidates).toHaveBeenCalledTimes(1);
  });

  it('lets a second target failure escape without a second repair attempt', async () => {
    const skill = makeSkill();
    const dependencies = makeDependencies({ getActiveSkill: jest.fn().mockResolvedValue(skill) });
    const retryError = browserTargetError('search_candidates', 'searchSubmit', repairedTarget);
    dependencies.adapter.searchCandidates
      .mockImplementationOnce(() => {
        throw browserTargetError('search_candidates', 'searchSubmit', oldTarget);
      })
      .mockImplementationOnce(() => {
        throw retryError;
      });
    const session = createCandidateScreeningWorkflowSession(dependencies);

    await expect(
      collectBatches(session.searchCandidates(searchPlan, { maxCandidates: 1, batchSize: 1 })),
    ).rejects.toBe(retryError);

    expect(dependencies.createNextSkillVersion).toHaveBeenCalledTimes(1);
    expect(dependencies.adapter.searchCandidates).toHaveBeenCalledTimes(2);
  });

  it('repairs a target failure result from a candidate action and retries it once', async () => {
    const skill = makeSkill();
    const dependencies = makeDependencies({
      getActiveSkill: jest.fn().mockResolvedValue(skill),
    });
    dependencies.adapter.chatCandidate
      .mockResolvedValueOnce({
        success: false,
        error: 'not_found_target: 发送',
        browserTrace: { action: 'chat', candidateId: 'candidate-1' },
        targetError: adapterTargetError({
          target: workflowTarget(skill, 'chat_candidate', 'sendButton'),
          targetKey: 'sendButton',
        }),
      })
      .mockResolvedValueOnce({
        success: true,
        browserTrace: { action: 'chat', candidateId: 'candidate-1' },
      });
    dependencies.executor.snapshotStructured.mockResolvedValue(repairedComposerSnapshot);
    dependencies.executor.resolveTarget.mockResolvedValue(
      uniqueTargetReport(repairedComposerTarget),
    );
    const session = createCandidateScreeningWorkflowSession(dependencies);
    const candidate = { candidateId: 'candidate-1', displayName: 'Ada Lovelace' };
    const actionPlan: CandidateActionPlan = {
      action: 'chat',
      priority: 'high',
      message: 'Hello Ada',
      reason: 'Strong match',
    };

    await session.loadOrExplore({ searchPlan, stage: 'executing_actions' });
    const result = await session.chatCandidate(candidate, actionPlan);

    expect(result.success).toBe(true);
    expect(dependencies.createNextSkillVersion).toHaveBeenCalledTimes(1);
    expect(dependencies.adapter.chatCandidate).toHaveBeenCalledTimes(2);
  });

  it('keeps an ambiguous chat target failure as a candidate action result', async () => {
    const skill = makeSkill();
    const dependencies = makeDependencies({ getActiveSkill: jest.fn().mockResolvedValue(skill) });
    const failedResult = {
      success: false,
      error: 'not_found_target: 发送',
      targetError: adapterTargetError({
        target: workflowTarget(skill, 'chat_candidate', 'sendButton'),
        targetKey: 'sendButton',
      }),
    };
    dependencies.adapter.chatCandidate.mockResolvedValueOnce(failedResult);
    dependencies.executor.snapshotStructured.mockResolvedValue(repairedComposerSnapshot);
    dependencies.executor.resolveTarget.mockResolvedValue(
      ambiguousTargetReport(repairedComposerTarget),
    );
    const session = createCandidateScreeningWorkflowSession(dependencies);
    const candidate = { candidateId: 'candidate-1', displayName: 'Ada Lovelace' };
    const actionPlan: CandidateActionPlan = {
      action: 'chat',
      priority: 'high',
      message: 'Hello Ada',
      reason: 'Strong match',
    };

    await session.loadOrExplore({ searchPlan, stage: 'executing_actions' });
    await expect(session.chatCandidate(candidate, actionPlan)).resolves.toEqual(failedResult);

    expect(dependencies.createNextSkillVersion).not.toHaveBeenCalled();
    expect(dependencies.adapter.chatCandidate).toHaveBeenCalledTimes(1);
  });

  it('fails clearly without retrying or replacing the session skill when repair run persistence fails', async () => {
    const skill = makeSkill();
    const dependencies = makeDependencies({
      getActiveSkill: jest.fn().mockResolvedValue(skill),
      updateRun: jest
        .fn()
        .mockResolvedValueOnce(null)
        .mockResolvedValueOnce(null)
        .mockResolvedValueOnce(null)
        .mockResolvedValueOnce(null)
        .mockRejectedValueOnce(new Error('database unavailable')),
    });
    dependencies.adapter.searchCandidates.mockImplementationOnce(() => {
      throw browserTargetError('search_candidates', 'searchSubmit', oldTarget);
    });
    const session = createCandidateScreeningWorkflowSession(dependencies);

    await expect(
      collectBatches(session.searchCandidates(searchPlan, { maxCandidates: 1, batchSize: 1 })),
    ).rejects.toThrow('screening_workflow_repair_persistence_failed');

    expect(session.skill).toEqual(skill);
    expect(dependencies.adapter.searchCandidates).toHaveBeenCalledTimes(1);
  });

  it('fails clearly without retrying or replacing the session skill when repair event persistence fails', async () => {
    const skill = makeSkill();
    const dependencies = makeDependencies({
      getActiveSkill: jest.fn().mockResolvedValue(skill),
      createRunEvent: jest
        .fn()
        .mockResolvedValueOnce(null)
        .mockResolvedValueOnce(null)
        .mockResolvedValueOnce(null)
        .mockRejectedValueOnce(new Error('event store unavailable')),
    });
    dependencies.adapter.searchCandidates.mockImplementationOnce(() => {
      throw browserTargetError('search_candidates', 'searchSubmit', oldTarget);
    });
    const session = createCandidateScreeningWorkflowSession(dependencies);

    await expect(
      collectBatches(session.searchCandidates(searchPlan, { maxCandidates: 1, batchSize: 1 })),
    ).rejects.toThrow('screening_workflow_repair_persistence_failed');

    expect(session.skill).toEqual(skill);
    expect(dependencies.adapter.searchCandidates).toHaveBeenCalledTimes(1);
  });

  it('routes chat and collect actions with their workflow targets and closes the adapter', async () => {
    const dependencies = makeDependencies({
      getActiveSkill: jest.fn().mockResolvedValue(makeSkill()),
    });
    const session = createCandidateScreeningWorkflowSession(dependencies);
    const candidate = { candidateId: 'candidate-1', displayName: 'Ada Lovelace' };
    const actionPlan: CandidateActionPlan = {
      action: 'chat',
      priority: 'high',
      message: 'Hello Ada',
      reason: 'Strong match',
    };

    await session.loadOrExplore({ searchPlan, stage: 'executing_actions' });
    await session.chatCandidate(candidate, actionPlan);
    await session.collectCandidate(candidate);
    await session.close();

    expect(dependencies.adapter.chatCandidate).toHaveBeenCalledWith(
      candidate,
      actionPlan,
      expect.objectContaining({
        targets: expect.objectContaining({ sendButton: expect.any(Object) }),
      }),
    );
    expect(dependencies.adapter.collectCandidate).toHaveBeenCalledWith(
      candidate,
      expect.objectContaining({
        targets: expect.objectContaining({ collectButton: expect.any(Object) }),
      }),
    );
    expect(dependencies.adapter.close).toHaveBeenCalledTimes(1);
  });
});
