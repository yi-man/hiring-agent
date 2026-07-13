import type { TargetDescriptor } from '@/lib/jd-publishing/types';
import type { BossLikeScreeningTargets, ScreeningWorkflowSkill } from './types';

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

  return {
    id: 'boss-like-screen-candidates',
    name: 'screen_candidates',
    platform: 'boss-like',
    description: 'Screen candidates through the local boss-like employer resume workflow.',
    version: 1,
    isActive: true,
    inputSchema: {
      searchPlan: 'SearchPlan',
      candidate: 'RawCandidate',
      actionPlan: 'CandidateActionPlan',
    },
    variables: {},
    steps: [
      {
        id: 'ensure_login',
        type: 'action',
        action: 'ensure_login',
        params: {
          targets: {
            username: targets.username,
            password: targets.password,
            loginButton: targets.loginButton,
          },
        },
        next: 'search_candidates',
        onFail: { type: 'fallback_agent', reason: 'cannot ensure employer login' },
      },
      {
        id: 'search_candidates',
        type: 'action',
        action: 'search_candidates',
        params: {
          targets: {
            searchInput: targets.searchInput,
            searchSubmit: targets.searchSubmit,
          },
        },
        next: 'enrich_candidate',
        onFail: { type: 'fallback_agent', reason: 'cannot search candidates' },
      },
      {
        id: 'enrich_candidate',
        type: 'action',
        action: 'enrich_candidate',
        params: { targets: { detailContent: targets.detailContent } },
        next: 'chat_candidate',
        onFail: { type: 'fallback_agent', reason: 'cannot enrich candidate profile' },
      },
      {
        id: 'chat_candidate',
        type: 'action',
        action: 'chat_candidate',
        params: {
          targets: {
            greetButton: targets.greetButton,
            messageInput: targets.messageInput,
            sendButton: targets.sendButton,
          },
        },
        next: 'collect_candidate',
        onFail: { type: 'fallback_agent', reason: 'cannot send candidate greeting' },
      },
      {
        id: 'collect_candidate',
        type: 'action',
        action: 'collect_candidate',
        params: { targets: { collectButton: targets.collectButton } },
        next: 'done',
        onFail: { type: 'fallback_agent', reason: 'cannot collect candidate' },
      },
      { id: 'done', type: 'end' },
    ],
    ...overrides,
  };
}
