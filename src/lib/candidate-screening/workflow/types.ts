import type { PublishSkill, TargetDescriptor } from '@/lib/jd-publishing/types';

export type { ScreeningWorkflowAction } from '@/lib/jd-publishing/types';

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
