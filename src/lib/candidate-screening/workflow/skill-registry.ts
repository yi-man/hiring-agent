import {
  BROWSER_WORKFLOW_DSL_VERSION,
  type PublishSkill,
  type PublishStep,
  type TargetDescriptor,
} from '@/lib/jd-publishing/types';
import {
  SCREENING_STEP_IDS,
  type BossLikeScreeningTargets,
  type ScreeningWorkflowSkill,
} from './types';
import type { RecruitmentPlatform } from '@/lib/recruitment-platforms';

function fieldTarget(name: string): TargetDescriptor {
  return {
    kind: 'field',
    role: 'textbox',
    name,
    exact: true,
  };
}

function buttonTarget(name: string): TargetDescriptor {
  return {
    kind: 'button',
    role: 'button',
    name,
    exact: true,
  };
}

function actionStep(
  skill: PublishSkill,
  stepId: string,
): Extract<PublishStep, { type: 'action' }> | null {
  return (
    skill.steps.find(
      (step): step is Extract<PublishStep, { type: 'action' }> =>
        step.id === stepId && step.type === 'action',
    ) ?? null
  );
}

function conditionStep(
  skill: PublishSkill,
  stepId: string,
): Extract<PublishStep, { type: 'condition' }> | null {
  return (
    skill.steps.find(
      (step): step is Extract<PublishStep, { type: 'condition' }> =>
        step.id === stepId && step.type === 'condition',
    ) ?? null
  );
}

function hasEndStep(skill: PublishSkill, stepId: string): boolean {
  return skill.steps.some((step) => step.id === stepId && step.type === 'end');
}

function hasActionRoute(
  skill: PublishSkill,
  stepId: string,
  action: Extract<PublishStep, { type: 'action' }>['action'],
  next: string,
): boolean {
  const step = actionStep(skill, stepId);
  return step?.action === action && step.next === next;
}

function hasTarget(step: Extract<PublishStep, { type: 'action' }> | null): boolean {
  const target = step?.params.target;
  return (
    typeof target === 'string' ||
    (Boolean(target) &&
      typeof target === 'object' &&
      !Array.isArray(target) &&
      typeof (target as Record<string, unknown>).kind === 'string' &&
      typeof (target as Record<string, unknown>).name === 'string')
  );
}

function hasActionParams(
  skill: PublishSkill,
  stepId: string,
  expected: Record<string, unknown>,
): boolean {
  const step = actionStep(skill, stepId);
  return Boolean(
    step && Object.entries(expected).every(([key, value]) => step.params[key] === value),
  );
}

function hasReadyCheck(
  step: Extract<PublishStep, { type: 'action' }>,
  expected: Record<string, string>,
): boolean {
  const checks = step.params.readyChecks;
  return (
    Array.isArray(checks) &&
    checks.some(
      (check) =>
        check !== null &&
        typeof check === 'object' &&
        Object.entries(expected).every(
          ([key, value]) => (check as Record<string, unknown>)[key] === value,
        ),
    )
  );
}

