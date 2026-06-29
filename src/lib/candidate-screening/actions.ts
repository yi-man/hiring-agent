import { createHash } from 'node:crypto';
import type {
  CandidateActionPlan,
  CandidateDecisionAction,
  CandidateDecisionPriority,
  CandidateScreeningPlatform,
} from './types';

export type ActionKeyInput = {
  userId: string;
  jobDescriptionId: string;
  candidateId: string;
  platform: CandidateScreeningPlatform;
  action: CandidateDecisionAction;
};

export type DryRunActionInput = {
  action: CandidateDecisionAction;
  priority: CandidateDecisionPriority;
  candidateName: string;
  jobTitle: string;
  reason: string;
};

function sha256(value: string): string {
  return createHash('sha256').update(value).digest('hex');
}

export function createActionIdempotencyKey(input: ActionKeyInput): string {
  return sha256(
    [input.userId, input.jobDescriptionId, input.candidateId, input.platform, input.action].join(
      ':',
    ),
  );
}

export function createDryRunActionPlan(input: DryRunActionInput): CandidateActionPlan {
  if (input.action === 'chat') {
    return {
      action: input.action,
      priority: input.priority,
      message: `你好 ${input.candidateName}，我们正在招聘${input.jobTitle}，看到你的经历和岗位比较匹配，想进一步沟通一下。`,
      reason: input.reason,
    };
  }

  if (input.action === 'collect') {
    return {
      action: input.action,
      priority: input.priority,
      message: null,
      reason: input.reason,
    };
  }

  return {
    action: input.action,
    priority: input.priority,
    message: null,
    reason: input.reason,
  };
}
