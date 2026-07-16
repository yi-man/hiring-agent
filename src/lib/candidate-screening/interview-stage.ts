import type { CandidateInterviewFeedbackDto } from './repo';
import type { CandidateInterviewFeedbackStage, CandidateInterviewStage } from './types';

const baseTransitions: Record<CandidateInterviewStage, readonly CandidateInterviewStage[]> = {
  sourced: ['screened', 'withdrawn'],
  screened: ['to_contact', 'collected', 'rejected', 'withdrawn'],
  to_contact: ['collected', 'contacted', 'rejected', 'withdrawn'],
  collected: ['contacted', 'rejected', 'withdrawn'],
  contacted: ['replied', 'rejected', 'withdrawn'],
  replied: ['phone_screen', 'rejected', 'withdrawn'],
  phone_screen: ['interviewing', 'rejected', 'withdrawn'],
  interviewing: ['interview_completed', 'rejected', 'withdrawn'],
  interview_completed: ['offer', 'rejected', 'withdrawn'],
  offer: ['withdrawn'],
  rejected: [],
  withdrawn: [],
};

const stageLabels: Record<CandidateInterviewStage, string> = {
  sourced: '已发现',
  screened: '已筛选',
  to_contact: '待联系',
  collected: '已收藏',
  contacted: '已联系',
  replied: '已回复',
  phone_screen: '电话沟通',
  interviewing: '面试中',
  interview_completed: '面试完成',
  offer: 'Offer 阶段',
  rejected: '已淘汰',
  withdrawn: '已退出',
};

const formalInterviewStages = ['first_interview', 'second_interview', 'final_interview'] as const;

const feedbackStageLabels: Record<CandidateInterviewFeedbackStage, string> = {
  phone_screen: '电话沟通',
  first_interview: '一面',
  second_interview: '二面',
  final_interview: '终面',
};

function hasPassedFeedback(
  feedbacks: CandidateInterviewFeedbackDto[],
  stage: CandidateInterviewFeedbackDto['stage'],
) {
  return feedbacks.some((feedback) => feedback.stage === stage && feedback.decision === 'pass');
}

function evidenceAllowsTransition(
  current: CandidateInterviewStage,
  next: CandidateInterviewStage,
  feedbacks: CandidateInterviewFeedbackDto[],
) {
  if (current === 'phone_screen' && next === 'interviewing') {
    return hasPassedFeedback(feedbacks, 'phone_screen');
  }
  if (current === 'interviewing' && next === 'interview_completed') {
    return formalInterviewStages.every((stage) => hasPassedFeedback(feedbacks, stage));
  }
  return true;
}

export function getAllowedCandidateInterviewStageTransitions(
  current: CandidateInterviewStage,
  feedbacks: CandidateInterviewFeedbackDto[],
): CandidateInterviewStage[] {
  return baseTransitions[current].filter((next) =>
    evidenceAllowsTransition(current, next, feedbacks),
  );
}

export function validateCandidateInterviewStageTransition(
  current: CandidateInterviewStage,
  next: CandidateInterviewStage,
  feedbacks: CandidateInterviewFeedbackDto[],
): { ok: true } | { ok: false; error: string } {
  if (current === next) return { ok: true };
  if (!baseTransitions[current].includes(next)) {
    return {
      ok: false,
      error: `不能从“${stageLabels[current]}”直接推进到“${stageLabels[next]}”`,
    };
  }
  if (current === 'phone_screen' && next === 'interviewing') {
    if (!hasPassedFeedback(feedbacks, 'phone_screen')) {
      return { ok: false, error: '电话沟通评价通过后才能进入面试中' };
    }
  }
  if (current === 'interviewing' && next === 'interview_completed') {
    if (!formalInterviewStages.every((stage) => hasPassedFeedback(feedbacks, stage))) {
      return { ok: false, error: '一面、二面和终面均评价通过后才能完成面试' };
    }
  }
  return { ok: true };
}

export function validateCandidateInterviewFeedbackStage(
  current: CandidateInterviewStage,
  stage: CandidateInterviewFeedbackStage,
  feedbacks: CandidateInterviewFeedbackDto[],
): { ok: true } | { ok: false; error: string } {
  if (feedbacks.some((feedback) => feedback.stage === stage)) return { ok: true };

  if (current === 'phone_screen') {
    return stage === 'phone_screen'
      ? { ok: true }
      : { ok: false, error: '当前应先完成电话沟通评价' };
  }

  if (current === 'interviewing') {
    const completed = new Set(feedbacks.map((feedback) => feedback.stage));
    const pendingStage = (['phone_screen', ...formalInterviewStages] as const).find(
      (candidateStage) => !completed.has(candidateStage),
    );
    if (stage === pendingStage) return { ok: true };
    return {
      ok: false,
      error: pendingStage
        ? `当前应先完成${feedbackStageLabels[pendingStage]}评价`
        : '所有面试评价均已完成',
    };
  }

  return {
    ok: false,
    error: `候选人当前处于“${stageLabels[current]}”，不能新增${feedbackStageLabels[stage]}评价`,
  };
}