export function isCompatibleBossLikeScreeningSkill(skill: PublishSkill): boolean {
  if (
    skill.name !== 'screen_candidates' ||
    skill.platform !== 'boss-like' ||
    skill.meta?.dsl_version !== BROWSER_WORKFLOW_DSL_VERSION
  ) {
    return false;
  }

  const searchFill = actionStep(skill, SCREENING_STEP_IDS.searchFill);
  const searchSnapshot = actionStep(skill, SCREENING_STEP_IDS.searchSnapshotBeforeSubmit);
  const searchSubmit = actionStep(skill, SCREENING_STEP_IDS.searchSubmit);
  const searchWait = actionStep(skill, SCREENING_STEP_IDS.searchWait);
  const contactSend = actionStep(skill, SCREENING_STEP_IDS.contactSend);
  const contactWait = actionStep(skill, SCREENING_STEP_IDS.contactWaitSuccess);

  const requiredActionRoutes = [
    [SCREENING_STEP_IDS.searchOpen, 'navigate', SCREENING_STEP_IDS.authRequired],
    [SCREENING_STEP_IDS.loginFillUsername, 'fill', SCREENING_STEP_IDS.loginFillPassword],
    [SCREENING_STEP_IDS.loginFillPassword, 'fill', SCREENING_STEP_IDS.loginSubmit],
    [SCREENING_STEP_IDS.loginSubmit, 'click', SCREENING_STEP_IDS.loginWait],
    [SCREENING_STEP_IDS.loginWait, 'wait_for_url', SCREENING_STEP_IDS.searchFill],
    [SCREENING_STEP_IDS.searchFill, 'fill', SCREENING_STEP_IDS.searchSnapshotBeforeSubmit],
    [SCREENING_STEP_IDS.searchSnapshotBeforeSubmit, 'observe', SCREENING_STEP_IDS.searchSubmit],
    [SCREENING_STEP_IDS.searchSubmit, 'click', SCREENING_STEP_IDS.searchWait],
    [SCREENING_STEP_IDS.searchWait, 'wait_for_snapshot_change', SCREENING_STEP_IDS.searchObserve],
    [SCREENING_STEP_IDS.searchObserve, 'observe', SCREENING_STEP_IDS.searchComplete],
    [SCREENING_STEP_IDS.detailOpen, 'navigate', SCREENING_STEP_IDS.detailWait],
    [SCREENING_STEP_IDS.detailWait, 'wait_for_text', SCREENING_STEP_IDS.detailObserve],
    [SCREENING_STEP_IDS.detailObserve, 'observe', SCREENING_STEP_IDS.detailComplete],
    [SCREENING_STEP_IDS.contactOpen, 'navigate', SCREENING_STEP_IDS.contactOpenGreeting],
    [SCREENING_STEP_IDS.contactOpenGreeting, 'click', SCREENING_STEP_IDS.contactFillMessage],
    [SCREENING_STEP_IDS.contactFillMessage, 'fill', SCREENING_STEP_IDS.contactSend],
    [SCREENING_STEP_IDS.contactSend, 'click', SCREENING_STEP_IDS.contactWaitSuccess],
    [SCREENING_STEP_IDS.contactWaitSuccess, 'wait_for_text', SCREENING_STEP_IDS.collectOpen],
    [SCREENING_STEP_IDS.collectOpen, 'navigate', SCREENING_STEP_IDS.collectClick],
    [SCREENING_STEP_IDS.collectClick, 'click', SCREENING_STEP_IDS.actionComplete],
  ] as const;
  if (
    !requiredActionRoutes.every(([stepId, action, next]) =>
      hasActionRoute(skill, stepId, action, next),
    ) ||
    ![
      SCREENING_STEP_IDS.searchComplete,
      SCREENING_STEP_IDS.detailComplete,
      SCREENING_STEP_IDS.actionComplete,
    ].every((stepId) => hasEndStep(skill, stepId))
  ) {
    return false;
  }

  const authRequired = conditionStep(skill, SCREENING_STEP_IDS.authRequired);
  if (
    authRequired?.check.type !== 'url_contains' ||
    authRequired.check.text !== '/login' ||
    authRequired.ifTrue?.next !== SCREENING_STEP_IDS.loginFillUsername ||
    authRequired.ifFalse?.next !== SCREENING_STEP_IDS.searchFill
  ) {
    return false;
  }

  const targetStepIds = [
    SCREENING_STEP_IDS.loginFillUsername,
    SCREENING_STEP_IDS.loginFillPassword,
    SCREENING_STEP_IDS.loginSubmit,
    SCREENING_STEP_IDS.searchFill,
    SCREENING_STEP_IDS.searchSubmit,
    SCREENING_STEP_IDS.contactOpenGreeting,
    SCREENING_STEP_IDS.contactFillMessage,
    SCREENING_STEP_IDS.contactSend,
    SCREENING_STEP_IDS.collectClick,
  ];
  if (!targetStepIds.every((stepId) => hasTarget(actionStep(skill, stepId)))) return false;

  const requiredInputSchema = ['baseUrl', 'keyword', 'searchUrl', 'profileUrl', 'message'];
  if (!requiredInputSchema.every((key) => skill.inputSchema[key] === 'string')) return false;
  if (
    !hasActionParams(skill, SCREENING_STEP_IDS.searchOpen, {
      url: '{{input.baseUrl}}/employer/resumes',
    }) ||
    !hasActionParams(skill, SCREENING_STEP_IDS.loginFillUsername, {
      value: '{{credentials.username}}',
    }) ||
    !hasActionParams(skill, SCREENING_STEP_IDS.loginFillPassword, {
      value: '{{credentials.password}}',
    }) ||
    !hasActionParams(skill, SCREENING_STEP_IDS.loginWait, {
      url: '{{input.baseUrl}}/employer/resumes',
    }) ||
    !hasActionParams(skill, SCREENING_STEP_IDS.searchFill, { value: '{{input.keyword}}' }) ||
    !hasActionParams(skill, SCREENING_STEP_IDS.searchSnapshotBeforeSubmit, {
      format: 'html',
      saveAs: 'previousListHtml',
    }) ||
    !hasActionParams(skill, SCREENING_STEP_IDS.searchObserve, {
      format: 'html',
      saveAs: 'listHtml',
    }) ||
    !hasActionParams(skill, SCREENING_STEP_IDS.detailOpen, { url: '{{input.profileUrl}}' }) ||
    !hasActionParams(skill, SCREENING_STEP_IDS.detailObserve, {
      format: 'html',
      saveAs: 'profileHtml',
    }) ||
    !hasActionParams(skill, SCREENING_STEP_IDS.contactOpen, { url: '{{input.profileUrl}}' }) ||
    !hasActionParams(skill, SCREENING_STEP_IDS.contactFillMessage, {
      value: '{{input.message}}',
    }) ||
    !hasActionParams(skill, SCREENING_STEP_IDS.collectOpen, { url: '{{input.profileUrl}}' })
  ) {
    return false;
  }

  const detailWaitText = actionStep(skill, SCREENING_STEP_IDS.detailWait)?.params.text;
  if (typeof detailWaitText !== 'string' || !detailWaitText.trim()) return false;

  return Boolean(
    searchFill?.action === 'fill' &&
    searchFill.next === SCREENING_STEP_IDS.searchSnapshotBeforeSubmit &&
    searchSnapshot?.action === 'observe' &&
    searchSnapshot.params.saveAs === 'previousListHtml' &&
    searchSnapshot.next === SCREENING_STEP_IDS.searchSubmit &&
    searchSubmit?.action === 'click' &&
    searchSubmit.next === SCREENING_STEP_IDS.searchWait &&
    searchWait?.action === 'wait_for_snapshot_change' &&
    searchWait.params.previousObservationKey === 'previousListHtml' &&
    searchWait.params.previousUrl === '{{input.baseUrl}}/employer/resumes' &&
    hasReadyCheck(searchWait, {
      type: 'dom_exists',
      selector: 'article[data-candidate-id]',
    }) &&
    hasReadyCheck(searchWait, { type: 'text_contains', text: '暂无简历数据' }) &&
    contactSend?.action === 'click' &&
    contactSend.next === SCREENING_STEP_IDS.contactWaitSuccess &&
    contactWait?.action === 'wait_for_text' &&
    contactWait.params.text === '消息已发送' &&
    contactWait.next === SCREENING_STEP_IDS.collectOpen &&
    actionStep(skill, SCREENING_STEP_IDS.searchObserve)?.params.saveAs === 'listHtml' &&
    actionStep(skill, SCREENING_STEP_IDS.detailObserve)?.params.saveAs === 'profileHtml' &&
    actionStep(skill, SCREENING_STEP_IDS.contactFillMessage)?.params.value === '{{input.message}}',
  );
}

