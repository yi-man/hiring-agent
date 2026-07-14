import { BROWSER_WORKFLOW_DSL_VERSION, type TargetDescriptor } from '@/lib/jd-publishing/types';
import {
  SCREENING_STEP_IDS,
  type BossLikeScreeningTargets,
  type ScreeningWorkflowSkill,
} from './types';

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
        next: SCREENING_STEP_IDS.searchSubmit,
        onFail: { type: 'fallback_agent', reason: 'search input changed' },
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
        action: 'wait_for_url',
        params: { url: '{{input.searchUrl}}' },
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
        action: 'wait_for_url',
        params: { url: '{{input.profileUrl}}/messages' },
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
