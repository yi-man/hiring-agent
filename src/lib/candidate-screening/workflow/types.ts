import type { PublishSkill, TargetDescriptor } from '@/lib/jd-publishing/types';

export const SCREENING_STEP_IDS = {
  searchOpen: 'search_open',
  authRequired: 'auth_required',
  loginFillUsername: 'login_fill_username',
  loginFillPassword: 'login_fill_password',
  loginSubmit: 'login_submit',
  loginWait: 'login_wait',
  searchFill: 'search_fill',
  searchSubmit: 'search_submit',
  searchWait: 'search_wait',
  searchObserve: 'search_observe',
  searchComplete: 'search_complete',
  detailOpen: 'detail_open',
  detailWait: 'detail_wait',
  detailObserve: 'detail_observe',
  detailComplete: 'detail_complete',
  contactOpen: 'contact_open',
  contactOpenGreeting: 'contact_open_greeting',
  contactFillMessage: 'contact_fill_message',
  contactSend: 'contact_send',
  contactWaitSuccess: 'contact_wait_success',
  collectOpen: 'collect_open',
  collectClick: 'collect_click',
  actionComplete: 'action_complete',
} as const;

export type BossLikeScreeningTargets = {
  username: TargetDescriptor;
  password: TargetDescriptor;
  loginButton: TargetDescriptor;
  searchInput: TargetDescriptor;
  searchSubmit: TargetDescriptor;
  detailContent: TargetDescriptor;
  greetButton: TargetDescriptor;
  messageInput: TargetDescriptor;
  sendButton: TargetDescriptor;
  collectButton: TargetDescriptor;
};

export type ScreeningWorkflowSkill = PublishSkill & { name: 'screen_candidates' };

export type BossLikeScreeningExploration = {
  skill: ScreeningWorkflowSkill;
  firstKeyword: string;
  firstListHtml: string;
};