export function defaultBossLikeScreeningTargets(): BossLikeScreeningTargets {
  return {
    username: fieldTarget('用户名'),
    password: fieldTarget('密码'),
    loginButton: buttonTarget('登录'),
    searchInput: fieldTarget('搜索候选人'),
    searchSubmit: buttonTarget('搜索'),
    detailContent: { kind: 'text', name: '候选人详情', exact: true },
    greetButton: buttonTarget('打招呼'),
    messageInput: fieldTarget('消息'),
    sendButton: buttonTarget('发送'),
    collectButton: buttonTarget('收藏'),
  };
}

export function buildBossLikeScreeningSkill(
  overrides: Partial<ScreeningWorkflowSkill> = {},
  targetOverrides: Partial<BossLikeScreeningTargets> = {},
): ScreeningWorkflowSkill {
  const targets = { ...defaultBossLikeScreeningTargets(), ...targetOverrides };
  const { meta: metaOverrides, ...skillOverrides } = overrides;

  return {
    id: 'boss-like-screen-candidates',
    name: 'screen_candidates',
    platform: 'boss-like',
    description: 'Screen candidates through the local boss-like employer resume workflow.',
    version: 1,
    isActive: true,
    inputSchema: {
      baseUrl: 'string',
      keyword: 'string',
      searchUrl: 'string',
      profileUrl: 'string',
      message: 'string',
    },
    variables: {},
    steps: [
      {
        id: SCREENING_STEP_IDS.searchOpen,
        type: 'action',
        action: 'navigate',
        params: { url: '{{input.baseUrl}}/employer/resumes' },
        next: SCREENING_STEP_IDS.authRequired,
      },
      {
        id: SCREENING_STEP_IDS.authRequired,
        type: 'condition',
        check: { type: 'url_contains', text: '/login' },
        ifTrue: { next: SCREENING_STEP_IDS.loginFillUsername },
        ifFalse: { next: SCREENING_STEP_IDS.searchFill },
      },
      {
        id: SCREENING_STEP_IDS.loginFillUsername,
        type: 'action',
        action: 'fill',
        params: { target: targets.username, value: '{{credentials.username}}' },
        next: SCREENING_STEP_IDS.loginFillPassword,
        onFail: { type: 'fallback_agent', reason: 'username input changed' },
      },
      {
        id: SCREENING_STEP_IDS.loginFillPassword,
        type: 'action',
        action: 'fill',
        params: { target: targets.password, value: '{{credentials.password}}' },
        next: SCREENING_STEP_IDS.loginSubmit,
        onFail: { type: 'fallback_agent', reason: 'password input changed' },
      },
      {
        id: SCREENING_STEP_IDS.loginSubmit,
        type: 'action',
        action: 'click',
        params: { target: targets.loginButton },
        next: SCREENING_STEP_IDS.loginWait,
        onFail: { type: 'fallback_agent', reason: 'login button changed' },
      },
      {
        id: SCREENING_STEP_IDS.loginWait,
        type: 'action',
        action: 'wait_for_url',
        params: { url: '{{input.baseUrl}}/employer/resumes' },
        next: SCREENING_STEP_IDS.searchFill,
      },
      {
        id: SCREENING_STEP_IDS.searchFill,
        type: 'action',
        action: 'fill',
        params: { target: targets.searchInput, value: '{{input.keyword}}' },
        next: SCREENING_STEP_IDS.searchSnapshotBeforeSubmit,
        onFail: { type: 'fallback_agent', reason: 'search input changed' },
      },
      {
        id: SCREENING_STEP_IDS.searchSnapshotBeforeSubmit,
        type: 'action',
        action: 'observe',
        params: { format: 'html', saveAs: 'previousListHtml' },
        next: SCREENING_STEP_IDS.searchSubmit,
      },
      {
        id: SCREENING_STEP_IDS.searchSubmit,
        type: 'action',
        action: 'click',
        params: { target: targets.searchSubmit },
        next: SCREENING_STEP_IDS.searchWait,
        onFail: { type: 'fallback_agent', reason: 'search submit changed' },
      },
      {
        id: SCREENING_STEP_IDS.searchWait,
        type: 'action',
        action: 'wait_for_snapshot_change',
        params: {
          previousObservationKey: 'previousListHtml',
          previousUrl: '{{input.baseUrl}}/employer/resumes',
          readyChecks: [
            { type: 'dom_exists', selector: 'article[data-candidate-id]', timeout: 10_000 },
            { type: 'text_contains', text: '暂无简历数据', timeout: 10_000 },
          ],
        },
        next: SCREENING_STEP_IDS.searchObserve,
      },
      {
        id: SCREENING_STEP_IDS.searchObserve,
        type: 'action',
        action: 'observe',
        params: { format: 'html', saveAs: 'listHtml' },
        next: SCREENING_STEP_IDS.searchComplete,
      },
      { id: SCREENING_STEP_IDS.searchComplete, type: 'end' },
      {
        id: SCREENING_STEP_IDS.detailOpen,
        type: 'action',
        action: 'navigate',
        params: { url: '{{input.profileUrl}}' },
        next: SCREENING_STEP_IDS.detailWait,
      },
      {
        id: SCREENING_STEP_IDS.detailWait,
        type: 'action',
        action: 'wait_for_text',
        params: { text: targets.detailContent.name },
        next: SCREENING_STEP_IDS.detailObserve,
      },
      {
        id: SCREENING_STEP_IDS.detailObserve,
        type: 'action',
        action: 'observe',
        params: { format: 'html', saveAs: 'profileHtml' },
        next: SCREENING_STEP_IDS.detailComplete,
      },
      { id: SCREENING_STEP_IDS.detailComplete, type: 'end' },
      {
        id: SCREENING_STEP_IDS.contactOpen,
        type: 'action',
        action: 'navigate',
        params: { url: '{{input.profileUrl}}' },
        next: SCREENING_STEP_IDS.contactOpenGreeting,
      },
      {
        id: SCREENING_STEP_IDS.contactOpenGreeting,
        type: 'action',
        action: 'click',
        params: { target: targets.greetButton },
        next: SCREENING_STEP_IDS.contactFillMessage,
        onFail: { type: 'fallback_agent', reason: 'greeting button changed' },
      },
      {
        id: SCREENING_STEP_IDS.contactFillMessage,
        type: 'action',
        action: 'fill',
        params: { target: targets.messageInput, value: '{{input.message}}' },
        next: SCREENING_STEP_IDS.contactSend,
        onFail: { type: 'fallback_agent', reason: 'message input changed' },
      },
      {
        id: SCREENING_STEP_IDS.contactSend,
        type: 'action',
        action: 'click',
        params: { target: targets.sendButton },
        next: SCREENING_STEP_IDS.contactWaitSuccess,
        onFail: { type: 'fallback_agent', reason: 'send button changed' },
      },
      {
        id: SCREENING_STEP_IDS.contactWaitSuccess,
        type: 'action',
        action: 'wait_for_text',
        params: { text: '消息已发送' },
        next: SCREENING_STEP_IDS.collectOpen,
      },
      {
        id: SCREENING_STEP_IDS.collectOpen,
        type: 'action',
        action: 'navigate',
        params: { url: '{{input.profileUrl}}' },
        next: SCREENING_STEP_IDS.collectClick,
      },
      {
        id: SCREENING_STEP_IDS.collectClick,
        type: 'action',
        action: 'click',
        params: { target: targets.collectButton },
        next: SCREENING_STEP_IDS.actionComplete,
        onFail: { type: 'fallback_agent', reason: 'collect button changed' },
      },
      { id: SCREENING_STEP_IDS.actionComplete, type: 'end' },
    ],
    meta: {
      success_rate: 0,
      usage_count: 0,
      ...metaOverrides,
      dsl_version: BROWSER_WORKFLOW_DSL_VERSION,
      created_from: 'explore',
    },
    ...skillOverrides,
  };
}

type PlatformScreeningConfig = {
  platform: Exclude<RecruitmentPlatform, 'boss-like'>;
  targets: Partial<BossLikeScreeningTargets>;
  candidateSelector: string;
  emptyText: string;
  description: string;
};

function buildPlatformScreeningSkill(config: PlatformScreeningConfig): ScreeningWorkflowSkill {
  const base = buildBossLikeScreeningSkill(
    {
      id: `${config.platform}-screen-candidates`,
      platform: config.platform,
      description: config.description,
    },
    config.targets,
  );
  return {
    ...base,
    steps: base.steps.map((step) => {
      if (step.id === SCREENING_STEP_IDS.searchOpen && step.type === 'action') {
        return { ...step, params: { ...step.params, url: '{{input.searchUrl}}' } };
      }
      if (step.id === SCREENING_STEP_IDS.loginWait && step.type === 'action') {
        return { ...step, params: { ...step.params, url: '{{input.searchUrl}}' } };
      }
      if (step.id === SCREENING_STEP_IDS.searchWait && step.type === 'action') {
        return {
          ...step,
          params: {
            ...step.params,
            previousUrl: '{{input.searchUrl}}',
            readyChecks: [
              { type: 'dom_exists', selector: config.candidateSelector, timeout: 10_000 },
              { type: 'text_contains', text: config.emptyText, timeout: 10_000 },
            ],
          },
        };
      }
      return step;
    }),
  };
}

export const bossScreeningSkill = buildPlatformScreeningSkill({
  platform: 'boss',
  description: 'Search, inspect, greet and collect candidates in the BOSS enterprise workflow.',
  candidateSelector: '[data-geek-id], .candidate-card, .geek-card',
  emptyText: '暂无牛人',
  targets: {
    username: fieldTarget('手机号'),
    searchInput: fieldTarget('搜索牛人'),
    searchSubmit: buttonTarget('搜索'),
    detailContent: { kind: 'text', name: '牛人详情' },
    greetButton: buttonTarget('打招呼'),
    messageInput: fieldTarget('输入消息'),
    sendButton: buttonTarget('发送'),
    collectButton: buttonTarget('收藏'),
  },
});

export const liepinScreeningSkill = buildPlatformScreeningSkill({
  platform: 'liepin',
  description: 'Search, inspect, message and save candidates in the Liepin enterprise workflow.',
  candidateSelector: '[data-resume-id], .resume-card, .talent-card',
  emptyText: '暂无人才',
  targets: {
    username: fieldTarget('账号/手机号'),
    searchInput: fieldTarget('搜索人才'),
    searchSubmit: buttonTarget('搜索人才'),
    detailContent: { kind: 'text', name: '人才详情' },
    greetButton: buttonTarget('立即沟通'),
    messageInput: fieldTarget('请输入沟通内容'),
    sendButton: buttonTarget('发送消息'),
    collectButton: buttonTarget('加入收藏'),
  },
});

export const zhilianScreeningSkill = buildPlatformScreeningSkill({
  platform: 'zhilian',
  description: 'Search, inspect, contact and save candidates in the Zhilian enterprise workflow.',
  candidateSelector: '[data-resume-id], .resume-list-item, .talent-item',
  emptyText: '暂无简历',
  targets: {
    username: fieldTarget('用户名/手机号'),
    searchInput: fieldTarget('搜索简历'),
    searchSubmit: buttonTarget('搜索'),
    detailContent: { kind: 'text', name: '简历详情' },
    greetButton: buttonTarget('立即沟通'),
    messageInput: fieldTarget('请输入消息'),
    sendButton: buttonTarget('发送'),
    collectButton: buttonTarget('收藏简历'),
  },
});

const activeScreeningSkills: Record<RecruitmentPlatform, ScreeningWorkflowSkill> = {
  boss: bossScreeningSkill,
  liepin: liepinScreeningSkill,
  zhilian: zhilianScreeningSkill,
  'boss-like': buildBossLikeScreeningSkill(),
};

export function getActiveScreeningSkill(platform: RecruitmentPlatform): ScreeningWorkflowSkill {
  return activeScreeningSkills[platform];
}

export function isCompatibleScreeningSkill(skill: PublishSkill): boolean {
  if (skill.platform === 'boss-like') return isCompatibleBossLikeScreeningSkill(skill);
  const expected = activeScreeningSkills[skill.platform];
  return Boolean(
    expected &&
    skill.name === 'screen_candidates' &&
    skill.meta?.dsl_version === BROWSER_WORKFLOW_DSL_VERSION &&
    skill.steps.some((step) => step.id === SCREENING_STEP_IDS.searchOpen) &&
    skill.steps.some((step) => step.id === SCREENING_STEP_IDS.contactSend) &&
    skill.steps.some((step) => step.id === SCREENING_STEP_IDS.collectClick),
  );
}
